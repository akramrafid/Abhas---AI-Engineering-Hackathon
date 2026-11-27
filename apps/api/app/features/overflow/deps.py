"""Dependency wiring for the overflow routing vertical slice."""

from __future__ import annotations

from app.adapters.config_capacity import get_bed_capacity_source
from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.runtime import check_db_fault, get_forecast_model, get_ops_registry
from app.shared.forecast_engine import ForecastEngine

from .service import OverflowService, load_hospital_bed_ratio


def get_overflow_service() -> OverflowService:
    repo = get_observation_repository()
    model = get_forecast_model()
    engine = ForecastEngine(
        repo=repo,
        model=model,
        cache=get_prediction_cache(),
        weather_source=None,
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
    )
    return OverflowService(
        repo=repo,
        engine=engine,
        capacity_source=get_bed_capacity_source(),
        bed_ratio=load_hospital_bed_ratio(),
        nb_size_fn=lambda h: float(model.calibrations[h].nb_r),
        db_fault_hook=check_db_fault,
    )
