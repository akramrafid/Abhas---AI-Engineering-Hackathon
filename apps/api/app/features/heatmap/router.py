"""STUB router (LEAD skeleton): schema-valid sample data. CORE (core-forecast) replaces the body."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import City, IsoWeek, WeatherMode

from .schemas import HeatmapCell, HeatmapResponse

router = APIRouter(prefix="/api/v1", tags=["heatmap"], responses=PROBLEM_RESPONSES)


@router.get("/heatmap", response_model=HeatmapResponse, summary="Tier per ward × horizon for a city")
def heatmap(
    city: Annotated[City, Query()],
    origin_week: Annotated[IsoWeek, Query()],
    source: Annotated[WeatherMode, Query()] = "dataset",
) -> HeatmapResponse:
    wid = "DSCC_Ward_07"
    cells = [
        HeatmapCell(
            ward_id=wid,
            horizon=h,
            target_week=origin_week + timedelta(weeks=h),
            tier="Medium",
            expected_cases=4.0,
            risk_score=30,
        )
        for h in (1, 2, 3, 4)
    ]
    return HeatmapResponse(
        city=city,
        origin_week=origin_week,
        source=source,
        model_version="stub-0",
        ward_ids=[wid],
        horizons=[1, 2, 3, 4],
        cells=cells,
    )
