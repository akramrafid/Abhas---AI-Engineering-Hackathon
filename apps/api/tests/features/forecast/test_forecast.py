"""Forecast & scenario vertical slice tests (AC-3, AC-4, AC-7, CR-3, CR-13)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.adapters.db.factory import get_prediction_cache
from app.features.forecast.schemas import ForecastRequest, ScenarioRequest, WeatherOverride
from app.features.forecast.service import ForecastService
from app.main import create_app
from app.ports.forecast_model import PointForecast
from app.ports.repositories import Observation, WardRecord
from app.shared.features import FEATURE_COLUMNS
from app.shared.forecast_engine import ForecastEngine


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
    feature_names = FEATURE_COLUMNS

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
