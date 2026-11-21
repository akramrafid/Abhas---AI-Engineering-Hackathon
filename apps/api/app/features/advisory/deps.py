"""Dependency wiring for the advisory vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.openmeteo import get_weather_source
from app.adapters.runtime import (
    check_db_fault,
    get_forecast_model,
    get_llm_adapter,
    get_ops_registry,
    get_trace_sink,
)
from app.core.config import get_settings
from app.shared.forecast_engine import ForecastEngine

from .service import AdvisoryService


def get_advisory_service() -> AdvisoryService:
    settings = get_settings()
    cache = get_prediction_cache()
    engine = ForecastEngine(
        repo=get_observation_repository(),
        model=get_forecast_model(),
        cache=cache,
        weather_source=get_weather_source(),
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
        strict_live_origin=(settings.weather_mode == "live"),
    )
    return AdvisoryService(
        engine=engine,
        cache=cache,
        llm=get_llm_adapter(),
        max_output_tokens=settings.llm_max_output_tokens,
        trace_sink=get_trace_sink(),
        ops_metrics=get_ops_registry(),
    )
