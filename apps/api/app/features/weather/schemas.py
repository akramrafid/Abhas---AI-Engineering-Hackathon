"""Contract: weather slice (LEAD owns). GET /api/v1/weather/status — where live weather comes from (SHOULD)."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.types import City, WeatherMode, WeatherSourceUsed


class CityWeatherStatus(BaseModel):
    city: City
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    source: WeatherSourceUsed
    last_fetched_at: datetime | None = None
    cache_age_hours: float | None = Field(default=None, ge=0)


class WeatherStatus(BaseModel):
    mode: WeatherMode
    provider: str = Field(examples=["Open-Meteo (CC BY 4.0)"])
    attribution: str
    ttl_hours: float = Field(ge=0)
    calls_today: int = Field(ge=0)
    bias_check_passed: bool | None = Field(default=None, description="Open-Meteo vs dataset historical check")
    cities: list[CityWeatherStatus]
