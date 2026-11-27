"""Dependency wiring for the dispatch vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository
from app.adapters.db.plan_store import get_plan_store

from .service import DispatchService


def get_dispatch_service() -> DispatchService:
    return DispatchService(
        repo=get_observation_repository(),
        plan_store=get_plan_store(),
    )
