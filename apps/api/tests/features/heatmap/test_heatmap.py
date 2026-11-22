"""Heatmap vertical slice tests (AC-13, CR-3)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import AppError
from app.features.heatmap.service import HeatmapService
from app.main import create_app
from app.ports.weather import WeekWeather
from app.shared.forecast_engine import last_completed_week_monday_dhaka


class _EmptyRepo:
    def wards(self, city: str | None = None):
        return []


def test_ac_13_heatmap_city_grid_sorting_and_etag() -> None:
    """AC-13: GET /api/v1/heatmap returns ward x horizon tiers for a city sorted by peak risk with ETag/304."""
    with TestClient(create_app()) as c:
        r = c.get("/api/v1/heatmap", params={"city": "Dhaka South", "origin_week": "2025-08-04"})
        assert r.status_code == 200
        assert "etag" in r.headers
        assert "max-age=" in r.headers.get("cache-control", "")
        body = r.json()
        assert body["city"] == "Dhaka South"
        assert body["origin_week"] == "2025-08-04"
        assert body["horizons"] == [1, 2, 3, 4]
        assert len(body["ward_ids"]) == 20
        assert len(body["cells"]) == 80
        for cell in body["cells"]:
            assert cell["tier"] in ("Low", "Medium", "High", "Critical")
            assert cell["expected_cases"] >= 0.0
            assert 0 <= cell["risk_score"] <= 100

        # Conditional GET returns 304
        r304 = c.get(
            "/api/v1/heatmap",
            params={"city": "Dhaka South", "origin_week": "2025-08-04"},
            headers={"If-None-Match": r.headers["etag"]},
        )
        assert r304.status_code == 304


def test_cr_3_heatmap_unknown_city_and_out_of_range_origin() -> None:
    """CR-3: Unknown city and out-of-range origin_week are rejected cleanly with problem+json."""
    with TestClient(create_app()) as c:
        r_city = c.get("/api/v1/heatmap", params={"city": "Atlantis", "origin_week": "2025-08-04"})
        assert r_city.status_code == 422
        assert r_city.headers["content-type"].startswith("application/problem+json")

        r_bad_date = c.get("/api/v1/heatmap", params={"city": "Dhaka South", "origin_week": "2030-01-07"})
        assert r_bad_date.status_code == 422
        assert r_bad_date.headers["content-type"].startswith("application/problem+json")
        fields = {e["field"] for e in r_bad_date.json()["errors"]}
        assert "query.origin_week" in fields

        # Early out-of-range Monday (< 2016-02-29) rejected at HeatmapQuery boundary
        r_early = c.get("/api/v1/heatmap", params={"city": "Dhaka South", "origin_week": "2016-01-04"})
        assert r_early.status_code == 422
        assert r_early.headers["content-type"].startswith("application/problem+json")
        assert "query.origin_week" in {e["field"] for e in r_early.json()["errors"]}

        # Extra unknown query param rejected by HeatmapQuery(extra="forbid")
        r_extra = c.get(
            "/api/v1/heatmap",
            params={"city": "Dhaka South", "origin_week": "2025-08-04", "unexpected": "1"},
        )
        assert r_extra.status_code == 422
        assert r_extra.headers["content-type"].startswith("application/problem+json")
        assert "query.unexpected" in {e["field"] for e in r_extra.json()["errors"]}

        # Dataset boundary Mondays (2016-02-29 and 2025-12-29) accepted
        for boundary_week in ("2016-02-29", "2025-12-29"):
            r_ok = c.get("/api/v1/heatmap", params={"city": "Gazipur", "origin_week": boundary_week})
            assert r_ok.status_code == 200
            assert r_ok.json()["origin_week"] == boundary_week

    # Empty repository returns 404 /unknown-city
    svc = HeatmapService(repo=_EmptyRepo(), engine=None)  # type: ignore[arg-type]
    with pytest.raises(AppError) as exc:
        svc.heatmap(city="Dhaka South", origin_week=date(2025, 8, 4))
    assert exc.value.status == 404
    assert exc.value.slug == "unknown-city"


def test_heatmap_live_mode_enforces_asia_dhaka_completed_week(monkeypatch: pytest.MonkeyPatch) -> None:
    """In WEATHER_MODE=live, GET /api/v1/heatmap?source=live rejects non-current Mondays with 422."""

    class _MockLiveWeather:
        name = "mock-live"

        def weekly(self, city: str, weeks: list[date]) -> list[WeekWeather]:
            del city
            return [
                WeekWeather(
                    week=wk,
                    avg_temp_c=28.0,
                    max_temp_c=32.0,
                    min_temp_c=24.5,
                    rainfall_mm=55.0,
                    relative_humidity_pct=78.0,
                    source="live",
                )
                for wk in weeks
            ]

    monkeypatch.setenv("WEATHER_MODE", "live")
    get_settings.cache_clear()
    monkeypatch.setattr("app.features.heatmap.deps.get_weather_source", lambda: _MockLiveWeather())
    try:
        valid_origin = last_completed_week_monday_dhaka().isoformat()
        with TestClient(create_app()) as c:
            r_bad = c.get(
                "/api/v1/heatmap",
                params={"city": "Gazipur", "origin_week": "2030-01-07", "source": "live"},
            )
            assert r_bad.status_code == 422
            assert r_bad.headers["content-type"].startswith("application/problem+json")
            assert "origin_week" in r_bad.text

            r_ok = c.get(
                "/api/v1/heatmap",
                params={"city": "Gazipur", "origin_week": valid_origin, "source": "live"},
            )
            assert r_ok.status_code == 200
            assert r_ok.json()["source"] == "live"
    finally:
        monkeypatch.delenv("WEATHER_MODE", raising=False)
        get_settings.cache_clear()
