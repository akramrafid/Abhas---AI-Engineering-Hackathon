"""Business logic for the plans decision-log vertical slice (framework-free; implemented in WP6)."""

from __future__ import annotations

from .schemas import PlanComparison, PlanCreateRequest, PlanKind, PlanList, PlanRecord


class PlansService:
    """Executes operational runs via shared.plan_registry and persists append-only plan records."""

    def create(self, req: PlanCreateRequest) -> PlanRecord:
        raise NotImplementedError("Implemented in WP6 (plans decision log)")

    def list_plans(self, *, kind: PlanKind | None = None, limit: int = 20) -> PlanList:
        raise NotImplementedError("Implemented in WP6 (plans decision log)")

    def compare(self, *, a_id: str, b_id: str) -> PlanComparison:
        raise NotImplementedError("Implemented in WP6 (plans decision log)")
