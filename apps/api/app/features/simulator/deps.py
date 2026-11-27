"""Dependency wiring for the counterfactual simulator vertical slice."""

from __future__ import annotations

from .service import SimulatorService


def get_simulator_service() -> SimulatorService:
    return SimulatorService()
