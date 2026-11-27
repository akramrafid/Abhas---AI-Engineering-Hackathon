"""Business logic for the overflow routing vertical slice (framework-free; implemented in WP2)."""

from __future__ import annotations

from .schemas import OverflowRequest, OverflowResponse


class OverflowService:
    """Computes intra-city hospital bed overflow routing plans."""

    def route(self, req: OverflowRequest) -> OverflowResponse:
        raise NotImplementedError("Implemented in WP2 (intra-city overflow routing)")
