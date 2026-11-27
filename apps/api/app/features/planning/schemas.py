"""Contract schemas for GET /api/v1/planning/structural (ADR-0021)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.core.run_meta import RunMeta
from app.core.types import City, WardId
from app.shared.structural import STRUCTURAL_DISCLAIMER, PrioritySignal


class EstimateWithCI(BaseModel):
    estimate: float
    ci_low: float
    ci_high: float


class SummaryEffect(BaseModel):
    glm: EstimateWithCI
    lgbm_pd: EstimateWithCI
    unclamped_glm_pct: float


class StructuralSummary(BaseModel):
    water_logging_minus_01: SummaryEffect
    water_logging_minus_02: SummaryEffect
    sanitation_plus_01: SummaryEffect
    sanitation_plus_02: SummaryEffect


class DualAnnualEffect(BaseModel):
    effective_delta: float
    glm: EstimateWithCI
    lgbm_pd: EstimateWithCI


class BuildVsSendRow(BaseModel):
    drainage_cases_per_yr_glm: float
    drainage_cases_per_yr_pd: float
    sim_roi_cases_per_crew: float = Field(ge=0)
    crew_deployments_equiv: float | None = Field(default=None, ge=0)
    priority_signal: PrioritySignal


class WardStructuralImpact(BaseModel):
    ward_id: WardId
    city: City
    water_logging_risk_index: float = Field(ge=0, le=1)
    sanitation_score: float = Field(ge=0, le=1)
    population_density_sqkm: float = Field(ge=0)
    baseline_cases_per_yr: float = Field(ge=0)
    water_logging_minus_01: DualAnnualEffect
    water_logging_minus_02: DualAnnualEffect
    sanitation_plus_01: DualAnnualEffect
    sanitation_plus_02: DualAnnualEffect
    build_vs_send: BuildVsSendRow


class GlmCoefficients(BaseModel):
    water_logging_risk_index: float
    sanitation_score: float


class StructuralPlannerResponse(RunMeta):
    dataset_sha256: str = Field(min_length=64, max_length=64)
    disclaimer: Literal["associations in simulated data, not causal real-world estimates"] = Field(
        default=STRUCTURAL_DISCLAIMER
    )
    fit_years: list[int] = Field(min_length=2, max_length=2)
    bootstrap_resamples: int = Field(ge=100)
    seed: int
    city_filter: City | None = None
    build_vs_send_origin_week: date
    glm_coefficients: GlmCoefficients
    summary: StructuralSummary
    wards: list[WardStructuralImpact]
