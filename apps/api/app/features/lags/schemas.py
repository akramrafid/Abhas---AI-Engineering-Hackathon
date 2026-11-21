"""Contract: lags slice (LEAD owns). GET /api/v1/wards/{ward_id}/lags — the rubric-R2 evidence panel."""

from datetime import date

from pydantic import BaseModel, Field

from app.core.types import City, WardId


class LagCorrelation(BaseModel):
    lag_weeks: int = Field(ge=0, le=8)
    ward_corr: float = Field(
        ge=-1, le=1, description="Ward × ISO-week-demeaned rain (lagged) vs demeaned cases"
    )
    dataset_corr: float = Field(ge=-1, le=1, description="Same statistic pooled over all 60 wards")


class LagPoint(BaseModel):
    week: date
    rainfall_mm: float = Field(
        ge=0, description="Observed rain in this week (the UI shifts it by the chosen lag)"
    )
    dengue_cases: int = Field(ge=0)


class LagResponse(BaseModel):
    ward_id: WardId
    city: City
    max_lag: int = Field(ge=0, le=8)
    peak_lag_ward: int = Field(ge=0, le=8)
    peak_lag_dataset: int = Field(ge=0, le=8)
    correlations: list[LagCorrelation]
    series: list[LagPoint] = Field(description="Last `weeks` weeks for the ward, date-sorted")
