"""Allocation slice HTTP router: POST /api/v1/allocation/plan (live WP1 engine)."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from app.core.errors import PROBLEM_MEDIA, PROBLEM_RESPONSES, Problem

from .deps import get_allocation_service
from .schemas import AllocationRequest, AllocationResponse
from .service import AllocationService

_ALLOCATION_RESPONSES: dict[int | str, dict[str, Any]] = {
    **PROBLEM_RESPONSES,
    409: {
        "model": Problem,
        "description": "Solver reported infeasibility after equity floor scaling",
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    },
}

router = APIRouter(prefix="/api/v1", tags=["allocation"], responses=_ALLOCATION_RESPONSES)


def live_allocation_runner(req: AllocationRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner executing the live AllocationService and returning (outputs, headline)."""
    svc = get_allocation_service()
    resp = svc.plan(req)
    if resp.wards:
        fulfilments = [
            line.fulfilment_pct
            for ward in resp.wards
            for line in (ward.saline_bags, ward.diagnostic_kits, ward.hospital_beds)
        ]
        mean_fulfilment_pct = round(sum(fulfilments) / len(fulfilments), 2)
    else:
        mean_fulfilment_pct = 100.0

    headline: dict[str, Any] = {
        "stock_pct": req.stock_pct,
        "mean_fulfilment_pct": mean_fulfilment_pct,
        "critical_wards": sum(c.critical_wards for c in resp.cities),
        "deficit_wards": sum(c.deficit_wards for c in resp.cities),
        "crews": sum(c.crews_assigned for c in resp.cities),
    }
    return resp.model_dump(mode="json"), headline


# Backward-compatible export for app/main.py registration without editing main.py.
stub_allocation_runner = live_allocation_runner


@router.post(
    "/allocation/plan",
    response_model=AllocationResponse,
    summary="Constrained intra-city supply allocation and crew placement",
)
async def plan_allocation(
    req: AllocationRequest,
    svc: AllocationService = Depends(get_allocation_service),
) -> AllocationResponse:
    return await asyncio.to_thread(svc.plan, req)
