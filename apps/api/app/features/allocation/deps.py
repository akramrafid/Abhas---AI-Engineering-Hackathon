"""Dependency wiring for the allocation vertical slice (WP1 + WP3 greedy crew assignment)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date

from app.adapters.config_supply import get_supply_ratio_source
from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.runtime import check_db_fault, get_forecast_model, get_ops_registry
from app.ports.repositories import WardRecord
from app.shared.forecast_engine import ForecastEngine
from app.shared.intervention import assign_crews_for_wards
from app.shared.optimizer import CrewAssignmentResult

from .service import AllocationService


def get_allocation_service() -> AllocationService:
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=None,
        ops_metrics=get_ops_registry(),
        db_fault_hook=check_db_fault,
    )

    def _crew_assigner(
        wards: Sequence[WardRecord],
        origin_week: date,
        horizons: Sequence[int],
        total_crews: int,
        priority_weights: Mapping[str, float],
    ) -> CrewAssignmentResult:
        return assign_crews_for_wards(
            forecaster=engine,
            ward_ids=[w.ward_id for w in wards],
            origin_week=origin_week,
            horizons=horizons,
            total_crews=total_crews,
            weights=priority_weights,
            efficacy="base",
            cap=5,
        )

    return AllocationService(
        repo=repo,
        engine=engine,
        supply_source=get_supply_ratio_source(),
        crew_assigner=_crew_assigner,
        db_fault_hook=check_db_fault,
    )
