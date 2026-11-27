"""Overflow routing slice HTTP router: POST /api/v1/overflow/route (contracts §2.2; ADR-0012)."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from app.core.errors import PROBLEM_MEDIA, PROBLEM_RESPONSES, Problem

from .deps import get_overflow_service
from .schemas import OverflowRequest, OverflowResponse
from .service import OverflowService

_OVERFLOW_RESPONSES: dict[int | str, dict[str, Any]] = {
    **PROBLEM_RESPONSES,
    409: {
        "model": Problem,
        "description": "Routing programme reported infeasibility",
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    },
}

router = APIRouter(prefix="/api/v1", tags=["overflow"], responses=_OVERFLOW_RESPONSES)


def live_overflow_runner(req: OverflowRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for live overflow routing."""
    resp = get_overflow_service().route(req)
    headline: dict[str, Any] = {
        "unroutable_patients": sum(c.unroutable_patients for c in resp.cities),
    }
    return resp.model_dump(mode="json"), headline


# Alias kept so LEAD-owned app/main.py registers the live overflow runner without edits.
stub_overflow_runner = live_overflow_runner


@router.post(
    "/overflow/route",
    response_model=OverflowResponse,
    summary="Intra-city hospital bed overflow routing",
)
async def route_overflow(
    req: OverflowRequest,
    svc: OverflowService = Depends(get_overflow_service),
) -> OverflowResponse:
    return await asyncio.to_thread(svc.route, req)
