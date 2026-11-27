"""Plans decision-log HTTP router: POST /api/v1/plans, GET /api/v1/plans, GET /api/v1/plans/compare."""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_plans_service
from .schemas import (
    PlanComparison,
    PlanCreateRequest,
    PlanKind,
    PlanList,
    PlanRecord,
    UuidStr,
)
from .service import PlansService

router = APIRouter(prefix="/api/v1", tags=["plans"], responses=PROBLEM_RESPONSES)


@router.post(
    "/plans",
    status_code=201,
    response_model=PlanRecord,
    summary="Execute and append-only persist an operational planning run",
)
async def create_plan(
    req: PlanCreateRequest,
    service: Annotated[PlansService, Depends(get_plans_service)],
) -> PlanRecord:
    return await asyncio.to_thread(service.create, req)


@router.get(
    "/plans",
    response_model=PlanList,
    summary="List saved operational plans newest first",
)
async def list_plans(
    service: Annotated[PlansService, Depends(get_plans_service)],
    kind: Annotated[PlanKind | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PlanList:
    return await asyncio.to_thread(service.list_plans, kind=kind, limit=limit)


@router.get(
    "/plans/compare",
    response_model=PlanComparison,
    summary="Compare headline KPIs between two saved plans (delta = b - a)",
)
async def compare_plans(
    service: Annotated[PlansService, Depends(get_plans_service)],
    a: Annotated[UuidStr, Query(description="UUID of baseline plan A")],
    b: Annotated[UuidStr, Query(description="UUID of candidate plan B")],
) -> PlanComparison:
    return await asyncio.to_thread(service.compare, a_id=a, b_id=b)
