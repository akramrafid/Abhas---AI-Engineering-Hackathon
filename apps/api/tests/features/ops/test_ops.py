"""Ops vertical slice tests (AC-10, NFR-7)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.adapters.runtime import reset_runtime
from app.core.config import get_settings
from app.main import create_app


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
