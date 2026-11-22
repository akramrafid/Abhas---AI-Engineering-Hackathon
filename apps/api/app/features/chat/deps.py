"""Dependency wiring for the chat vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.openmeteo import get_weather_source
from app.adapters.runtime import (
    check_db_fault,
    get_chat_llm_adapter,
    get_forecast_model,
    get_ops_registry,
)
from app.core.config import get_settings
from app.shared.forecast_engine import ForecastEngine

from .service import ChatService


def get_chat_service() -> ChatService:
    settings = get_settings()
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=get_weather_source(),
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
        strict_live_origin=False,
    )
    return ChatService(
        repo=repo,
        engine=engine,
        llm=get_chat_llm_adapter(),
        max_output_tokens=settings.gemini_max_output_tokens,
    )
