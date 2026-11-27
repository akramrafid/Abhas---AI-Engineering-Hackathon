"""Contract: counterfactual simulator slice (contracts §2.3; ADR-0013, ADR-0011)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.command_requests import Deployment, EfficacyPreset, SimulatorRequest
from app.core.run_meta import RunMeta
from app.core.types import City, Horizon, WardId

__all__ = [
    "Deployment",
    "EfficacyParams",
    "EfficacyPreset",
    "HorizonImpact",
    "SimulatorRequest",
    "SimulatorResponse",
    "SimulatorTotals",
    "WardImpact",
]


class EfficacyParams(BaseModel):
    preset: EfficacyPreset
    e_max: float = Field(gt=0.0, lt=1.0)
    k: float = Field(gt=0.0)
    assumption_note: str


class HorizonImpact(BaseModel):
    horizon: Horizon
    baseline_cases: float = Field(ge=0.0)
    counterfactual_cases: float = Field(ge=0.0)
    cases_prevented: float = Field(ge=0.0)


class WardImpact(BaseModel):
    rank: int = Field(ge=1)
    ward_id: WardId
    city: City
    crews: int = Field(ge=1)
    reduction_fraction: float = Field(ge=0.0, lt=1.0)
    horizons: list[HorizonImpact]
    cases_prevented: float = Field(ge=0.0)
    cases_prevented_low: float = Field(ge=0.0)
    cases_prevented_high: float = Field(ge=0.0)
    beds_avoided: float = Field(ge=0.0)
    saline_avoided: float = Field(ge=0.0)
    roi_cases_per_crew: float = Field(ge=0.0)


class SimulatorTotals(BaseModel):
    crews: int = Field(ge=0)
    cases_prevented: float = Field(ge=0.0)
    cases_prevented_low: float = Field(ge=0.0)
    cases_prevented_high: float = Field(ge=0.0)
    beds_avoided: float = Field(ge=0.0)
    saline_avoided: float = Field(ge=0.0)


class SimulatorResponse(RunMeta):
    """POST /api/v1/simulator/run response (contracts §2.3)."""

    request: SimulatorRequest
    efficacy: EfficacyParams
    wards: list[WardImpact]
    totals: SimulatorTotals
