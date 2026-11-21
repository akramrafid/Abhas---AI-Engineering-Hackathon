"""Structured LLM call tracing: LLMCallRecord and composable TraceSink implementations."""

from __future__ import annotations

import json
import logging
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from threading import RLock
from typing import Any, Protocol

logger = logging.getLogger("abhas.llm.trace")


@dataclass(frozen=True)
class LLMCallRecord:
    request_id: str
    route: str
    feature: str
    prompt_name: str
    prompt_version: str
    provider: str
    model: str
    attempt: int
    fallback_used: bool
    status: str  # ok | error | timeout | refused | budget_blocked | validation_failed
    latency_ms: float
    tokens_in: int | None = None
    tokens_out: int | None = None
    cached_tokens: int | None = None
    ttft_ms: float | None = None
    cost_usd: float | None = None
    error_type: str | None = None
    cache_hit: bool = False
    numbers_validated: bool = True
    ward_id: str | None = None
    origin_week: date | None = None
    horizon: int | None = None
    language: str = "en"
    ts: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="milliseconds"))


class TraceSink(Protocol):
    def emit(self, rec: LLMCallRecord) -> None: ...


class StdoutSink:
    """Emit structured JSON trace lines to stdout (never logs raw prompts or PII)."""

    def emit(self, rec: LLMCallRecord) -> None:
        payload = asdict(rec)
        if isinstance(payload.get("origin_week"), date):
            payload["origin_week"] = payload["origin_week"].isoformat()
        sys.stdout.write(json.dumps({"type": "llm_call", **payload}, ensure_ascii=False) + "\n")
        sys.stdout.flush()


class MemorySink:
    """Thread-safe in-memory trace sink for tests and inspection."""

    def __init__(self) -> None:
        self._lock = RLock()
        self.records: list[LLMCallRecord] = []

    def emit(self, rec: LLMCallRecord) -> None:
        with self._lock:
            self.records.append(rec)

    def clear(self) -> None:
        with self._lock:
            self.records.clear()


class SqlLlmTraceSink:
    """Persist traces into the SQLite/Postgres `llm_traces` table without ever breaking user requests."""

    def __init__(self, engine: Any) -> None:
        self._engine = engine

    def emit(self, rec: LLMCallRecord) -> None:
        try:
            from sqlalchemy import insert

            from app.adapters.db.models import LlmTraceRow

            now = datetime.now(UTC)
            db_now = now.replace(tzinfo=None) if self._engine.dialect.name == "sqlite" else now
            stmt = insert(LlmTraceRow).values(
                request_id=(rec.request_id or "-")[:64],
                ward_id=rec.ward_id[:16] if rec.ward_id else None,
                origin_week=rec.origin_week,
                horizon=rec.horizon,
                language=(rec.language or "en")[:8],
                model=(rec.model or "template")[:64],
                prompt_version=(rec.prompt_version or "v1")[:32],
                input_tokens=max(0, int(rec.tokens_in or 0)),
                output_tokens=max(0, int(rec.tokens_out or 0)),
                cost_usd=max(0.0, float(rec.cost_usd or 0.0)),
                latency_ms=max(0.0, float(rec.latency_ms)),
                cache_hit=bool(rec.cache_hit),
                numbers_validated=bool(rec.numbers_validated),
                ok=(rec.status == "ok"),
                error_type=rec.error_type[:64] if rec.error_type else None,
                created_at=db_now,
            )
            with self._engine.begin() as conn:
                conn.execute(stmt)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "llm_trace_write_failed: %s",
                type(exc).__name__,
                extra={"event": "llm_trace_write_failed"},
            )


class FanOutSink:
    """Broadcast every trace record to multiple sinks; sink errors are isolated and logged."""

    def __init__(self, *sinks: TraceSink) -> None:
        self.sinks: tuple[TraceSink, ...] = tuple(sinks)

    def emit(self, rec: LLMCallRecord) -> None:
        for sink in self.sinks:
            try:
                sink.emit(rec)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "trace_sink_error: %s",
                    type(exc).__name__,
                    extra={"event": "trace_sink_error"},
                )


def record_to_dict(rec: LLMCallRecord) -> dict[str, Any]:
    out = asdict(rec)
    if isinstance(out.get("origin_week"), date):
        out["origin_week"] = out["origin_week"].isoformat()
    return out
