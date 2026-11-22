"""Ops vertical slice tests (AC-10, NFR-7)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.adapters.runtime import reset_runtime
from app.core.config import get_settings
from app.features.ops.service import OFFICE_LLM_BASELINE_MONTHLY_USD, OpsService
from app.main import create_app
from app.observability.metrics import OpsMetrics


def test_ac_10_nfr_7_ops_open_when_no_token_and_reports_model_loads_1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AC-10 / NFR-7: /api/v1/ops is open when OPS_TOKEN unset, reports model_loads=1 and cache hit rate."""
    monkeypatch.setenv("OPS_TOKEN", "")
    get_settings.cache_clear()
    reset_runtime()
    try:
        with TestClient(create_app()) as c:
            # Trigger forecast twice (miss then cache hit)
            payload = {"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "horizons": [2, 3]}
            assert c.post("/api/v1/forecast", json=payload).status_code == 200
            assert c.post("/api/v1/forecast", json=payload).status_code == 200

            r = c.get("/api/v1/ops")
            assert r.status_code == 200
            assert r.headers.get("cache-control") == "no-store"
            body = r.json()
            assert body["model_loads"] == 1
            assert body["model_version"].startswith("abhas-lgbm-")
            assert body["predictions"]["requests"] >= 2
            assert body["predictions"]["cache_hits"] >= 1
            assert 0.0 < body["predictions"]["cache_hit_rate"] <= 1.0
            assert body["llm"]["budget_usd_per_day"] == pytest.approx(1.0)
            assert body["est_monthly_cost_usd"] >= 0.0
    finally:
        get_settings.cache_clear()
        reset_runtime()


def test_ac_10_ops_requires_token_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-10: When OPS_TOKEN is set, missing or invalid X-Ops-Token returns 401 problem+json."""
    monkeypatch.setenv("OPS_TOKEN", "ops-secret-token-123")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            r_missing = c.get("/api/v1/ops")
            assert r_missing.status_code == 401
            assert r_missing.headers["content-type"].startswith("application/problem+json")

            r_wrong = c.get("/api/v1/ops", headers={"X-Ops-Token": "wrong"})
            assert r_wrong.status_code == 401

            r_ok = c.get("/api/v1/ops", headers={"X-Ops-Token": "ops-secret-token-123"})
            assert r_ok.status_code == 200
            assert r_ok.json()["model_loads"] == 1
    finally:
        monkeypatch.delenv("OPS_TOKEN", raising=False)
        get_settings.cache_clear()


def test_nfr_7_ops_service_real_counters_latencies_and_monthly_cost_estimates() -> None:
    """NFR-7: OpsService reports accurate prediction/weather/LLM counters, p50/p95 ms, and office monthly cost."""

    class _StubCallLog:
        def __init__(self, weather_calls: int, llm_calls: int, llm_spend: float) -> None:
            self._weather_calls = weather_calls
            self._llm_calls = llm_calls
            self._llm_spend = llm_spend

        def record(
            self, kind: str, ok: bool, latency_ms: float, cost_usd: float = 0.0, detail: str = ""
        ) -> None:
            del kind, ok, latency_ms, cost_usd, detail

        def today(self, kind: str) -> tuple[int, float]:
            if kind == "weather":
                return (self._weather_calls, 0.0)
            if kind == "llm":
                return (self._llm_calls, self._llm_spend)
            return (0, 0.0)

    metrics = OpsMetrics()
    metrics.record_model_load("abhas-lgbm-1.1.2")
    metrics.record_prediction(ward_count=2, cache_hits=0, per_ward_inference_ms=12.4)
    metrics.record_prediction(ward_count=2, cache_hits=2, per_ward_inference_ms=None)
    metrics.record_prediction(ward_count=1, cache_hits=0, per_ward_inference_ms=28.6)
    metrics.record_weather_event(call=True)
    metrics.record_weather_event(cache_hit=True)
    metrics.record_weather_event(error=True)
    metrics.record_llm_event(call=True)
    metrics.record_llm_event(cache_hit=True)
    metrics.record_llm_event(call=True, error=True)

    # 1. Default template mode (llm_enabled=False, zero spend -> $0.00/mo)
    svc_tpl = OpsService(
        ops_metrics=metrics,
        call_log=_StubCallLog(weather_calls=2, llm_calls=0, llm_spend=0.0),
        ensure_model_loaded=lambda: "abhas-lgbm-1.1.2",
        llm_enabled=False,
        llm_daily_budget_usd=1.0,
    )
    snap_tpl = svc_tpl.snapshot()
    assert snap_tpl.model_version == "abhas-lgbm-1.1.2"
    assert snap_tpl.model_loads == 1
    assert snap_tpl.uptime_s >= 0.0
    assert snap_tpl.predictions.requests == 5
    assert snap_tpl.predictions.cache_hits == 2
    assert snap_tpl.predictions.cache_hit_rate == pytest.approx(0.4)
    assert snap_tpl.predictions.p50_ms == pytest.approx(12.4)
    assert snap_tpl.predictions.p95_ms == pytest.approx(28.6)
    assert snap_tpl.weather.calls_today == 2
    assert snap_tpl.weather.calls_total == 2
    assert snap_tpl.weather.cache_hits == 1
    assert snap_tpl.weather.errors == 1
    assert snap_tpl.llm.enabled is False
    assert snap_tpl.llm.calls_total == 2
    assert snap_tpl.llm.cache_hits == 1
    assert snap_tpl.llm.errors == 1
    assert snap_tpl.llm.budget_usd_per_day == pytest.approx(1.0)
    assert snap_tpl.est_monthly_cost_usd == pytest.approx(0.0)

    # 2. Optional Haiku mode (llm_enabled=True, low spend -> $0.69 baseline for 1 city office)
    svc_llm_low = OpsService(
        ops_metrics=metrics,
        call_log=_StubCallLog(weather_calls=1, llm_calls=3, llm_spend=0.006),
        ensure_model_loaded=lambda: "abhas-lgbm-1.1.2",
        llm_enabled=True,
        llm_daily_budget_usd=1.0,
    )
    snap_low = svc_llm_low.snapshot()
    assert snap_low.llm.enabled is True
    assert snap_low.llm.calls_today == 3
    assert snap_low.llm.calls_total == 3
    assert snap_low.llm.spend_usd_today == pytest.approx(0.006)
    assert snap_low.est_monthly_cost_usd == pytest.approx(OFFICE_LLM_BASELINE_MONTHLY_USD)

    # 3. High spend scales linearly up to the $1/day * 30 = $30.00 hard monthly ceiling
    svc_llm_mid = OpsService(
        ops_metrics=metrics,
        call_log=_StubCallLog(weather_calls=1, llm_calls=100, llm_spend=0.25),
        ensure_model_loaded=lambda: "abhas-lgbm-1.1.2",
        llm_enabled=True,
        llm_daily_budget_usd=1.0,
    )
    assert svc_llm_mid.snapshot().est_monthly_cost_usd == pytest.approx(7.50)

    svc_llm_cap = OpsService(
        ops_metrics=metrics,
        call_log=_StubCallLog(weather_calls=1, llm_calls=500, llm_spend=1.50),
        ensure_model_loaded=lambda: "abhas-lgbm-1.1.2",
        llm_enabled=True,
        llm_daily_budget_usd=1.0,
    )
    assert svc_llm_cap.snapshot().est_monthly_cost_usd == pytest.approx(30.00)
