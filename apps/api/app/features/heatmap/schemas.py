"""Contract: heatmap slice (LEAD owns). GET /api/v1/heatmap — ward × horizon tiers for one city (SHOULD)."""

from datetime import date

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.core.types import City, IsoWeek, Tier, WardId, WeatherMode, in_dataset_range


class HeatmapQuery(BaseModel):
    city: City
    source: WeatherMode = "dataset"
    origin_week: IsoWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29 in dataset mode"
    )

    @field_validator("origin_week")
    @classmethod
    def _origin_week_range(cls, value: date, info: ValidationInfo) -> date:
        if info.data.get("source", "dataset") == "dataset":
            return in_dataset_range(value)
        return value


class HeatmapCell(BaseModel):
    ward_id: WardId
    horizon: int = Field(ge=1, le=4)
    target_week: date
    tier: Tier
    expected_cases: float = Field(ge=0)
    risk_score: int = Field(ge=0, le=100)


class HeatmapResponse(BaseModel):
    city: City
    origin_week: date
    source: WeatherMode
    model_version: str
    ward_ids: list[WardId] = Field(description="Row order, sorted by peak risk then ward_id")
    horizons: list[int]
    cells: list[HeatmapCell]
