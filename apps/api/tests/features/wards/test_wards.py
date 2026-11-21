"""Tests for wards slice (service unit tests + seeded API routes + DB adapters)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.adapters.db.engine import create_db_engine
from app.adapters.db.repositories import SqlCallLog, SqlPredictionCache
from app.core.config import API_DIR
from app.core.errors import AppError
from app.features.wards.service import WardsService
from app.main import create_app
from app.ports.repositories import Observation, WardRecord


class FakeObservationRepository:
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
        rows = [o for o in self._obs if end is None or o.week <= end]
        return sorted(rows, key=lambda o: (o.ward_id, o.week))

    def date_range(self) -> tuple[date, date]:
        weeks = [o.week for o in self._obs]
        return (min(weeks), max(weeks))


def test_wards_service_with_fake_repo() -> None:
    w1 = WardRecord("DSCC_Ward_07", "Dhaka South", 52000.0, 0.81, 0.42)
    w2 = WardRecord("DNCC_Ward_01", "Dhaka North", 35000.0, 0.55, 0.65)
    start = date(2016, 1, 4)
    obs = [
        Observation("DSCC_Ward_07", start + timedelta(weeks=i), 28.0, 32.0, 24.0, 40.0 + i, 78.0, i)
        for i in range(10)
    ]
    svc = WardsService(FakeObservationRepository([w1, w2], obs))

    all_w = svc.list_wards()
    assert len(all_w.wards) == 2
    assert all_w.data_start == date(2016, 1, 4)
    assert all_w.first_forecast_origin == date(2016, 2, 29)

    dscc = svc.list_wards(city="Dhaka South")
    assert [w.ward_id for w in dscc.wards] == ["DSCC_Ward_07"]

    hist = svc.ward_history("DSCC_Ward_07", start=date(2016, 1, 11), end=date(2016, 1, 25))
    assert len(hist.weeks) == 3

    with pytest.raises(AppError) as exc_unknown:
        svc.ward_history("DSCC_Ward_99")
    assert exc_unknown.value.status == 404
    assert exc_unknown.value.slug == "unknown-ward"

    with pytest.raises(AppError) as exc_range:
        svc.ward_history("DSCC_Ward_07", start=date(2025, 2, 1), end=date(2025, 1, 1))
    assert exc_range.value.status == 422


def test_wards_routes_and_caching_headers() -> None:
    with TestClient(create_app()) as c:
        r = c.get("/api/v1/wards")
        assert r.status_code == 200
        assert "etag" in r.headers
        assert "max-age=" in r.headers.get("cache-control", "")
        body = r.json()
        assert len(body["wards"]) == 60
        assert body["data_start"] == "2016-01-04"
        assert body["data_end"] == "2025-12-29"
        assert body["first_forecast_origin"] == "2016-02-29"

        # Conditional GET returns 304 Not Modified
        r304 = c.get("/api/v1/wards", headers={"If-None-Match": r.headers["etag"]})
        assert r304.status_code == 304

        # City filter
        r_city = c.get("/api/v1/wards", params={"city": "Dhaka South"})
        assert r_city.status_code == 200
        assert len(r_city.json()["wards"]) == 20
        assert all(w["city"] == "Dhaka South" for w in r_city.json()["wards"])

        # History with inclusive range
        r_hist = c.get(
            "/api/v1/wards/DSCC_Ward_07/history",
            params={"start": "2025-01-06", "end": "2025-01-27"},
        )
        assert r_hist.status_code == 200
        assert "etag" in r_hist.headers
        weeks = r_hist.json()["weeks"]
        assert [w["week"] for w in weeks] == ["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27"]

        # Unknown ward -> 404 problem+json ending in /unknown-ward
        r_404 = c.get("/api/v1/wards/DSCC_Ward_99/history")
        assert r_404.status_code == 404
        assert r_404.headers["content-type"].startswith("application/problem+json")
        assert r_404.json()["type"].endswith("/unknown-ward")


def test_prediction_cache_and_call_log_adapters(tmp_path: Path) -> None:
    db_file = tmp_path / "adapters.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    try:
        cache = SqlPredictionCache(engine)
        assert cache.count() == 0
        assert cache.get("k1") is None
        cache.put("k1", '{"cases": 4.2}')
        assert cache.count() == 1
        assert cache.get("k1") == '{"cases": 4.2}'
        # Clear hot memory layer and read back from SQLite
        cache.clear_memory()
        assert cache.get("k1") == '{"cases": 4.2}'
        # Upsert overwrites without adding row
        cache.put("k1", '{"cases": 5.1}')
        assert cache.count() == 1
        assert cache.get("k1") == '{"cases": 5.1}'

        log = SqlCallLog(engine)
        assert log.today("weather") == (0, 0.0)
        log.record("weather", ok=True, latency_ms=123.4, cost_usd=0.0, detail="ok")
        log.record("llm", ok=True, latency_ms=420.0, cost_usd=0.0025, detail="haiku")
        assert log.today("weather") == (1, 0.0)
        calls, spend = log.today("llm")
        assert calls == 1 and spend == pytest.approx(0.0025)
    finally:
        engine.dispose()
