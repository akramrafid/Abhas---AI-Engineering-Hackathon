"""Contract: heatmap slice (LEAD owns). GET /api/v1/heatmap — ward × horizon tiers for one city (SHOULD)."""

from datetime import date

from pydantic import BaseModel, Field

from app.core.types import City, Tier, WardId, WeatherMode


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
