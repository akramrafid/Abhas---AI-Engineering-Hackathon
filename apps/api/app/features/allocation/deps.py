"""Dependency wiring for the allocation vertical slice."""

from __future__ import annotations

from .service import AllocationService


def get_allocation_service() -> AllocationService:
    return AllocationService()
