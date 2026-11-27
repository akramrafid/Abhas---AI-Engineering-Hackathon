"""Dependency wiring for the planning vertical slice."""

from __future__ import annotations

from app.adapters.config_planning import get_structural_planner_source

from .service import PlanningService


def get_planning_service() -> PlanningService:
    return PlanningService(source=get_structural_planner_source())
