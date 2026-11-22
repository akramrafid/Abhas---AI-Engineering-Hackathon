"""Dependency wiring for the forecast vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.openmeteo import get_weather_source
from app.adapters.runtime import check_db_fault, get_forecast_model, get_ops_registry
from app.core.config import get_settings
from app.shared.forecast_engine import ForecastEngine

from .service import ForecastService


def get_forecast_service() -> ForecastService:
    settings = get_settings()
    engine = ForecastEngine(
        repo=get_observation_repository(),
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=get_weather_source(),
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
        strict_live_origin=(settings.weather_mode == "live"),
    )
    return ForecastService(engine)
