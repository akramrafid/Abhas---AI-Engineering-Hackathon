"""Plans decision-log HTTP router: POST /api/v1/plans, GET /api/v1/plans, GET /api/v1/plans/compare."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.errors import PROBLEM_RESPONSES
from app.core.run_meta import current_run_meta
from app.shared.plan_registry import run as run_plan

from .schemas import (
    PlanComparison,
    PlanCreateRequest,
    PlanHeadline,
    PlanKind,
    PlanList,
    PlanMetricDiff,
    PlanRecord,
    PlanSummary,
    UuidStr,
)

router = APIRouter(prefix="/api/v1", tags=["plans"], responses=PROBLEM_RESPONSES)

_HEADLINE_METRICS: tuple[str, ...] = (
    "stock_pct",
    "mean_fulfilment_pct",
    "critical_wards",
    "deficit_wards",
    "crews",
    "cases_prevented",
    "unroutable_patients",
    "notices",
)


def _stub_summaries() -> list[PlanSummary]:
    meta = current_run_meta()
    return [
        PlanSummary(
            id="550e8400-e29b-41d4-a716-446655440001",
            kind="allocation",
            label="Dhaka South 60% stock",
            created_at=meta.generated_at,
            origin_week=date(2024, 8, 5),
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            headline=PlanHeadline(
                stock_pct=60,
                mean_fulfilment_pct=78.4,
                critical_wards=7,
                deficit_wards=12,
                crews=10,
            ),
        ),
        PlanSummary(
            id="550e8400-e29b-41d4-a716-446655440002",
            kind="allocation",
            label="Dhaka South 80% stock",
            created_at=meta.generated_at,
            origin_week=date(2024, 8, 5),
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            headline=PlanHeadline(
                stock_pct=80,
                mean_fulfilment_pct=91.2,
                critical_wards=3,
                deficit_wards=6,
                crews=10,
            ),
        ),
    ]


@router.post(
    "/plans",
    status_code=201,
    response_model=PlanRecord,
    summary="Execute and append-only persist an operational planning run",
)
async def create_plan(req: PlanCreateRequest) -> PlanRecord:
    meta = current_run_meta()
    outputs, headline_dict = run_plan(req.kind, req.request)
    return PlanRecord(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        id=str(uuid.uuid4()),
        kind=req.kind,
        label=req.label,
        created_at=meta.generated_at,
        origin_week=req.request.origin_week,
        inputs=req.request,
        outputs=outputs,
        headline=PlanHeadline.model_validate(headline_dict),
    )


@router.get(
    "/plans",
    response_model=PlanList,
    summary="List saved operational plans newest first",
)
async def list_plans(
    kind: Annotated[PlanKind | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PlanList:
    meta = current_run_meta()
    summaries = _stub_summaries()
    if kind is not None:
        summaries = [s for s in summaries if s.kind == kind]
    return PlanList(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        plans=summaries[:limit],
    )


@router.get(
    "/plans/compare",
    response_model=PlanComparison,
    summary="Compare headline KPIs between two saved plans (delta = b - a)",
)
async def compare_plans(
    a: Annotated[UuidStr, Query(description="UUID of baseline plan A")],
    b: Annotated[UuidStr, Query(description="UUID of candidate plan B")],
) -> PlanComparison:
    meta = current_run_meta()
    sample_a, sample_b = _stub_summaries()
    summary_a = sample_a.model_copy(update={"id": a})
    summary_b = sample_b.model_copy(update={"id": b})

    diffs: list[PlanMetricDiff] = []
    for metric in _HEADLINE_METRICS:
        va = getattr(summary_a.headline, metric)
        vb = getattr(summary_b.headline, metric)
        delta = round(float(vb) - float(va), 4) if (va is not None and vb is not None) else None
        diffs.append(PlanMetricDiff(metric=metric, a=va, b=vb, delta=delta))

    return PlanComparison(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        a=summary_a,
        b=summary_b,
        diffs=diffs,
    )
