"""Overflow routing slice HTTP router: POST /api/v1/overflow/route (WP0 schema-valid stub)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.errors import PROBLEM_MEDIA, PROBLEM_RESPONSES, Problem
from app.core.run_meta import current_run_meta

from .schemas import (
    CityBedSummary,
    OverflowRequest,
    OverflowResponse,
    Transfer,
    WardBedStatus,
)

_OVERFLOW_RESPONSES: dict[int | str, dict[str, Any]] = {
    **PROBLEM_RESPONSES,
    409: {
        "model": Problem,
        "description": "Routing programme reported infeasibility",
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    },
}

router = APIRouter(prefix="/api/v1", tags=["overflow"], responses=_OVERFLOW_RESPONSES)


def build_stub_overflow_response(req: OverflowRequest) -> OverflowResponse:
    """Return a schema-valid fixture response matching contracts §2.2."""
    meta = current_run_meta()
    return OverflowResponse(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        request=req,
        capacity_method="ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022)",
        wards=[
            WardBedStatus(
                ward_id="DNCC_Ward_09",
                city="Dhaka North",
                beds_required=9,
                capacity=5,
                capacity_source="derived",
                local_deficit=4,
                headroom_before=0,
                transferred_out=4,
                transferred_in=0,
                net_deficit=0,
                utilisation_before=1.8,
                utilisation_after=1.0,
            ),
            WardBedStatus(
                ward_id="DNCC_Ward_02",
                city="Dhaka North",
                beds_required=2,
                capacity=6,
                capacity_source="derived",
                local_deficit=0,
                headroom_before=4,
                transferred_out=0,
                transferred_in=4,
                net_deficit=0,
                utilisation_before=0.333,
                utilisation_after=1.0,
            ),
        ],
        transfers=[
            Transfer(
                city="Dhaka North",
                from_ward="DNCC_Ward_09",
                to_ward="DNCC_Ward_02",
                patients=4,
            )
        ],
        cities=[
            CityBedSummary(
                city="Dhaka North",
                capacity_total=96,
                required_total=88,
                utilisation_before=0.917,
                utilisation_after=0.917,
                headroom_after=8,
                unroutable_patients=0,
                transfers=3,
            )
        ],
        solve_ms=4.0,
    )


def stub_overflow_runner(req: OverflowRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for overflow plans."""
    resp = build_stub_overflow_response(req)
    headline: dict[str, Any] = {
        "unroutable_patients": sum(c.unroutable_patients for c in resp.cities),
    }
    return resp.model_dump(mode="json"), headline


@router.post(
    "/overflow/route",
    response_model=OverflowResponse,
    summary="Intra-city hospital bed overflow routing",
)
async def route_overflow(req: OverflowRequest) -> OverflowResponse:
    return build_stub_overflow_response(req)
