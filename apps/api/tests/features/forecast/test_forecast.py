"""Forecast & scenario vertical slice tests (AC-3, AC-4, AC-7, CR-3, CR-13)."""

from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from threading import Barrier, Lock

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.adapters.db.engine import create_db_engine
from app.adapters.db.factory import get_prediction_cache
from app.adapters.db.repositories import SqlPredictionCache
from app.core.config import API_DIR, get_settings
from app.core.errors import AppError
from app.features.forecast.schemas import ForecastRequest, ScenarioRequest, WeatherOverride
from app.features.forecast.service import ForecastService
from app.main import create_app
from app.ports.forecast_model import PointForecast
from app.ports.repositories import Observation, WardRecord
from app.ports.weather import WeekWeather
from app.shared.features import FEATURE_COLUMNS
from app.shared.forecast_engine import (
    ForecastEngine,
    current_week_monday_dhaka,
    last_completed_week_monday_dhaka,
    validate_origin_week,
)


class _FakeRepo:
    def __init__(self, wards: Sequence[WardRecord], obs: Sequence[Observation]) -> None:
        self._wards = list(wards)
        self._obs = list(obs)

    def wards(self, city: str | None = None) -> Sequence[WardRecord]:
        return [w for w in self._wards if city is None or w.city == city]

    def ward(self, ward_id: str) -> WardRecord | None:
        return next((w for w in self._wards if w.ward_id == ward_id), None)

    def history(
        self, ward_id: str, start: date | None = None, end: date | None = None
    ) -> Sequence[Observation]:
        rows = [o for o in self._obs if o.ward_id == ward_id]
        if start is not None:
            rows = [o for o in rows if o.week >= start]
        if end is not None:
            rows = [o for o in rows if o.week <= end]
        return sorted(rows, key=lambda o: o.week)

    def all_observations(self, end: date | None = None) -> Sequence[Observation]:
        return [o for o in self._obs if end is None or o.week <= end]

    def date_range(self) -> tuple[date, date]:
        weeks = [o.week for o in self._obs]
        return (min(weeks), max(weeks))


class _FakeCache:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def put(self, key: str, payload_json: str) -> None:
        self.store[key] = payload_json

    def count(self) -> int:
        return len(self.store)


class _FakeModel:
    version = "fake-model-1.0"
    feature_names: Sequence[str] = FEATURE_COLUMNS

    def __init__(self, rain_normals: dict[tuple[str, int], float]) -> None:
        self.rain_normals = rain_normals
        self.last_rows: list[dict[str, float]] = []

    def predict(self, rows: Sequence[Mapping[str, float]], horizon: int) -> list[PointForecast]:
        self.last_rows = [dict(r) for r in rows]
        out: list[PointForecast] = []
        for r in rows:
            rain0 = float(r.get("rainfall_lag_0", 0.0))
            mu = round(1.0 + 0.08 * rain0 + 0.5 * horizon, 3)
            out.append(
                PointForecast(
                    expected_cases=mu,
                    p10=round(max(0.0, mu * 0.6), 3),
                    p90=round(mu * 1.5, 3),
                    risk_score=min(100, int(mu * 5)),
                    tier="High" if mu >= 8 else ("Medium" if mu >= 3 else "Low"),
                    tier_escalated=False,
                    contributions={"rainfall_lag_0": 0.35, "water_logging_risk_index": 0.2},
                )
            )
        return out


