"""Dependency wiring for the heatmap vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.openmeteo import get_weather_source
from app.adapters.runtime import check_db_fault, get_forecast_model, get_ops_registry
from app.shared.forecast_engine import ForecastEngine

from .service import HeatmapService


def get_heatmap_service() -> HeatmapService:
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=get_weather_source(),
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
    )
    return HeatmapService(repo=repo, engine=engine, db_fault_hook=check_db_fault)
