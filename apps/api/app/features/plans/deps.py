"""Dependency wiring for the plans decision-log vertical slice."""

from __future__ import annotations

from .service import PlansService


def get_plans_service() -> PlansService:
    return PlansService()
