"""Contract: plans decision-log slice (contracts §2.6; ADR-0016).

Imports shared request models exclusively from app.core.command_requests so this slice
never imports another feature slice (ADR-0001).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.core.command_requests import (
    AllocationPlanCreate,
    AllocationRequest,
    DispatchPlanCreate,
    DispatchRequest,
    OverflowPlanCreate,
    OverflowRequest,
    PlanCreateRequest,
    PlanKind,
    SimulationPlanCreate,
    SimulatorRequest,
    UuidStr,
)
from app.core.run_meta import GitSha, RunMeta

__all__ = [
    "AllocationPlanCreate",
    "DispatchPlanCreate",
    "OverflowPlanCreate",
    "PlanComparison",
    "PlanCreateRequest",
    "PlanHeadline",
    "PlanKind",
    "PlanList",
    "PlanMetricDiff",
    "PlanRecord",
    "PlanSummary",
    "SimulationPlanCreate",
    "UuidStr",
]


class PlanHeadline(BaseModel):
    """Comparable headline KPIs extracted per plan kind (nullable when not applicable)."""

    stock_pct: int | None = None
    mean_fulfilment_pct: float | None = None
    critical_wards: int | None = None
    deficit_wards: int | None = None
    crews: int | None = None
    cases_prevented: float | None = None
    unroutable_patients: int | None = None
    notices: int | None = None


class PlanSummary(BaseModel):
    id: UuidStr
    kind: PlanKind
    label: str
    created_at: datetime
    origin_week: date
    scope: str | None = None
    model_version: str
    git_sha: GitSha
    headline: PlanHeadline


class PlanRecord(RunMeta):
    """POST /api/v1/plans 201 response (contracts §2.6)."""

    id: UuidStr
    kind: PlanKind
    label: str
    created_at: datetime
    origin_week: date
    inputs: AllocationRequest | OverflowRequest | SimulatorRequest | DispatchRequest
    outputs: dict[str, Any]
    headline: PlanHeadline


class PlanList(RunMeta):
    """GET /api/v1/plans response (contracts §2.6 + RunMeta provenance envelope)."""

    plans: list[PlanSummary]


class PlanMetricDiff(BaseModel):
    metric: str
    a: float | int | None = None
    b: float | int | None = None
    delta: float | None = None


class PlanComparison(RunMeta):
    """GET /api/v1/plans/compare response (contracts §2.6 + RunMeta provenance envelope)."""

    a: PlanSummary
    b: PlanSummary
    diffs: list[PlanMetricDiff]
