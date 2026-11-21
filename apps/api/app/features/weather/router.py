"""STUB router (LEAD skeleton): schema-valid sample data. DATA (data-pipeline) replaces the body."""

from fastapi import APIRouter

from app.core.errors import PROBLEM_RESPONSES

from .schemas import CityWeatherStatus, WeatherStatus

router = APIRouter(prefix="/api/v1/weather", tags=["weather"], responses=PROBLEM_RESPONSES)


@router.get("/status", response_model=WeatherStatus, summary="Weather source, cache age and call count")
def weather_status() -> WeatherStatus:
    return WeatherStatus(
        mode="dataset",
        provider="Open-Meteo",
        attribution="Weather data by Open-Meteo.com (CC BY 4.0)",
        ttl_hours=6.0,
        calls_today=0,
        bias_check_passed=None,
        cities=[CityWeatherStatus(city="Dhaka South", latitude=23.72, longitude=90.41, source="dataset")],
    )
