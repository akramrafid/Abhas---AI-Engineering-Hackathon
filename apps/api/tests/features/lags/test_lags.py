"""Tests for lags slice (AC-1): GET /api/v1/wards/{ward_id}/lags + service unit test."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.features.lags.service import LagsService
from app.main import create_app
from app.ports.repositories import Observation, WardRecord


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
        return sorted([o for o in self._obs if o.ward_id == ward_id], key=lambda o: o.week)

    def all_observations(self, end: date | None = None) -> Sequence[Observation]:
        return sorted(self._obs, key=lambda o: (o.ward_id, o.week))

    def date_range(self) -> tuple[date, date]:
        return (min(o.week for o in self._obs), max(o.week for o in self._obs))


def test_lags_service_detects_synthetic_lag_3_peak() -> None:
    ward = WardRecord("DSCC_Ward_07", "Dhaka South", 52000.0, 0.81, 0.42)
    start = date(2020, 1, 6)
    rain = [float(((i * 37) % 100) + (20 if i % 7 == 0 else 0)) for i in range(120)]
    obs = []
    for i in range(120):
        # Cases driven strongly by rainfall 3 weeks earlier
        cases = int(round(rain[i - 3] / 5.0)) if i >= 3 else 0
        obs.append(
            Observation(
                ward_id=ward.ward_id,
                week=start + timedelta(weeks=i),
                avg_temp_c=28.0,
                max_temp_c=32.0,
                min_temp_c=24.0,
                rainfall_mm=rain[i],
                relative_humidity_pct=78.0,
                dengue_cases=cases,
            )
        )
    svc = LagsService(_FakeRepo([ward], obs))
    res = svc.ward_lags("DSCC_Ward_07", weeks=52)
    assert res.max_lag == 8
    assert len(res.correlations) == 9
    assert res.peak_lag_ward == 3
    assert res.peak_lag_dataset == 3
    assert len(res.series) == 52
    assert res.series[0].week < res.series[-1].week


def test_ac_1_ward_lags_route() -> None:
    """AC-1: GET /api/v1/wards/{ward_id}/lags returns lags 0-8 with ward & dataset
    deseasonalized correlations; dataset-wide series peaks at lag 3; unknown ward -> 404 /unknown-ward."""
    with TestClient(create_app()) as c:
        for wid in ("DSCC_Ward_07", "DNCC_Ward_01", "CCC_Ward_01", "GCC_Ward_01", "NCC_Ward_01"):
            r = c.get(f"/api/v1/wards/{wid}/lags")
            assert r.status_code == 200
            assert "etag" in r.headers
            assert "max-age=" in r.headers.get("cache-control", "")
            body = r.json()
            assert body["ward_id"] == wid
            assert body["max_lag"] == 8
            assert len(body["correlations"]) == 9
            assert [c_row["lag_weeks"] for c_row in body["correlations"]] == list(range(9))
            assert body["peak_lag_dataset"] == 3
            assert body["correlations"][3]["dataset_corr"] > 0.45
            assert len(body["series"]) == 156

        # Custom weeks parameter + ETag 304
        r_52 = c.get("/api/v1/wards/DSCC_Ward_07/lags", params={"weeks": 52})
        assert r_52.status_code == 200
        assert len(r_52.json()["series"]) == 52
        r_304 = c.get(
            "/api/v1/wards/DSCC_Ward_07/lags",
            params={"weeks": 52},
            headers={"If-None-Match": r_52.headers["etag"]},
        )
        assert r_304.status_code == 304

        # Unknown ward matching pattern -> 404 problem+json ending in /unknown-ward
        r_404 = c.get("/api/v1/wards/DSCC_Ward_99/lags")
        assert r_404.status_code == 404
        assert r_404.headers["content-type"].startswith("application/problem+json")
        assert r_404.json()["type"].endswith("/unknown-ward")
