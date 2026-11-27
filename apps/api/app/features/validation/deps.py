"""Dependency wiring for the validation vertical slice."""

from __future__ import annotations

from app.adapters.config_planning import get_trigger_evaluation_source
from app.adapters.runtime import get_validation_payload

from .service import ValidationService


def get_validation_service() -> ValidationService:
    return ValidationService(
        loader=get_validation_payload,
        trigger_source=get_trigger_evaluation_source(),
    )
