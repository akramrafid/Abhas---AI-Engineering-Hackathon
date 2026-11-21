"""LLMOps tracing tests (@pytest.mark.tracing — required by `gates.mjs traces` / `npm run check:traces`)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.adapters.db.engine import create_db_engine
from app.adapters.db.models import LlmTraceRow
from app.adapters.db.repositories import SqlCallLog
from app.adapters.llm import AnthropicLLM
from app.core.config import API_DIR, Settings
from app.core.logging import request_id_var
from app.observability.metrics import OpsMetrics
from app.observability.pricing import estimate_cost_usd
from app.observability.traces import FanOutSink, LLMCallRecord, MemorySink, SqlLlmTraceSink
from app.ports.llm import BudgetExceededError, LLMUnavailableError


@dataclass
class _FakeUsage:
    input_tokens: int
    output_tokens: int


@dataclass
class _FakeBlock:
    text: str


@dataclass
class _FakeResponse:
    content: list[_FakeBlock]
    usage: _FakeUsage


class _CountingMessagesAPI:
    def __init__(self, outcomes: list[Any]) -> None:
        self._outcomes = list(outcomes)
        self.invocations = 0

    def create(self, **_kwargs: Any) -> Any:
        idx = min(self.invocations, len(self._outcomes) - 1)
        self.invocations += 1
        outcome = self._outcomes[idx]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class _FakeAnthropicClient:
    def __init__(self, outcomes: list[Any]) -> None:
        self.messages = _CountingMessagesAPI(outcomes)

    def close(self) -> None:
        pass


def _sample_user_msg() -> str:
    payload = {
        "ward_id": "DSCC_Ward_07",
        "origin_week": "2025-08-04",
        "horizon": 3,
        "language": "en",
        "expected_cases": 10.4,
    }
    return f"<forecast_data>\n{json.dumps(payload)}\n</forecast_data>"


@pytest.mark.tracing
def test_tracing_records_equal_sdk_invocations_on_success() -> None:
    """Every single SDK invocation produces exactly one LLMCallRecord with tokens, cost, and request_id."""
    valid_json = json.dumps(
        {
            "headline": "DSCC_Ward_07: High risk (10.4 cases)",
            "summary": "Expected 10.4 cases in 3 weeks.",
            "actions": [{"action": "Clear drains", "when": "this week"}],
        }
    )
    fake_client = _FakeAnthropicClient([_FakeResponse([_FakeBlock(valid_json)], _FakeUsage(600, 250))])
    sink = MemorySink()
    ops = OpsMetrics()
    token = request_id_var.set("req-trace-ok-1")
    try:
        llm = AnthropicLLM(
            api_key="test-key",
            model="claude-haiku-5-5",
            trace_sink=sink,
            ops_metrics=ops,
            client=fake_client,
            settings=Settings(app_env="test"),
            retry_base_s=0.0,
        )
        res = llm.complete_json("system prompt", _sample_user_msg(), {}, 400)
        assert res.input_tokens == 600
        assert res.output_tokens == 250
        expected_cost = estimate_cost_usd("claude-haiku-5-5", 600, 250)
        assert expected_cost is not None
        assert res.cost_usd == pytest.approx(expected_cost)

        # Core invariant: trace records == SDK invocations
        assert fake_client.messages.invocations == 1
        assert len(sink.records) == fake_client.messages.invocations
        rec = sink.records[0]
        assert rec.request_id == "req-trace-ok-1"
        assert rec.prompt_version == "v1"
        assert rec.model == "claude-haiku-5-5"
        assert rec.status == "ok"
        assert rec.tokens_in == 600
        assert rec.tokens_out == 250
        assert rec.cost_usd == pytest.approx(expected_cost)
        assert rec.latency_ms >= 0.0
    finally:
        request_id_var.reset(token)


@pytest.mark.tracing
def test_tracing_records_every_retry_and_failure_attempt() -> None:
    """Transient timeouts retry up to 2 times (3 attempts total), tracing every failed SDK call 1:1."""
    fake_client = _FakeAnthropicClient(
        [
            httpx.TimeoutException("t1"),
            httpx.TimeoutException("t2"),
            httpx.TimeoutException("t3"),
        ]
    )
    sink = MemorySink()
    ops = OpsMetrics()
    llm = AnthropicLLM(
        api_key="test-key",
        model="claude-haiku-5-5",
        trace_sink=sink,
        ops_metrics=ops,
        client=fake_client,
        settings=Settings(app_env="test"),
        retry_base_s=0.0,
    )
    with pytest.raises(LLMUnavailableError):
        llm.complete_json("system", _sample_user_msg(), {}, 400)

    assert fake_client.messages.invocations == 3
    assert len(sink.records) == 3
    assert [r.attempt for r in sink.records] == [1, 2, 3]
    assert all(r.status == "timeout" for r in sink.records)
    assert ops.snapshot().llm_errors == 3


@pytest.mark.tracing
def test_tracing_bad_json_runs_one_repair_and_emits_validation_failed() -> None:
    """Malformed JSON triggers exactly 1 repair SDK call and records validation_failed when still broken."""
    fake_client = _FakeAnthropicClient(
        [
            _FakeResponse([_FakeBlock("{broken1")], _FakeUsage(300, 10)),
            _FakeResponse([_FakeBlock("{broken2")], _FakeUsage(350, 12)),
        ]
    )
    sink = MemorySink()
    llm = AnthropicLLM(
        api_key="test-key",
        model="claude-haiku-5-5",
        trace_sink=sink,
        client=fake_client,
        settings=Settings(app_env="test"),
        retry_base_s=0.0,
    )
    with pytest.raises(LLMUnavailableError):
        llm.complete_json("system", _sample_user_msg(), {}, 400)

    assert fake_client.messages.invocations == 2
    sdk_records = [r for r in sink.records if r.status != "validation_failed"]
    val_records = [r for r in sink.records if r.status == "validation_failed"]
    assert len(sdk_records) == fake_client.messages.invocations
    assert len(val_records) == 1
    assert val_records[0].fallback_used is True


@pytest.mark.tracing
def test_tracing_budget_blocked_skips_sdk_and_emits_trace(tmp_path: Path) -> None:
    """NFR-7: When daily spend reaches LLM_DAILY_BUDGET_USD, zero SDK calls run and budget_blocked is traced."""
    db_file = tmp_path / "budget.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    try:
        call_log = SqlCallLog(engine)
        call_log.record("llm", ok=True, latency_ms=200.0, cost_usd=1.00, detail="exhausted")
        fake_client = _FakeAnthropicClient([_FakeResponse([_FakeBlock("{}")], _FakeUsage(10, 10))])
        sink = MemorySink()
        llm = AnthropicLLM(
            api_key="test-key",
            model="claude-haiku-5-5",
            daily_budget_usd=1.0,
            call_log=call_log,
            trace_sink=sink,
            client=fake_client,
            settings=Settings(app_env="test"),
            retry_base_s=0.0,
        )
        with pytest.raises(BudgetExceededError):
            llm.complete_json("system", _sample_user_msg(), {}, 400)

        assert fake_client.messages.invocations == 0
        assert len(sink.records) == 1
        assert sink.records[0].status == "budget_blocked"
        assert sink.records[0].fallback_used is True
    finally:
        engine.dispose()


@pytest.mark.tracing
def test_tracing_pricing_and_sql_sink_resilience(tmp_path: Path) -> None:
    """pricing.json computes exact Haiku cost and returns None for unknown models; SqlLlmTraceSink persists cleanly."""
    cost = estimate_cost_usd("claude-haiku-5-5", 1_000_000, 1_000_000)
    assert cost == pytest.approx(6.0)  # $1/1M in + $5/1M out
    assert estimate_cost_usd("unknown-unpriced-model", 500, 200) is None

    db_file = tmp_path / "traces.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    try:
        sql_sink = SqlLlmTraceSink(engine)
        mem_sink = MemorySink()

        class _BrokenSink:
            def emit(self, rec: LLMCallRecord) -> None:
                raise RuntimeError("sink exploded")

        fanout = FanOutSink(_BrokenSink(), mem_sink, sql_sink)
        rec = LLMCallRecord(
            request_id="req-fanout-1",
            route="/api/v1/advisory",
            feature="advisory",
            prompt_name="advisory",
            prompt_version="v1",
            provider="anthropic",
            model="claude-haiku-5-5",
            attempt=1,
            fallback_used=False,
            status="ok",
            latency_ms=123.4,
            tokens_in=500,
            tokens_out=200,
            cost_usd=0.0015,
            ward_id="DSCC_Ward_07",
        )
        # Broken sink must NEVER prevent other sinks or raise into user request
        fanout.emit(rec)
        assert len(mem_sink.records) == 1
        with engine.connect() as conn:
            count = int(conn.execute(select(func.count()).select_from(LlmTraceRow.__table__)).scalar_one())
        assert count == 1
    finally:
        engine.dispose()
