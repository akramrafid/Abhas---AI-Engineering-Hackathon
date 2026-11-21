"""Contract tests for CR-3: dataset-mode origin_week range validation (2016-02-29..2025-12-29)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

from app.core.types import DATA_END, FIRST_FORECAST_ORIGIN, DatasetOriginWeek, in_dataset_range
from app.features.heatmap.schemas import HeatmapQuery
from app.main import create_app


def test_cr_3_dataset_origin_week_bounds() -> None:
    assert FIRST_FORECAST_ORIGIN == date(2016, 2, 29)
    assert DATA_END == date(2025, 12, 29)
    assert in_dataset_range(date(2016, 2, 29)) == date(2016, 2, 29)
    assert in_dataset_range(date(2025, 12, 29)) == date(2025, 12, 29)

    adapter = TypeAdapter(DatasetOriginWeek)
    assert adapter.validate_python("2016-02-29") == date(2016, 2, 29)
    assert adapter.validate_python("2025-12-29") == date(2025, 12, 29)

    for bad in ("2016-01-04", "2016-02-22", "2026-01-05", "2030-01-07", "2025-08-05"):
        with pytest.raises(ValidationError):
            adapter.validate_python(bad)


@pytest.mark.parametrize("origin_week", ["2016-01-04", "2016-02-22", "2026-01-05", "2030-01-07"])
@pytest.mark.parametrize("source", [None, "dataset"])
def test_cr_3_forecast_rejects_out_of_range_origin_week_in_dataset_mode(
    origin_week: str, source: str | None
) -> None:
    payload: dict[str, object] = {"ward_ids": ["DSCC_Ward_07"], "origin_week": origin_week}
    if source is not None:
        payload["source"] = source

    with TestClient(create_app()) as c:
        r = c.post("/api/v1/forecast", json=payload)

    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    fields = {e["field"] for e in r.json()["errors"]}
    assert "body.origin_week" in fields


@pytest.mark.parametrize("origin_week", ["2016-02-29", "2025-12-29"])
def test_cr_3_forecast_accepts_dataset_boundaries(origin_week: str) -> None:
    with TestClient(create_app()) as c:
        r = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["DSCC_Ward_07"], "origin_week": origin_week, "source": "dataset"},
        )
    assert r.status_code == 200


def test_cr_3_forecast_allows_live_mode_outside_dataset_range() -> None:
    with TestClient(create_app()) as c:
        ok = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2030-01-07", "source": "live"},
        )
        non_monday = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2030-01-08", "source": "live"},
        )

    assert ok.status_code == 200
    assert non_monday.status_code == 422
    assert non_monday.headers["content-type"].startswith("application/problem+json")
    assert "body.origin_week" in {e["field"] for e in non_monday.json()["errors"]}


@pytest.mark.parametrize("origin_week", ["2016-01-04", "2016-02-22", "2026-01-05", "2030-01-07"])
def test_cr_3_scenario_rejects_out_of_range_origin_week(origin_week: str) -> None:
    with TestClient(create_app()) as c:
        r = c.post(
            "/api/v1/scenario",
            json={
                "ward_id": "DSCC_Ward_07",
                "origin_week": origin_week,
                "weather": {"rainfall_mm": 120},
            },
        )

    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    fields = {e["field"] for e in r.json()["errors"]}
    assert "body.origin_week" in fields


@pytest.mark.parametrize("origin_week", ["2016-02-29", "2025-12-29"])
def test_cr_3_scenario_accepts_dataset_boundaries(origin_week: str) -> None:
    with TestClient(create_app()) as c:
        r = c.post(
            "/api/v1/scenario",
            json={
                "ward_id": "DSCC_Ward_07",
                "origin_week": origin_week,
                "weather": {"rainfall_mm": 120},
            },
        )
    assert r.status_code == 200


def test_cr_3_heatmap_query_validates_dataset_range_and_allows_live() -> None:
    ok_start = HeatmapQuery(city="Dhaka South", origin_week=date(2016, 2, 29))
    ok_end = HeatmapQuery(city="Dhaka South", origin_week=date(2025, 12, 29), source="dataset")
    ok_live = HeatmapQuery(city="Dhaka South", origin_week=date(2030, 1, 7), source="live")
    assert ok_start.origin_week == date(2016, 2, 29)
    assert ok_end.origin_week == date(2025, 12, 29)
    assert ok_live.origin_week == date(2030, 1, 7)

    for bad in (date(2016, 1, 4), date(2016, 2, 22), date(2026, 1, 5), date(2030, 1, 7)):
        with pytest.raises(ValidationError) as exc_default:
            HeatmapQuery(city="Dhaka South", origin_week=bad)
        assert any(e["loc"] == ("origin_week",) for e in exc_default.value.errors())

        with pytest.raises(ValidationError) as exc_explicit:
            HeatmapQuery(city="Dhaka South", origin_week=bad, source="dataset")
        assert any(e["loc"] == ("origin_week",) for e in exc_explicit.value.errors())

    with pytest.raises(ValidationError) as exc_non_monday:
        HeatmapQuery(city="Dhaka South", origin_week=date(2030, 1, 8), source="live")
    assert any(e["loc"] == ("origin_week",) for e in exc_non_monday.value.errors())
