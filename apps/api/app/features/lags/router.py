"""STUB router (LEAD skeleton): schema-valid sample data. DATA (data-pipeline) replaces the body."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.errors import PROBLEM_RESPONSES, AppError
from app.core.types import DATA_END, WARD_ID_PATTERN

from .schemas import LagCorrelation, LagPoint, LagResponse

router = APIRouter(prefix="/api/v1/wards", tags=["lags"], responses=PROBLEM_RESPONSES)

_STUB_CORR = [0.03, 0.07, 0.23, 0.47, 0.33, 0.05, 0.0, -0.01, 0.0]


@router.get("/{ward_id}/lags", response_model=LagResponse, summary="Rainfall lag 0–8 evidence for one ward")
def ward_lags(
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN)],
    weeks: Annotated[int, Query(ge=26, le=522)] = 156,
) -> LagResponse:
    if ward_id != "DSCC_Ward_07":
        raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")
    n = min(weeks, 12)
    return LagResponse(
        ward_id=ward_id,
        city="Dhaka South",
        max_lag=8,
        peak_lag_ward=3,
        peak_lag_dataset=3,
        correlations=[
            LagCorrelation(lag_weeks=k, ward_corr=c, dataset_corr=c) for k, c in enumerate(_STUB_CORR)
        ],
        series=[
            LagPoint(week=DATA_END - timedelta(weeks=n - 1 - i), rainfall_mm=50.0 + i, dengue_cases=i)
            for i in range(n)
        ],
    )
