"""Dependency wiring for the counterfactual simulator vertical slice."""

from __future__ import annotations

from app.adapters.config_supply import get_supply_ratio_source
from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.runtime import check_db_fault, get_forecast_model, get_ops_registry
from app.shared.forecast_engine import ForecastEngine

from .service import SimulatorService


def get_simulator_service() -> SimulatorService:
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=None,
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
    )
    return SimulatorService(
        repo=repo,
        forecaster=engine,
        supply_source=get_supply_ratio_source(),
        db_fault_hook=check_db_fault,
    )
