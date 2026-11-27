"""Business logic for the allocation vertical slice (framework-free; implemented in WP1/WP3)."""

from __future__ import annotations

from .schemas import AllocationRequest, AllocationResponse


class AllocationService:
    """Computes constrained regional supply allocations and greedy crew assignments."""

    def plan(self, req: AllocationRequest) -> AllocationResponse:
        raise NotImplementedError("Implemented in WP1 (supply allocation) and WP3 (crew wiring)")
