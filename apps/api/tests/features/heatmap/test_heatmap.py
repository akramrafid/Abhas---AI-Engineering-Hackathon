"""Heatmap vertical slice tests (AC-13, CR-3)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.errors import AppError
from app.features.heatmap.service import HeatmapService
from app.main import create_app


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
        assert "origin_week" in r_bad_date.text

    # Empty repository returns 404 /unknown-city
    svc = HeatmapService(repo=_EmptyRepo(), engine=None)  # type: ignore[arg-type]
    with pytest.raises(AppError) as exc:
        svc.heatmap(city="Dhaka South", origin_week=date(2025, 8, 4))
    assert exc.value.status == 404
    assert exc.value.slug == "unknown-city"
