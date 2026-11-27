"""Pure vector-control efficacy curve, monotone rain feature sets, and counterfactual helpers.

Contracts §4; ADR-0013. Constants ``EFFICACY_PRESETS`` and ``MONOTONE_RAIN_FEATURES`` are locked in WP0
(the latter verified by test against ``ml/train.py:monotone_constraints_for_horizon`` for h = 2, 3, 4).
Function bodies are implemented in WP3.
"""

from __future__ import annotations

from collections.abc import Mapping

# Documented efficacy assumptions (E_max, k) for E(c) = E_max * (1 - exp(-k * c)) (ADR-0013).
EFFICACY_PRESETS: dict[str, tuple[float, float]] = {
    "low": (0.25, 0.35),
    "base": (0.40, 0.50),
    "high": (0.55, 0.70),
}

# Exact per-horizon +1 monotone rainfall features constrained in ml/train.py for h = 2, 3, 4.
MONOTONE_RAIN_FEATURES: dict[int, frozenset[str]] = {
    2: frozenset({"rainfall_lag_0", "rainfall_lag_1", "rainfall_lag_2", "rain_sum_0_3", "rain_anomaly"}),
    3: frozenset({"rainfall_lag_0", "rainfall_lag_1", "rain_sum_0_3", "rain_anomaly"}),
    4: frozenset({"rainfall_lag_0", "rain_sum_0_3", "rain_anomaly"}),
}


def reduction(crews: int, e_max: float, k: float) -> float:
    """Compute diminishing-returns breeding-water reduction ``e_max * (1 - exp(-k * crews))`` in [0, e_max).

    Returns 0.0 when ``crews == 0``.
    """
    raise NotImplementedError("Implemented in WP3 (counterfactual simulator)")


def apply_reduction(
    feature_row: Mapping[str, float],
    horizon: int,
    fraction: float,
    rain_total: float,
) -> dict[str, float]:
    """Return a new feature dict with only ``horizon``'s monotone rain features reduced by ``fraction``.

    Invariants:
    - Scales each constrained rain feature (except ``rain_anomaly``) by ``(1 - fraction)``.
    - Reduces ``rain_anomaly`` by ``fraction * rain_total`` so anomaly stays consistent.
    - Leaves every unconstrained feature untouched and never increases any feature value.
    """
    raise NotImplementedError("Implemented in WP3 (counterfactual simulator)")


def roi(prevented: float, crews: int | float) -> float:
    """Compute return on investment as ``prevented / crews`` (cases prevented per crew)."""
    raise NotImplementedError("Implemented in WP3 (counterfactual simulator)")
