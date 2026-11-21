"""Contract: forecast slice (LEAD owns). POST /api/v1/forecast, POST /api/v1/scenario."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.core.types import (
    City,
    DatasetOriginWeek,
    Horizon,
    IsoWeek,
    Tier,
    WardId,
    WeatherMode,
    WeatherSourceUsed,
    in_dataset_range,
)

DriverKey = Literal[
    "rain_2_4w", "recent_rain", "heat", "humidity", "water_logging", "crowding", "sanitation", "season"
]


class Driver(BaseModel):
    key: DriverKey
    label: str = Field(examples=["Rain 2–4 weeks ago"])
    effect_pct: float = Field(description="Multiplicative effect on expected cases, in percent (+60 = ×1.6)")
    direction: Literal["up", "down"]


class HorizonForecast(BaseModel):
    horizon: Horizon
    target_week: date = Field(description="Monday of the forecast week = origin_week + horizon weeks")
    expected_cases: float = Field(ge=0)
    p10: float = Field(ge=0, description="Lower edge of the 80 % band")
    p90: float = Field(ge=0, description="Upper edge of the 80 % band (≥ expected_cases)")
    risk_score: int = Field(ge=0, le=100, description="P(cases ≥ High cut-off) × 100")
    tier: Tier
    tier_escalated: bool = Field(description="True when P90 exceeded the ward's epidemic threshold (+1 tier)")
    drivers: list[Driver] = Field(max_length=4, description="Top drivers by absolute effect")


class WardForecast(BaseModel):
    ward_id: WardId
    city: City
    peak_tier: Tier = Field(description="Highest tier across the requested horizons")
    horizons: list[HorizonForecast]


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ward_ids: list[WardId] = Field(min_length=1, max_length=60)
    source: WeatherMode = "dataset"
    origin_week: IsoWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29 in dataset mode"
    )
    horizons: list[Horizon] = Field(default=[1, 2, 3, 4], min_length=1, max_length=4)

    @field_validator("origin_week")
    @classmethod
    def _origin_week_range(cls, value: date, info: ValidationInfo) -> date:
        if info.data.get("source", "dataset") == "dataset":
            return in_dataset_range(value)
        return value

    @model_validator(mode="after")
    def _unique(self) -> "ForecastRequest":
        if len(set(self.horizons)) != len(self.horizons):
            raise ValueError("horizons must be unique")
        if len(set(self.ward_ids)) != len(self.ward_ids):
            raise ValueError("ward_ids must be unique")
        return self


class ForecastResponse(BaseModel):
    origin_week: date
    source: WeatherMode
    weather_source: WeatherSourceUsed = Field(description="Where the weather actually came from")
    model_version: str
    generated_at: datetime
    cached: bool
    forecasts: list[WardForecast]


class WeatherOverride(BaseModel):
    """What-if weather for the origin week (this week). Omitted fields keep the observed value."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    rainfall_mm: float | None = Field(default=None, ge=0, le=500, allow_inf_nan=False)
    avg_temp_c: float | None = Field(default=None, ge=5, le=45, allow_inf_nan=False)
    relative_humidity_pct: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @field_validator("rainfall_mm", "avg_temp_c", "relative_humidity_pct", mode="before")
    @classmethod
    def _reject_non_numeric(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("must be a JSON number")
        return value

    @model_validator(mode="after")
    def _any(self) -> "WeatherOverride":
        if self.rainfall_mm is None and self.avg_temp_c is None and self.relative_humidity_pct is None:
            raise ValueError("set at least one of rainfall_mm, avg_temp_c, relative_humidity_pct")
        return self


class ScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ward_id: WardId
    origin_week: DatasetOriginWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29"
    )
    horizons: list[Horizon] = Field(default=[1, 2, 3, 4], min_length=1, max_length=4)
    weather: WeatherOverride

    @model_validator(mode="after")
    def _unique_horizons(self) -> "ScenarioRequest":
        if len(set(self.horizons)) != len(self.horizons):
            raise ValueError("horizons must be unique")
        return self


class ScenarioResponse(BaseModel):
    ward_id: WardId
    origin_week: date
    model_version: str
    weather: WeatherOverride
    baseline: list[HorizonForecast]
    scenario: list[HorizonForecast]
