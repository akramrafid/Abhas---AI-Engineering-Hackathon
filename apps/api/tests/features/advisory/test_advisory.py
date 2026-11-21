"""Advisory vertical slice tests (AC-17, NFR-7)."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.adapters.fake_llm import FakeLLM
from app.core.config import get_settings
from app.features.advisory.schemas import AdvisoryRequest
from app.features.advisory.service import AdvisoryService
from app.features.advisory.templates import validate_advisory_numbers
from app.main import create_app
from app.observability.traces import MemorySink
from app.ports.forecast_model import PointForecast
from app.ports.llm import BudgetExceededError, LLMResult
from app.ports.repositories import Observation, WardRecord
from app.shared.features import FEATURE_COLUMNS
from app.shared.forecast_engine import ForecastEngine


class _UnitRepo:
    def __init__(self, wards: list[WardRecord], obs: list[Observation]) -> None:
        self._wards = wards
        self._obs = obs

    def wards(self, city: str | None = None):
        return [w for w in self._wards if city is None or w.city == city]

    def ward(self, ward_id: str):
        return next((w for w in self._wards if w.ward_id == ward_id), None)

    def history(self, ward_id: str, start: date | None = None, end: date | None = None):
        rows = [o for o in self._obs if o.ward_id == ward_id]
        if start is not None:
            rows = [o for o in rows if o.week >= start]
        if end is not None:
            rows = [o for o in rows if o.week <= end]
        return sorted(rows, key=lambda o: o.week)

    def all_observations(self, end: date | None = None):
        return self._obs

    def date_range(self):
        return (self._obs[0].week, self._obs[-1].week)


class _UnitCache:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def put(self, key: str, payload_json: str) -> None:
        self.data[key] = payload_json

    def count(self) -> int:
        return len(self.data)


class _UnitModel:
    version = "unit-lgbm-1.0"
    feature_names = FEATURE_COLUMNS

    def __init__(self) -> None:
        self.rain_normals = {("DSCC_Ward_07", w): 50.0 for w in range(1, 53)}

    def predict(self, rows, horizon: int) -> list[PointForecast]:
        return [
            PointForecast(
                expected_cases=10.4,
                p10=6.0,
                p90=16.0,
                risk_score=78,
                tier="High",
                tier_escalated=False,
                contributions={"rainfall_lag_0": 0.4, "water_logging_risk_index": 0.25},
            )
            for _ in rows
        ]


def _make_engine(cache: _UnitCache) -> ForecastEngine:
    w = WardRecord("DSCC_Ward_07", "Dhaka South", 50000.0, 0.8, 0.45)
    start = date(2025, 6, 2)
    obs = [
        Observation("DSCC_Ward_07", start + timedelta(weeks=i), 29.0, 33.0, 26.0, 40.0 + i, 82.0, 6)
        for i in range(10)
    ]
    return ForecastEngine(repo=_UnitRepo([w], obs), model=_UnitModel(), cache=cache)


def test_ac_17_numeric_validator_normalizes_ascii_and_bangla_digits() -> None:
    """AC-17: Numeric grounding validator normalizes ASCII and Bangla digits (০-৯) and catches invented values."""
    input_json = (
        '{"expected_cases": 10.4, "p10": 6.0, "p90": 16.0, "risk_score": 78, "confidence_band_pct": 80}'
    )
    ok_en, bad_en = validate_advisory_numbers(
        {"headline": "Expected 10.4 cases", "summary": "80% range 6 to 16, score 78.", "actions": []},
        input_json,
    )
    assert ok_en is True and bad_en == []

    ok_bn, bad_bn = validate_advisory_numbers(
        {"headline": "সম্ভাব্য ১০.৪ রোগী", "summary": "৮০% পরিসর ৬ থেকে ১৬, স্কোর ৭৮।", "actions": []},
        input_json,
    )
    assert ok_bn is True and bad_bn == []

    bad_ok_ascii, offending_ascii = validate_advisory_numbers(
        {"headline": "Expected 999 cases", "summary": "Safe", "actions": []},
        input_json,
    )
    assert bad_ok_ascii is False and "999" in offending_ascii

    bad_ok_bn, offending_bn = validate_advisory_numbers(
        {"headline": "সম্ভাব্য ৯৯৯ রোগী", "summary": "নিরাপদ", "actions": []},
        input_json,
    )
    assert bad_ok_bn is False and "999" in offending_bn


def test_ac_17_advisory_llm_fake_caching_repair_and_budget_fallback() -> None:
    """AC-17: Valid LLM JSON caches by (ward, week, h, model_version, lang); bad numbers/budget degrade to template."""
    cache = _UnitCache()
    engine = _make_engine(cache)
    sink = MemorySink()
    fake = FakeLLM(trace_sink=sink)
    svc = AdvisoryService(engine=engine, cache=cache, llm=fake, trace_sink=sink)

    req = AdvisoryRequest(ward_id="DSCC_Ward_07", origin_week=date(2025, 8, 4), horizon=3, language="en")
    r1 = svc.advisory(req)
    assert r1.source == "llm"
    assert r1.cached is False
    assert r1.numbers_validated is True
    assert fake.calls == 1

    # Repeat call served from cache without re-calling LLM
    r2 = svc.advisory(req)
    assert r2.cached is True
    assert fake.calls == 1

    # Hallucinated numbers trigger 1 repair retry then template fallback
    cache2 = _UnitCache()
    bad_llm = FakeLLM(
        override_payload={
            "headline": "777 cases imminent",
            "summary": "Projects 777 weekly cases.",
            "actions": [{"action": "Check 777 drains", "when": "now"}],
        }
    )
    svc2 = AdvisoryService(engine=_make_engine(cache2), cache=cache2, llm=bad_llm, trace_sink=sink)
    r_bad = svc2.advisory(req)
    assert bad_llm.calls == 2  # initial + 1 repair retry
    assert r_bad.source == "template"
    assert r_bad.numbers_validated is True
    assert "777" not in r_bad.headline

    # Budget exceeded degrades directly to template without calling SDK
    class _BudgetBlockedLLM:
        model = "claude-haiku-5-5"

        def complete_json(
            self, system: str, user: str, schema: Mapping[str, Any], max_output_tokens: int
        ) -> LLMResult:
            raise BudgetExceededError("Daily budget exhausted")

    cache3 = _UnitCache()
    svc3 = AdvisoryService(engine=_make_engine(cache3), cache=cache3, llm=_BudgetBlockedLLM())
    r_budget = svc3.advisory(req)
    assert r_budget.source == "template"
    assert r_budget.numbers_validated is True


def test_ac_17_advisory_endpoint_en_bn_template_and_unknown_ward(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-17: Without ANTHROPIC_API_KEY, POST /api/v1/advisory returns grounded EN/BN templates and 404 on unknown ward."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            for lang in ("en", "bn"):
                payload = {
                    "ward_id": "DSCC_Ward_07",
                    "origin_week": "2025-08-04",
                    "horizon": 3,
                    "language": lang,
                }
                r1 = c.post("/api/v1/advisory", json=payload)
                assert r1.status_code == 200
                b1 = r1.json()
                assert b1["source"] == "template"
                assert b1["model"] is None
                assert b1["language"] == lang
                assert b1["numbers_validated"] is True
                assert 1 <= len(b1["actions"]) <= 5

                r2 = c.post("/api/v1/advisory", json=payload)
                assert r2.status_code == 200
                assert r2.json()["cached"] is True

            r404 = c.post(
                "/api/v1/advisory",
                json={"ward_id": "XYZ_Ward_99", "origin_week": "2025-08-04", "horizon": 3, "language": "en"},
            )
            assert r404.status_code == 404
            assert r404.headers["content-type"].startswith("application/problem+json")
            assert r404.json()["type"].endswith("/unknown-ward")
    finally:
        get_settings.cache_clear()
