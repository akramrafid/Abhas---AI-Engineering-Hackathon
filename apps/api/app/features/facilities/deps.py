"""Dependency wiring and manager role guard for the facilities vertical slice."""

from __future__ import annotations

import hmac

from fastapi import Header

from app.adapters.db.factory import get_facilities_store, get_observation_repository
from app.core.config import get_settings
from app.core.errors import AppError

from .service import FacilitiesService


def get_facilities_service() -> FacilitiesService:
    return FacilitiesService(
        store=get_facilities_store(),
        obs_repo=get_observation_repository(),
    )


def require_facility_manager(
    x_facility_role: str | None = Header(default=None, alias="X-Facility-Role"),
    x_facility_token: str | None = Header(default=None, alias="X-Facility-Token"),
) -> str:
    """Enforce manager role on bed-board writes (ADR-0018)."""
    if (x_facility_role or "").strip().lower() != "manager":
        raise AppError(
            403,
            "forbidden",
            "Manager role required",
            "Updating hospital bed counts requires X-Facility-Role: manager.",
        )
    settings = get_settings()
    if settings.facility_manager_token is not None:
        expected = settings.facility_manager_token.get_secret_value()
        provided = (x_facility_token or "").strip()
        if not expected or not hmac.compare_digest(provided, expected):
            raise AppError(
                403,
                "forbidden",
                "Invalid manager token",
                "A valid X-Facility-Token header is required for bed-board writes.",
            )
    return "manager"
