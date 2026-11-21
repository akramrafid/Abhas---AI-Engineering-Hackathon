"""STUB router (LEAD skeleton): returns schema-valid sample data. Owner seat replaces the body with the service."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.errors import PROBLEM_RESPONSES, AppError
from app.core.types import DATA_END, DATA_START, WARD_ID_PATTERN, City

from .schemas import Ward, WardHistory, WardList, WeekObservation

router = APIRouter(prefix="/api/v1/wards", tags=["wards"], responses=PROBLEM_RESPONSES)

_SAMPLE = Ward(
    ward_id="DSCC_Ward_07",
    city="Dhaka South",
    population_density_sqkm=52000,
    water_logging_risk_index=0.81,
    sanitation_score=0.42,
)


@router.get("", response_model=WardList, summary="List wards (optionally for one city)")
def list_wards(city: Annotated[City | None, Query()] = None) -> WardList:
    return WardList(
        wards=[_SAMPLE],
        cities=["Dhaka North", "Dhaka South", "Chattogram", "Gazipur", "Narayanganj"],
        data_start=DATA_START,
        data_end=DATA_END,
        first_forecast_origin=date(2016, 2, 29),
    )


@router.get("/{ward_id}/history", response_model=WardHistory, summary="Weekly observations for one ward")
def ward_history(
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN)],
    start: Annotated[date | None, Query()] = None,
    end: Annotated[date | None, Query()] = None,
) -> WardHistory:
    if ward_id != _SAMPLE.ward_id:
        raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")
    weeks = [
        WeekObservation(
            week=DATA_END - timedelta(weeks=i),
            avg_temp_c=29.0,
            max_temp_c=33.0,
            min_temp_c=25.0,
            rainfall_mm=80.0,
            relative_humidity_pct=82.0,
            dengue_cases=5,
        )
        for i in range(4, -1, -1)
    ]
    return WardHistory(ward=_SAMPLE, weeks=weeks)
