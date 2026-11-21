"""Map LightGBM log-space SHAP contributions to the 8 human-readable Abhas drivers."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

DriverKey = Literal[
    "rain_2_4w",
    "recent_rain",
    "heat",
    "humidity",
    "water_logging",
    "crowding",
    "sanitation",
    "season",
]

DRIVER_LABELS: dict[DriverKey, str] = {
    "rain_2_4w": "Rain 2–4 weeks ago",
    "recent_rain": "Recent rain",
    "heat": "Heat",
    "humidity": "Humidity",
    "water_logging": "Water-logging",
    "crowding": "Crowding",
    "sanitation": "Sanitation",
    "season": "Season",
}

ALL_DRIVER_KEYS: tuple[DriverKey, ...] = (
    "rain_2_4w",
    "recent_rain",
    "heat",
    "humidity",
    "water_logging",
    "crowding",
    "sanitation",
    "season",
)

# Align log-space bounds with lgbm_model.py raw_margin clip [-20.0, 10.0] to prevent overflow
# without distorting strong negative off-season seasonal effects.
_MIN_LOG_CONTRIB = -20.0
_MAX_LOG_CONTRIB = 10.0


@dataclass(frozen=True)
class DriverContribution:
    key: DriverKey
    label: str
    effect_pct: float
    direction: Literal["up", "down"]


def feature_to_driver_key(feature_name: str, horizon: int) -> DriverKey:
    """Assign each feature from app/shared/features.py to one of the 8 human driver buckets.

    For rainfall lags, `lag_before_target = horizon + k` aligns with the 2–4 week Aedes aegypti
    breeding cycle relative to the forecast target week.
    """
    if feature_name.startswith("rainfall_lag_"):
        k = int(feature_name.removeprefix("rainfall_lag_"))
        lag_before_target = horizon + k
        if 2 <= lag_before_target <= 4:
            return "rain_2_4w"
        return "recent_rain"
    if feature_name == "rain_anomaly":
        return "rain_2_4w" if horizon >= 2 else "recent_rain"
    if feature_name in ("rain_sum_0_3", "rain_sum_4_7"):
        return "recent_rain"
    if feature_name.startswith("temp_"):
        return "heat"
    if feature_name.startswith("humidity_"):
        return "humidity"
    if feature_name == "water_logging_risk_index":
        return "water_logging"
    if feature_name == "population_density_sqkm":
        return "crowding"
    if feature_name == "sanitation_score":
        return "sanitation"
    if feature_name in ("iso_week_sin", "iso_week_cos"):
        return "season"
    return "season"


def group_driver_log_sums(
    contributions: Mapping[str, float],
    horizon: int,
) -> dict[DriverKey, float]:
    """Sum per-feature log-space SHAP contributions across all 8 canonical driver buckets."""
    bucket_sums: dict[DriverKey, float] = {k: 0.0 for k in ALL_DRIVER_KEYS}
    for feat, val in contributions.items():
        if not math.isfinite(val):
            continue
        key = feature_to_driver_key(feat, horizon)
        bucket_sums[key] += float(val)
    return bucket_sums


def group_driver_multipliers(
    contributions: Mapping[str, float],
    horizon: int,
) -> dict[DriverKey, float]:
    """Convert all 8 grouped log-space SHAP buckets into exact multiplicative factors `exp(s_b)`."""
    log_sums = group_driver_log_sums(contributions, horizon)
    return {
        key: math.exp(max(_MIN_LOG_CONTRIB, min(_MAX_LOG_CONTRIB, log_sum)))
        for key, log_sum in log_sums.items()
    }


def contributions_to_drivers_with_other(
    contributions: Mapping[str, float],
    horizon: int,
    *,
    top_k: int = 4,
) -> tuple[list[DriverContribution], float]:
    """Return `(top_k_drivers, other_multiplier)` where top-K plus `other` preserve the full product.

    Under Poisson log-link, `exp(base_margin) * prod(exp(s_top)) * other_multiplier == expected_cases`.
    """
    if not contributions or top_k <= 0:
        return [], 1.0

    bucket_sums: dict[DriverKey, float] = {}
    for feat, val in contributions.items():
        if not math.isfinite(val):
            continue
        key = feature_to_driver_key(feat, horizon)
        bucket_sums[key] = bucket_sums.get(key, 0.0) + float(val)

    candidates: list[DriverContribution] = []
    for key, log_sum in bucket_sums.items():
        clamped = max(_MIN_LOG_CONTRIB, min(_MAX_LOG_CONTRIB, log_sum))
        pct = round((math.exp(clamped) - 1.0) * 100.0, 1)
        if pct == -0.0:
            pct = 0.0
        direction: Literal["up", "down"] = "up" if pct >= 0.0 else "down"
        candidates.append(
            DriverContribution(
                key=key,
                label=DRIVER_LABELS[key],
                effect_pct=pct,
                direction=direction,
            )
        )

    non_trivial = [c for c in candidates if abs(c.effect_pct) >= 0.1]
    pool = non_trivial if non_trivial else candidates
    pool.sort(key=lambda c: (-abs(c.effect_pct), c.key))
    selected = pool[:top_k]
    selected_keys = {d.key for d in selected}
    other_log_sum = sum(v for k, v in bucket_sums.items() if k not in selected_keys)
    other_mult = math.exp(max(_MIN_LOG_CONTRIB, min(_MAX_LOG_CONTRIB, other_log_sum)))
    return selected, other_mult


def contributions_to_drivers(
    contributions: Mapping[str, float],
    horizon: int,
    *,
    top_k: int = 4,
) -> list[DriverContribution]:
    """Convert per-feature log-space SHAP values into top-K multiplicative percentage drivers.

    Under Poisson log-link, summing log-space SHAP values within a bucket `b` yields an exact
    multiplicative factor `exp(s_b)`, expressed as `(exp(s_b) - 1) * 100` percent.
    """
    selected, _ = contributions_to_drivers_with_other(contributions, horizon, top_k=top_k)
    return selected
