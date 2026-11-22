"""Port: the trained forecaster. The adapter (app/adapters/lgbm_model.py) loads the joblib artifact once."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class PointForecast:
    expected_cases: float
    p10: float
    p90: float
    risk_score: int  # 0–100 = P(cases >= High cut-off) under the fitted negative binomial
    tier: str  # Low | Medium | High | Critical (after escalation)
    tier_escalated: bool
    contributions: Mapping[str, float] = field(default_factory=dict)  # feature -> log-space SHAP value


class ForecastModel(Protocol):
    version: str
    feature_names: Sequence[str]

    def predict(self, rows: Sequence[Mapping[str, float]], horizon: int) -> list[PointForecast]:
        """Predict one horizon (1–4) for feature rows built by app/shared/features.py."""
        ...
