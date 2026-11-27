"""Dependency wiring for the overflow routing vertical slice."""

from __future__ import annotations

from .service import OverflowService


def get_overflow_service() -> OverflowService:
    return OverflowService()