def test_forecast_service_unit_uses_stored_normals_and_caches() -> None:
    """CR-13: ForecastService passes artifact rain_normals into serving features and caches results."""
    w = WardRecord("DSCC_Ward_07", "Dhaka South", 50000.0, 0.8, 0.45)
    start = date(2025, 6, 2)
    obs = [
        Observation("DSCC_Ward_07", start + timedelta(weeks=i), 29.0, 33.0, 26.0, 20.0 + i, 80.0, 4)
        for i in range(10)
    ]
    origin = start + timedelta(weeks=9)  # 2025-08-04
    stored_normals = {("DSCC_Ward_07", origin.isocalendar().week): 100.0}
    model = _FakeModel(rain_normals=stored_normals)
    cache = _FakeCache()
    svc = ForecastService(ForecastEngine(repo=_FakeRepo([w], obs), model=model, cache=cache))

    res1 = svc.forecast(ForecastRequest(ward_ids=["DSCC_Ward_07"], origin_week=origin, horizons=[2, 3]))
    assert res1.cached is False
    assert len(res1.forecasts) == 1
    assert len(res1.forecasts[0].horizons) == 2
    # rain_anomaly = observed (29.0) - stored normal (100.0) = -71.0 (proves stored normal was used!)
    assert model.last_rows[0]["rain_anomaly"] == -71.0
    assert cache.count() == 2

    res2 = svc.forecast(ForecastRequest(ward_ids=["DSCC_Ward_07"], origin_week=origin, horizons=[2, 3]))
    assert res2.cached is True
    assert res2.forecasts[0].horizons == res1.forecasts[0].horizons

    # Scenario never writes to predictions_cache
    scen = svc.scenario(
        ScenarioRequest(
            ward_id="DSCC_Ward_07",
            origin_week=origin,
            horizons=[3],
            weather=WeatherOverride(rainfall_mm=120.0),
        )
    )
    assert cache.count() == 2
    assert scen.scenario[0].expected_cases > scen.baseline[0].expected_cases


def test_ac_3_forecast_endpoint_happy_path_and_determinism() -> None:
    """AC-3: POST /api/v1/forecast returns valid bands, scores, tiers, <=4 drivers, and deterministic repeats."""
    with TestClient(create_app()) as c:
        payload = {
            "ward_ids": ["DSCC_Ward_07", "DNCC_Ward_01"],
            "origin_week": "2025-08-04",
            "horizons": [1, 2, 3, 4],
            "source": "dataset",
        }
        r1 = c.post("/api/v1/forecast", json=payload)
        assert r1.status_code == 200
        b1 = r1.json()
        assert b1["origin_week"] == "2025-08-04"
        assert b1["weather_source"] == "dataset"
        assert b1["model_version"].startswith("abhas-lgbm-")
        assert len(b1["forecasts"]) == 2
        for wf in b1["forecasts"]:
            assert wf["peak_tier"] in ("Low", "Medium", "High", "Critical")
            assert len(wf["horizons"]) == 4
            for hf in wf["horizons"]:
                assert 0.0 <= hf["p10"] <= hf["expected_cases"] <= hf["p90"]
                assert 0 <= hf["risk_score"] <= 100
                assert hf["tier"] in ("Low", "Medium", "High", "Critical")
                assert 1 <= len(hf["drivers"]) <= 4

        # Second identical call hits cache and returns identical numbers
        r2 = c.post("/api/v1/forecast", json=payload)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["cached"] is True
        assert b2["forecasts"] == b1["forecasts"]


