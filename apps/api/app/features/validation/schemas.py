"""Contract: validation slice (LEAD owns). GET /api/v1/validation — chronological backtest results (SHOULD)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
