"""Dependency wiring for the dispatch vertical slice."""

from __future__ import annotations

from .service import DispatchService


def get_dispatch_service() -> DispatchService:
    return DispatchService()
