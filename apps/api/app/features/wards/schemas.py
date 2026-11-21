"""Contract: wards slice (LEAD owns). GET /api/v1/wards, GET /api/v1/wards/{ward_id}/history."""

from datetime import date

from pydantic import BaseModel, Field

from app.core.types import City, WardId


class Ward(BaseModel):
    ward_id: WardId
    city: City
    population_density_sqkm: float = Field(ge=0)
    water_logging_risk_index: float = Field(ge=0, le=1)
    sanitation_score: float = Field(ge=0, le=1)


class WardList(BaseModel):
    wards: list[Ward]
    cities: list[City]
    data_start: date = Field(description="First week in the dataset (Monday)")
    data_end: date = Field(description="Last observed week in the dataset (Monday)")
    first_forecast_origin: date = Field(description="Earliest origin week with all 0–8 week lags (Monday)")


class WeekObservation(BaseModel):
    week: date
    avg_temp_c: float
    max_temp_c: float
    min_temp_c: float
    rainfall_mm: float = Field(ge=0)
    relative_humidity_pct: float = Field(ge=0, le=100)
    dengue_cases: int = Field(ge=0)


class WardHistory(BaseModel):
    ward: Ward
    weeks: list[WeekObservation] = Field(description="Date-sorted weekly rows, inclusive range")
