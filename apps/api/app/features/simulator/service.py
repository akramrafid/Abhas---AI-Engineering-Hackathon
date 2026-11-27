"""Business logic for the counterfactual simulator vertical slice (framework-free; implemented in WP3)."""

from __future__ import annotations

from .schemas import SimulatorRequest, SimulatorResponse


class SimulatorService:
    """Runs model-driven vector-control counterfactual simulations and ROI rankings."""

    def run(self, req: SimulatorRequest) -> SimulatorResponse:
        raise NotImplementedError("Implemented in WP3 (counterfactual simulator)")
