"""Counterfactual simulator HTTP router: POST /api/v1/simulator/run (WP0 schema-valid stub)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.errors import PROBLEM_RESPONSES
from app.core.run_meta import current_run_meta
from app.shared.intervention import EFFICACY_PRESETS

from .schemas import (
    EfficacyParams,
    HorizonImpact,
    SimulatorRequest,
    SimulatorResponse,
    SimulatorTotals,
    WardImpact,
)

router = APIRouter(prefix="/api/v1", tags=["simulator"], responses=PROBLEM_RESPONSES)


def build_stub_simulator_response(req: SimulatorRequest) -> SimulatorResponse:
    """Return a schema-valid fixture response matching contracts §2.3."""
    meta = current_run_meta()
    e_max, k = EFFICACY_PRESETS[req.efficacy]
    return SimulatorResponse(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        request=req,
        efficacy=EfficacyParams(
            preset=req.efficacy,
            e_max=e_max,
            k=k,
            assumption_note="Assumed, not fitted: no intervention labels in the data. See ADR-0013.",
        ),
        wards=[
            WardImpact(
                rank=1,
                ward_id="DSCC_Ward_04",
                city="Dhaka South",
                crews=2,
                reduction_fraction=0.2528,
                horizons=[
                    HorizonImpact(
                        horizon=2,
                        baseline_cases=14.2,
                        counterfactual_cases=12.1,
                        cases_prevented=2.1,
                    ),
                    HorizonImpact(
                        horizon=3,
                        baseline_cases=15.0,
                        counterfactual_cases=12.9,
                        cases_prevented=2.1,
                    ),
                    HorizonImpact(
                        horizon=4,
                        baseline_cases=16.0,
                        counterfactual_cases=13.9,
                        cases_prevented=2.1,
                    ),
                ],
                cases_prevented=6.3,
                cases_prevented_low=3.2,
                cases_prevented_high=10.1,
                beds_avoided=1.86,
                saline_avoided=15.02,
                roi_cases_per_crew=3.15,
            )
        ],
        totals=SimulatorTotals(
            crews=2,
            cases_prevented=6.3,
            cases_prevented_low=3.2,
            cases_prevented_high=10.1,
            beds_avoided=1.86,
            saline_avoided=15.02,
        ),
    )


def stub_simulator_runner(req: SimulatorRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for simulation plans."""
    resp = build_stub_simulator_response(req)
    headline: dict[str, Any] = {
        "crews": resp.totals.crews,
        "cases_prevented": resp.totals.cases_prevented,
    }
    return resp.model_dump(mode="json"), headline


@router.post(
    "/simulator/run",
    response_model=SimulatorResponse,
    summary="Model-driven vector-control counterfactual simulation and ROI ranking",
)
async def run_simulator(req: SimulatorRequest) -> SimulatorResponse:
    return build_stub_simulator_response(req)
