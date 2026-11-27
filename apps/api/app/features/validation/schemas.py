"""Contract: validation slice (LEAD owns). GET /api/v1/validation — chronological backtest results (SHOULD)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.run_meta import RunMeta
from app.core.types import Tier

ModelName = Literal[
    "lightgbm", "lightgbm_no_weather", "negbin_glm", "climatology", "seasonal_naive", "persistence"
]


class MetricRow(BaseModel):
    model: ModelName
    horizon: int = Field(ge=1, le=4)
    period: str = Field(
        description="Test fold year (2019–2022), 'tune_2023' or 'holdout_2024_2025'",
        examples=["2021", "holdout_2024_2025"],
    )
    mae: float = Field(ge=0)
    rmse: float = Field(ge=0)
    poisson_deviance: float = Field(ge=0)
    n: int = Field(ge=0, description="Ward-weeks scored")


class CoverageRow(BaseModel):
    horizon: int = Field(ge=1, le=4)
    period: str
    coverage_80: float = Field(ge=0, le=1)


class ConfusionMatrix(BaseModel):
    labels: list[Tier]
    matrix: list[list[int]] = Field(description="Rows = actual tier, columns = predicted tier")
    within_one_tier: float = Field(ge=0, le=1)
    critical_recall: float = Field(ge=0, le=1, description="Actual Critical predicted High or Critical")
    macro_f1: float = Field(ge=0, le=1)


class ValidationResponse(BaseModel):
    model_version: str
    generated_at: datetime
    split: str = Field(description="Human description of the chronological split")
    metrics: list[MetricRow]
    coverage: list[CoverageRow]
    confusion: ConfusionMatrix
    holdout_locked_sha256: str | None = Field(default=None, description="SHA-256 of the locked hold-out file")


class TriggerRuleSpec(BaseModel):
    rain_2w_gt_mm: float = Field(ge=0)
    water_logging_gte: float = Field(ge=0, le=1)
    target_horizon: int = Field(ge=1, le=4)
    high_case_threshold: int = Field(ge=1)
    fit_years: list[int] = Field(min_length=2, max_length=2)
    holdout_years: list[int] = Field(min_length=2, max_length=2)
    rule_text_en: str
    rule_text_bn: str


class LeadTimeStatsSchema(BaseModel):
    q25: float | None = Field(default=None, ge=0)
    median: float | None = Field(default=None, ge=0)
    q75: float | None = Field(default=None, ge=0)
    spells_covered: int = Field(ge=0)
    total_spells: int = Field(ge=0)


class TriggerMetricsSchema(BaseModel):
    hit_rate: float = Field(ge=0, le=1)
    false_alarm_ratio: float = Field(ge=0, le=1)
    false_alarm_rate: float = Field(ge=0, le=1)
    peirce_skill_score: float = Field(ge=-1, le=1)
    alerts: int = Field(ge=0)
    high_weeks: int = Field(ge=0)
    total_ward_weeks: int = Field(ge=1)
    tp: int = Field(ge=0)
    fp: int = Field(ge=0)
    fn: int = Field(ge=0)
    tn: int = Field(ge=0)
    lead_time_weeks: LeadTimeStatsSchema


class TriggerModelMetricsSchema(TriggerMetricsSchema):
    alert_mode: str
    threshold_cases: float | None = None
    calibrated_tier_hit_rate: float = Field(ge=0, le=1)
    calibrated_tier_far: float = Field(ge=0, le=1)
    calibrated_tier_pss: float = Field(ge=-1, le=1)


class TriggerComparisonSchema(BaseModel):
    hit_rate_delta: float
    far_delta: float
    pss_delta: float
    false_alarms_avoided: int
    model_meets_hit_rate: bool
    model_reduces_far: bool
    summary_note: str


class TriggerGridPointSchema(BaseModel):
    rain_2w_gt_mm: float
    water_logging_gte: float
    train_pss: float
    train_hit_rate: float
    train_far: float


class TriggerValidationResponse(RunMeta):
    dataset_sha256: str = Field(min_length=64, max_length=64)
    rule: TriggerRuleSpec
    holdout_rule: TriggerMetricsSchema
    holdout_model: TriggerModelMetricsSchema
    comparison: TriggerComparisonSchema
    grid_top: list[TriggerGridPointSchema]
