"""Dependency wiring for the validation vertical slice."""

from __future__ import annotations

from app.adapters.runtime import get_validation_payload

from .service import ValidationService


def get_validation_service() -> ValidationService:
    return ValidationService(loader=get_validation_payload)