def test_ac_4_cr_3_unknown_ward_and_invalid_inputs_no_cache_write() -> None:
    """AC-4 / CR-3: Unknown ward -> 404 /unknown-ward naming ward_id; bad fields -> 422; cache untouched."""
    cache = get_prediction_cache()
    with TestClient(create_app()) as c:
        before = cache.count()

        # Unknown ward on /forecast -> 404 problem+json ending in /unknown-ward
        r404_fc = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["XYZ_Ward_99"], "origin_week": "2025-08-04", "horizons": [3]},
        )
        assert r404_fc.status_code == 404
        assert r404_fc.headers["content-type"].startswith("application/problem+json")
        body_fc = r404_fc.json()
        assert body_fc["type"].endswith("/unknown-ward")
        assert "ward_id" in (body_fc.get("detail") or "") and "XYZ_Ward_99" in (body_fc.get("detail") or "")

        # Unknown ward on /scenario -> 404 problem+json ending in /unknown-ward
        r404_sc = c.post(
            "/api/v1/scenario",
            json={"ward_id": "DSCC_Ward_99", "origin_week": "2025-08-04", "weather": {"rainfall_mm": 120}},
        )
        assert r404_sc.status_code == 404
        assert r404_sc.headers["content-type"].startswith("application/problem+json")
        assert r404_sc.json()["type"].endswith("/unknown-ward")
        assert "DSCC_Ward_99" in (r404_sc.json().get("detail") or "")

        # Non-Monday origin_week -> 422
        r_tue = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-05"},
        )
        assert r_tue.status_code == 422
        assert r_tue.headers["content-type"].startswith("application/problem+json")

        # Out-of-range Mondays (< 2016-02-29 and > 2025-12-29) -> 422 naming origin_week
        for bad_date in ("2016-01-04", "2030-01-07"):
            r_oor = c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": bad_date},
            )
            assert r_oor.status_code == 422
            assert "origin_week" in r_oor.text

        # Bad horizons (0, 5), >60 wards, rainfall <0 or >500 -> 422
        assert (
            c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "horizons": [0]},
            ).status_code
            == 422
        )
        assert (
            c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "horizons": [5]},
            ).status_code
            == 422
        )
        assert (
            c.post(
                "/api/v1/forecast",
                json={"ward_ids": [f"W_{i}" for i in range(61)], "origin_week": "2025-08-04"},
            ).status_code
            == 422
        )
        assert (
            c.post(
                "/api/v1/scenario",
                json={"ward_id": "DSCC_Ward_07", "origin_week": "2025-08-04", "weather": {"rainfall_mm": -5}},
            ).status_code
            == 422
        )
        assert (
            c.post(
                "/api/v1/scenario",
                json={
                    "ward_id": "DSCC_Ward_07",
                    "origin_week": "2025-08-04",
                    "weather": {"rainfall_mm": 501},
                },
            ).status_code
            == 422
        )

        # predictions_cache row count MUST be unchanged after all invalid requests (AC-4)
        assert cache.count() == before


def test_ac_7_scenario_endpoint_120mm_increases_h3_and_never_caches() -> None:
    """AC-7: Setting rainfall_mm=120 on a low-rain non-Critical week strictly raises h=3 expected_cases."""
    cache = get_prediction_cache()
    with TestClient(create_app()) as c:
        before = cache.count()
        # 2025-05-05 in DSCC_Ward_07 is dry (<20 mm rain, non-Critical)
        r = c.post(
            "/api/v1/scenario",
            json={
                "ward_id": "DSCC_Ward_07",
                "origin_week": "2025-05-05",
                "horizons": [1, 2, 3, 4],
                "weather": {"rainfall_mm": 120.0},
            },
        )
        assert r.status_code == 200
        body = r.json()
        base_h3 = next(h for h in body["baseline"] if h["horizon"] == 3)
        scen_h3 = next(h for h in body["scenario"] if h["horizon"] == 3)
        assert scen_h3["expected_cases"] > base_h3["expected_cases"]
        assert cache.count() == before


