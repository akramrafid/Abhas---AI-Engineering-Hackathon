"""Fault-injection tests (@pytest.mark.faults) verifying graceful degradation per docs/system-design.md §8."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.adapters.db.engine import create_db_engine
from app.adapters.db.factory import reset_factory
from app.adapters.db.models import ObservationRow, WardRow
from app.adapters.db.repositories import (
    SqlCallLog,
    SqlObservationRepository,
    SqlPredictionCache,
    SqlWeatherCache,
)
from app.adapters.lgbm_model import ModelArtifactError, load_model
from app.adapters.llm import AnthropicLLM
from app.adapters.openmeteo import OpenMeteoWeatherSource
from app.adapters.runtime import reset_runtime
from app.core.config import API_DIR, active_faults, get_settings
from app.core.types import CITIES
from app.features.advisory.schemas import AdvisoryRequest
from app.features.advisory.service import AdvisoryService
from app.main import create_app
from app.observability.metrics import OpsMetrics
from app.observability.traces import MemorySink
from app.shared.forecast_engine import ForecastEngine


def _isolated_engine(tmp_path: Path):
    db_file = tmp_path / "faults.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    prefixes = {
        "Dhaka North": "DNCC",
        "Dhaka South": "DSCC",
        "Chattogram": "CCC",
        "Gazipur": "GCC",
        "Narayanganj": "NCC",
    }
    wards = [
        {
            "ward_id": f"{prefixes[c]}_Ward_01",
            "city": c,
            "population_density_sqkm": 42000.0,
            "water_logging_risk_index": 0.72,
            "sanitation_score": 0.50,
        }
        for c in CITIES
    ]
    base = date(2025, 6, 2)
    obs = [
        {
            "ward_id": w["ward_id"],
            "week": base + timedelta(weeks=i),
            "avg_temp_c": 29.0,
            "max_temp_c": 33.0,
            "min_temp_c": 26.0,
            "rainfall_mm": 45.0 + i * 3.0,
            "relative_humidity_pct": 82.0,
            "dengue_cases": 5,
        }
        for w in wards
        for i in range(10)
    ]
    with engine.begin() as conn:
        conn.execute(WardRow.__table__.insert(), wards)
        conn.execute(ObservationRow.__table__.insert(), obs)
    return engine


@pytest.mark.faults
def test_openmeteo_timeout_and_5xx_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """FAULT_INJECT=openmeteo_timeout and openmeteo_5xx degrade to climatology/cache cleanly (HTTP 200)."""
    engine = _isolated_engine(tmp_path)
    try:
        repo = SqlObservationRepository(engine)
        wcache = SqlWeatherCache(engine)
        call_log = SqlCallLog(engine)
        pcache = SqlPredictionCache(engine)
        ops = OpsMetrics()
        model = load_model(get_settings().model_path)

        client = httpx.Client(
            transport=httpx.MockTransport(lambda _r: httpx.Response(503)),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
        )
        weather = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=wcache,
            call_log=call_log,
            mode="live",
            app_env="test",
            client=client,
            retry_base_s=0.0,
        )
        fc_engine = ForecastEngine(
            repo=repo, model=model, cache=pcache, weather_source=weather, ops_metrics=ops
        )

        for token in ("openmeteo_timeout", "openmeteo_5xx"):
            monkeypatch.setenv("APP_ENV", "test")
            monkeypatch.setenv("FAULT_INJECT", token)
            get_settings.cache_clear()
            batch = fc_engine.forecast(
                ward_ids=["DSCC_Ward_01"],
                origin_week=date(2025, 8, 4),
                horizons=[1, 2, 3, 4],
                source="live",
            )
            assert batch.weather_source in ("cache", "climatology")
            assert len(batch.forecasts) == 1
            assert len(batch.forecasts[0].horizons) == 4
        assert ops.snapshot().weather_errors >= 2
        client.close()
    finally:
        monkeypatch.delenv("FAULT_INJECT", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.faults
@pytest.mark.parametrize("fault_token", ["llm_timeout", "llm_bad_json", "llm_bad_numbers"])
def test_llm_timeout_bad_json_and_bad_numbers_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault_token: str
) -> None:
    """FAULT_INJECT=llm_timeout|llm_bad_json|llm_bad_numbers falls back to grounded EN/BN template."""
    engine = _isolated_engine(tmp_path)
    try:
        monkeypatch.setenv("APP_ENV", "test")
        monkeypatch.setenv("FAULT_INJECT", fault_token)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-fake-key-for-fault-mode")
        get_settings.cache_clear()

        repo = SqlObservationRepository(engine)
        pcache = SqlPredictionCache(engine)
        call_log = SqlCallLog(engine)
        sink = MemorySink()
        ops = OpsMetrics()
        model = load_model(get_settings().model_path)

        llm = AnthropicLLM(
            api_key="test-fake-key-for-fault-mode",
            call_log=call_log,
            trace_sink=sink,
            ops_metrics=ops,
            settings=get_settings(),
            retry_base_s=0.0,
        )
        fc_engine = ForecastEngine(repo=repo, model=model, cache=pcache, ops_metrics=ops)
        svc = AdvisoryService(
            engine=fc_engine,
            cache=pcache,
            llm=llm,
            trace_sink=sink,
            ops_metrics=ops,
        )

        res = svc.advisory(
            AdvisoryRequest(
                ward_id="DSCC_Ward_01",
                origin_week=date(2025, 8, 4),
                horizon=3,
                language="en",
            )
        )
        assert res.source == "template"
        assert res.model is None
        assert res.numbers_validated is True
        assert "999" not in res.headline
        assert "999" not in res.summary
        assert "broken json" not in res.summary
        assert len(sink.records) >= 1
        llm.close()
    finally:
        monkeypatch.delenv("FAULT_INJECT", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.faults
def test_db_down_returns_503_problem_json_and_ignored_in_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    """FAULT_INJECT=db_down returns 503 problem+json with X-Request-ID in APP_ENV=test and is ignored in dev."""
    reset_runtime()
    try:
        monkeypatch.setenv("APP_ENV", "test")
        monkeypatch.setenv("FAULT_INJECT", "db_down")
        get_settings.cache_clear()
        assert "db_down" in active_faults()

        with TestClient(create_app()) as c:
            assert c.get("/healthz").status_code == 200
            r = c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "horizons": [3]},
            )
            assert r.status_code == 503
            assert r.headers["content-type"].startswith("application/problem+json")
            assert "x-request-id" in r.headers
            body = r.json()
            assert body["status"] == 503
            assert "Traceback" not in r.text
            assert "SELECT" not in r.text

            r_hm = c.get("/api/v1/heatmap", params={"city": "Dhaka South", "origin_week": "2025-08-04"})
            assert r_hm.status_code == 503
            assert r_hm.headers["content-type"].startswith("application/problem+json")

        # Negative test: APP_ENV=dev MUST ignore FAULT_INJECT=db_down completely
        monkeypatch.setenv("APP_ENV", "dev")
        monkeypatch.setenv("FAULT_INJECT", "db_down")
        get_settings.cache_clear()
        assert active_faults() == frozenset()
        with TestClient(create_app()) as c:
            r_ok = c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "horizons": [3]},
            )
            assert r_ok.status_code == 200
    finally:
        monkeypatch.delenv("FAULT_INJECT", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        get_settings.cache_clear()
        reset_runtime()
        reset_factory()


@pytest.mark.faults
def test_corrupt_or_missing_model_artifact_fails_fast(tmp_path: Path) -> None:
    """Missing or tampered model artifact raises ModelArtifactError (HTTP 503), never mocked predictions."""
    with pytest.raises(ModelArtifactError) as exc_missing:
        load_model(tmp_path / "nonexistent.joblib")
    assert exc_missing.value.status == 503

    bad = tmp_path / "current.joblib"
    bad.write_bytes(b"tampered")
    (tmp_path / "metadata.json").write_text('{"sha256": "' + "0" * 64 + '"}', encoding="utf-8")
    with pytest.raises(ModelArtifactError) as exc_sha:
        load_model(bad)
    assert exc_sha.value.status == 503
