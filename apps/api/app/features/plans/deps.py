"""Dependency wiring for the plans decision-log vertical slice."""

from __future__ import annotations

from app.adapters.db.plan_store import get_plan_store

from .service import PlansService


def get_plans_service() -> PlansService:
    return PlansService(store=get_plan_store())