def test_ac_7_pinned_demo_baseline_dscc_ward_04_2024_05_27_real_artifact() -> None:
    """AC-7: Pinned demo baseline (DSCC_Ward_04, 2024-05-27, rainfall_mm=120) increases h=3 without caching."""
    cache = get_prediction_cache()
    with TestClient(create_app()) as c:
        before = cache.count()
        r = c.post(
            "/api/v1/scenario",
            json={
                "ward_id": "DSCC_Ward_04",
                "origin_week": "2024-05-27",
                "horizons": [1, 2, 3, 4],
                "weather": {"rainfall_mm": 120.0},
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["model_version"].startswith("abhas-lgbm-")
        assert body["ward_id"] == "DSCC_Ward_04"
        assert body["origin_week"] == "2024-05-27"
        base_h3 = next(h for h in body["baseline"] if h["horizon"] == 3)
        scen_h3 = next(h for h in body["scenario"] if h["horizon"] == 3)
        assert scen_h3["expected_cases"] > base_h3["expected_cases"]
        assert cache.count() == before


def test_single_flight_10_concurrent_cold_requests_execute_inference_once() -> None:
    """Single-flight lock coalesces 10 simultaneous cold-origin requests into 1 inference execution."""
    wards = [
        WardRecord("DSCC_Ward_04", "Dhaka South", 48000.0, 0.78, 0.48),
        WardRecord("DSCC_Ward_07", "Dhaka South", 50000.0, 0.80, 0.45),
    ]
    start = date(2025, 6, 2)
    obs = [
        Observation(w.ward_id, start + timedelta(weeks=i), 29.0, 33.0, 26.0, 25.0 + i, 80.0, 4)
        for w in wards
        for i in range(10)
    ]
    origin = start + timedelta(weeks=9)  # 2025-08-04

    class _ThreadSafeCache:
        def __init__(self) -> None:
            self._lock = Lock()
            self._store: dict[str, str] = {}

        def get(self, key: str) -> str | None:
            with self._lock:
                return self._store.get(key)

        def put(self, key: str, payload_json: str) -> None:
            with self._lock:
                self._store[key] = payload_json

        def count(self) -> int:
            with self._lock:
                return len(self._store)

    class _SlowCountingModel(_FakeModel):
        def __init__(self) -> None:
            super().__init__(rain_normals={(w.ward_id, origin.isocalendar().week): 60.0 for w in wards})
            self._count_lock = Lock()
            self.predict_calls = 0

        def predict(self, rows: Sequence[Mapping[str, float]], horizon: int) -> list[PointForecast]:
            with self._count_lock:
                self.predict_calls += 1
            time.sleep(0.02)
            return super().predict(rows, horizon)

    repo = _FakeRepo(wards, obs)
    cache = _ThreadSafeCache()
    model = _SlowCountingModel()
    barrier = Barrier(10)

    def _worker(_idx: int):
        # Mirror per-request FastAPI dependency wiring: each thread creates its own ForecastEngine
        # sharing the process-wide PredictionCache.
        eng = ForecastEngine(repo=repo, model=model, cache=cache)
        barrier.wait(timeout=5.0)
        return eng.forecast(
            ward_ids=["DSCC_Ward_04", "DSCC_Ward_07"],
            origin_week=origin,
            horizons=[1, 2, 3, 4],
            source="dataset",
        )

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(_worker, range(10)))

    # Only 1 thread should run the 4 horizons (4 calls total, not 10 x 4 = 40)
    assert model.predict_calls == 4
    assert cache.count() == 8  # 2 wards x 4 horizons
    assert sum(1 for r in results if not r.cached) == 1
    assert sum(1 for r in results if r.cached) == 9
    for r in results[1:]:
        assert r.forecasts == results[0].forecasts


def test_l1_lru_front_of_sqlite_predictions_cache_and_scenario_never_caches(tmp_path: Path) -> None:
    """L1 LRU serves warm hits in front of SQLite predictions_cache; scenarios never write to cache."""
    db_file = tmp_path / "cache_l1_l2.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    sql_engine = create_db_engine(url)
    try:
        cache = SqlPredictionCache(sql_engine)
        w = WardRecord("DSCC_Ward_04", "Dhaka South", 48000.0, 0.78, 0.48)
        start = date(2025, 6, 2)
        obs = [
            Observation("DSCC_Ward_04", start + timedelta(weeks=i), 29.0, 33.0, 26.0, 20.0 + i, 80.0, 4)
            for i in range(10)
        ]
        origin = start + timedelta(weeks=9)
        model = _FakeModel(rain_normals={("DSCC_Ward_04", origin.isocalendar().week): 50.0})
        eng = ForecastEngine(repo=_FakeRepo([w], obs), model=model, cache=cache)

        b1 = eng.forecast(ward_ids=["DSCC_Ward_04"], origin_week=origin, horizons=[1, 2, 3, 4])
        assert b1.cached is False
        assert cache.count() == 4
        assert len(cache._mem) == 4  # L1 LRU populated in front of SQLite

        # Warm hit comes from L1 LRU (even after clearing L1, SQLite L2 restores and refills L1)
        b2 = eng.forecast(ward_ids=["DSCC_Ward_04"], origin_week=origin, horizons=[1, 2, 3, 4])
        assert b2.cached is True
        assert b2.forecasts == b1.forecasts

        cache.clear_memory()
        assert len(cache._mem) == 0
        b3 = eng.forecast(ward_ids=["DSCC_Ward_04"], origin_week=origin, horizons=[1, 2, 3, 4])
        assert b3.cached is True
        assert len(cache._mem) == 4  # Backfilled L1 from SQLite L2

        # Scenario NEVER writes to predictions_cache
        eng.scenario(
            ward_id="DSCC_Ward_04",
            origin_week=origin,
            horizons=[1, 2, 3, 4],
            weather_override={"rainfall_mm": 120.0},
        )
        assert cache.count() == 4
    finally:
        sql_engine.dispose()


def test_live_mode_origin_week_validation_asia_dhaka(monkeypatch: pytest.MonkeyPatch) -> None:
    """Live mode validates origin_week against current completed Mon-Sun week in Asia/Dhaka (422 otherwise)."""
    # Sunday 2026-11-22 19:00 UTC == Monday 2026-11-23 01:00 Asia/Dhaka (UTC+6)
    utc_sunday_evening = datetime(2026, 11, 22, 19, 0, tzinfo=UTC)
    assert current_week_monday_dhaka(utc_sunday_evening) == date(2026, 11, 23)
    assert last_completed_week_monday_dhaka(utc_sunday_evening) == date(2026, 11, 16)

    # Both last completed Mon-Sun week and current Dhaka week pass; any other Monday raises 422 naming origin_week
    validate_origin_week(date(2026, 11, 16), source="live", strict_live_origin=True, now=utc_sunday_evening)
    validate_origin_week(date(2026, 11, 23), source="live", strict_live_origin=True, now=utc_sunday_evening)
    for bad in (date(2025, 8, 4), date(2026, 11, 9), date(2030, 1, 7)):
        with pytest.raises(AppError) as exc:
            validate_origin_week(bad, source="live", strict_live_origin=True, now=utc_sunday_evening)
        assert exc.value.status == 422
        assert "origin_week" in (exc.value.detail or "")

    # End-to-end HTTP check with WEATHER_MODE=live and mocked WeatherSource (zero external network calls)
    class _MockLiveWeather:
        name = "mock-live"

        def weekly(self, city: str, weeks: list[date]) -> list[WeekWeather]:
            del city
            return [
                WeekWeather(
                    week=wk,
                    avg_temp_c=28.5,
                    max_temp_c=32.5,
                    min_temp_c=25.0,
                    rainfall_mm=65.0,
                    relative_humidity_pct=80.0,
                    source="live",
                )
                for wk in weeks
            ]

    monkeypatch.setenv("WEATHER_MODE", "live")
    get_settings.cache_clear()
    monkeypatch.setattr("app.features.forecast.deps.get_weather_source", lambda: _MockLiveWeather())
    try:
        valid_origin = last_completed_week_monday_dhaka().isoformat()
        with TestClient(create_app()) as c:
            r_bad = c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2030-01-07", "source": "live"},
            )
            assert r_bad.status_code == 422
            assert r_bad.headers["content-type"].startswith("application/problem+json")
            assert "origin_week" in r_bad.text

            r_ok = c.post(
                "/api/v1/forecast",
                json={"ward_ids": ["DSCC_Ward_07"], "origin_week": valid_origin, "source": "live"},
            )
            assert r_ok.status_code == 200
            assert r_ok.json()["weather_source"] == "live"
    finally:
        monkeypatch.delenv("WEATHER_MODE", raising=False)
        get_settings.cache_clear()
