"""Dependency wiring for the weather vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_call_log
from app.adapters.openmeteo import get_weather_source

from .service import WeatherService


def get_weather_service() -> WeatherService:
    return WeatherService(provider=get_weather_source(), call_log=get_call_log())
