"""STUB router (LEAD skeleton): schema-valid sample data. CORE replaces it with stored backtest results."""

from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.errors import PROBLEM_RESPONSES

from .schemas import ConfusionMatrix, CoverageRow, MetricRow, ModelName, ValidationResponse

_STUB_ROWS: tuple[tuple[ModelName, float], ...] = (("lightgbm", 1.02), ("climatology", 1.24))

router = APIRouter(prefix="/api/v1", tags=["validation"], responses=PROBLEM_RESPONSES)


@router.get("/validation", response_model=ValidationResponse, summary="Backtest metrics vs baselines")
def validation() -> ValidationResponse:
    return ValidationResponse(
        model_version="stub-0",
        generated_at=datetime.now(UTC),
        split="Expanding-window folds test 2019–2022; 2023 tunes; 2024–2025 locked hold-out",
        metrics=[
            MetricRow(
                model=m,
                horizon=3,
                period="holdout_2024_2025",
                mae=v,
                rmse=v * 1.5,
                poisson_deviance=v,
                n=6240,
            )
            for m, v in _STUB_ROWS
        ],
        coverage=[CoverageRow(horizon=3, period="holdout_2024_2025", coverage_80=0.8)],
        confusion=ConfusionMatrix(
            labels=["Low", "Medium", "High", "Critical"],
            matrix=[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
            within_one_tier=1.0,
            critical_recall=1.0,
            macro_f1=1.0,
        ),
    )
