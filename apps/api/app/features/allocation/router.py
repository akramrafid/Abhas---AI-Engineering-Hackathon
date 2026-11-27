"""Allocation slice HTTP router: POST /api/v1/allocation/plan (WP0 schema-valid stub)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.errors import PROBLEM_MEDIA, PROBLEM_RESPONSES, Problem
from app.core.run_meta import current_run_meta

from .schemas import (
    AllocationRequest,
    AllocationResponse,
    CityAllocationSummary,
    CityResourceTotals,
    ResourceLine,
    WardAllocation,
)

_ALLOCATION_RESPONSES: dict[int | str, dict[str, Any]] = {
    **PROBLEM_RESPONSES,
    409: {
        "model": Problem,
        "description": "Solver reported infeasibility after equity floor scaling",
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    },
}

router = APIRouter(prefix="/api/v1", tags=["allocation"], responses=_ALLOCATION_RESPONSES)


def build_stub_allocation_response(req: AllocationRequest) -> AllocationResponse:
    """Return a schema-valid fixture response matching contracts §2.1."""
    meta = current_run_meta()
    saline_level = req.service_level if req.service_level is not None else 0.8
    beds_level = req.service_level if req.service_level is not None else 0.9
    return AllocationResponse(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        request=req,
        supply_ratios={
            "saline_bags": 2.385,
            "diagnostic_kits": 1.164,
            "hospital_beds": 0.298,
        },
        service_levels={
            "saline_bags": saline_level,
            "diagnostic_kits": saline_level,
            "hospital_beds": beds_level,
        },
        crew_method="greedy",
        wards=[
            WardAllocation(
                ward_id="DSCC_Ward_04",
                city="Dhaka South",
                tier="Critical",
                expected_cases=47.2,
                planned_cases=58.0,
                density_factor=1.73,
                priority_weight=13.84,
                saline_bags=ResourceLine(required=139, allocated=139, deficit=0, fulfilment_pct=100.0),
                diagnostic_kits=ResourceLine(required=68, allocated=68, deficit=0, fulfilment_pct=100.0),
                hospital_beds=ResourceLine(required=18, allocated=18, deficit=0, fulfilment_pct=100.0),
                crews=3,
                deficit_level="none",
                deficit_reasons=[],
            )
        ],
        cities=[
            CityAllocationSummary(
                city="Dhaka South",
                resources=[
                    CityResourceTotals(
                        resource="saline_bags",
                        required=1890,
                        available=1134,
                        allocated=1134,
                        floors_scaled=False,
                    ),
                    CityResourceTotals(
                        resource="diagnostic_kits",
                        required=918,
                        available=551,
                        allocated=551,
                        floors_scaled=False,
                    ),
                    CityResourceTotals(
                        resource="hospital_beds",
                        required=234,
                        available=140,
                        allocated=140,
                        floors_scaled=False,
                    ),
                ],
                crews_assigned=10,
                critical_wards=7,
                deficit_wards=12,
            )
        ],
        solve_ms=6.1,
    )


def stub_allocation_runner(req: AllocationRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for allocation plans."""
    resp = build_stub_allocation_response(req)
    headline: dict[str, Any] = {
        "stock_pct": req.stock_pct,
        "mean_fulfilment_pct": 100.0,
        "critical_wards": sum(c.critical_wards for c in resp.cities),
        "deficit_wards": sum(c.deficit_wards for c in resp.cities),
        "crews": sum(c.crews_assigned for c in resp.cities),
    }
    return resp.model_dump(mode="json"), headline


@router.post(
    "/allocation/plan",
    response_model=AllocationResponse,
    summary="Constrained intra-city supply allocation and crew placement",
)
async def plan_allocation(req: AllocationRequest) -> AllocationResponse:
    return build_stub_allocation_response(req)
