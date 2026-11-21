"""Dependency wiring for the wards vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_observation_repository

from .service import WardsService


def get_wards_service() -> WardsService:
    return WardsService(get_observation_repository())
