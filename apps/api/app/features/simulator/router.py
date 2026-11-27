"""Counterfactual simulator HTTP router: POST /api/v1/simulator/run (live WP3 engine)."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_simulator_service
from .schemas import SimulatorRequest, SimulatorResponse
from .service import SimulatorService

router = APIRouter(prefix="/api/v1", tags=["simulator"], responses=PROBLEM_RESPONSES)


def live_simulator_runner(req: SimulatorRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for live counterfactual simulations."""
    resp = get_simulator_service().run(req)
    headline: dict[str, Any] = {
        "crews": resp.totals.crews,
        "cases_prevented": resp.totals.cases_prevented,
    }
    return resp.model_dump(mode="json"), headline


# Backward-compatible export so app/main.py registers the live simulator runner without edits.
stub_simulator_runner = live_simulator_runner


@router.post(
    "/simulator/run",
    response_model=SimulatorResponse,
    summary="Model-driven vector-control counterfactual simulation and ROI ranking",
)
async def run_simulator(
    req: SimulatorRequest,
    svc: SimulatorService = Depends(get_simulator_service),
) -> SimulatorResponse:
    return await asyncio.to_thread(svc.run, req)
