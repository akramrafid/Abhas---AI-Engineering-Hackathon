"""Pure vector-control efficacy curve, monotone rain feature sets, and counterfactual helpers.

Contracts §4; ADR-0011, ADR-0013. Constants ``EFFICACY_PRESETS`` and ``MONOTONE_RAIN_FEATURES`` are locked in WP0
(the latter verified by test against ``ml/train.py:monotone_constraints_for_horizon`` for h = 2, 3, 4).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any, cast

from app.ports.intervention import CounterfactualForecaster
from app.shared.optimizer import CrewAssignmentResult, greedy_crews

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

SIMULATOR_HORIZONS: tuple[int, ...] = (2, 3, 4)


def reduction(crews: int, e_max: float, k: float) -> float:
    """Compute diminishing-returns breeding-water reduction ``e_max * (1 - exp(-k * crews))`` in [0, e_max).

    Returns 0.0 when ``crews == 0``.
    """
    if isinstance(crews, bool) or not isinstance(crews, int) or crews < 0:
        raise ValueError(f"crews must be a non-negative integer, got {crews!r}")
    em = float(e_max)
    kf = float(k)
    if not math.isfinite(em) or em <= 0.0 or em >= 1.0:
        raise ValueError(f"e_max must be in (0, 1), got {e_max!r}")
    if not math.isfinite(kf) or kf <= 0.0:
        raise ValueError(f"k must be finite and positive, got {k!r}")
    if crews == 0:
        return 0.0
    return float(em * (1.0 - math.exp(-kf * float(crews))))


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
    if horizon not in MONOTONE_RAIN_FEATURES:
        raise ValueError(f"horizon must be in {sorted(MONOTONE_RAIN_FEATURES)}, got {horizon!r}")
    frac = float(fraction)
    if not math.isfinite(frac) or frac < 0.0 or frac >= 1.0:
        raise ValueError(f"fraction must be in [0, 1), got {fraction!r}")
    rt = float(rain_total)
    if not math.isfinite(rt) or rt < 0.0:
        raise ValueError(f"rain_total must be finite and non-negative, got {rain_total!r}")

    out: dict[str, float] = {key: float(val) for key, val in feature_row.items()}
    if frac == 0.0:
        return out

    constrained = MONOTONE_RAIN_FEATURES[horizon]
    scale = 1.0 - frac
    for feat in constrained:
        if feat not in out:
            continue
        if feat == "rain_anomaly":
            out[feat] = out[feat] - frac * rt
        else:
            val = out[feat]
            if val > 0.0:
                out[feat] = val * scale
    return out


def roi(prevented: float, crews: int | float) -> float:
    """Compute return on investment as ``prevented / crews`` (cases prevented per crew)."""
    c = float(crews)
    if not math.isfinite(c) or c <= 0.0:
        raise ValueError(f"crews must be finite and positive, got {crews!r}")
    p = float(prevented)
    if not math.isfinite(p):
        raise ValueError(f"prevented must be finite, got {prevented!r}")
    return max(0.0, p) / c


def assign_crews_for_wards(
    forecaster: CounterfactualForecaster,
    ward_ids: Sequence[str],
    origin_week: date,
    horizons: Sequence[int],
    total_crews: int,
    *,
    weights: Mapping[str, float] | None = None,
    efficacy: str = "base",
    cap: int = 5,
) -> CrewAssignmentResult:
    """Shared greedy crew placement driven by counterfactual marginal cases prevented (ADR-0011, WP3-5).

    Used identically by both AllocationService and SimulatorService (``auto_crews``) so both
    endpoints return the exact same crew assignment for identical inputs.
    """
    unique_wards = list(dict.fromkeys(ward_ids))
    if not unique_wards or total_crews <= 0:
        return CrewAssignmentResult(crews={w: 0 for w in unique_wards}, approximate=False)

    if efficacy not in EFFICACY_PRESETS:
        raise ValueError(f"Unknown efficacy preset: {efficacy!r}")
    e_max, k = EFFICACY_PRESETS[efficacy]

    eff_horizons = [h for h in horizons if h in MONOTONE_RAIN_FEATURES]
    if not eff_horizons:
        eff_horizons = list(SIMULATOR_HORIZONS)

    max_c = min(cap, total_crews)
    fractions_by_c = {c: reduction(c, e_max, k) for c in range(1, max_c + 1)}

    # Vectorized single-pass evaluation across c = 0..max_c when supported by ForecastEngine.
    batch_fn = getattr(forecaster, "counterfactual_grid", None)
    if callable(batch_fn):
        scenarios: list[dict[str, float]] = [{}] + [
            {w: fractions_by_c[c] for w in unique_wards} for c in range(1, max_c + 1)
        ]
        grid: list[Mapping[tuple[str, int], Any]] = cast(Any, batch_fn)(
            unique_wards, origin_week, eff_horizons, scenarios
        )
        base_map = grid[0]
        cf_by_c = {c: grid[c] for c in range(1, max_c + 1)}
    else:
        base_map = forecaster.window(unique_wards, origin_week, eff_horizons)
        cf_by_c = {
            c: forecaster.counterfactual(
                unique_wards,
                origin_week,
                eff_horizons,
                {w: fractions_by_c[c] for w in unique_wards},
            )
            for c in range(1, max_c + 1)
        }

    # Precompute B_i(c) = sum_h max(0, mu_base(w, h) - mu_cf(w, h, c)) for c = 0..max_c
    benefit: dict[tuple[str, int], float] = {}
    for w in unique_wards:
        benefit[(w, 0)] = 0.0
        for c in range(1, max_c + 1):
            prevented = sum(
                max(0.0, float(base_map[(w, h)].expected_cases) - float(cf_by_c[c][(w, h)].expected_cases))
                for h in eff_horizons
            )
            benefit[(w, c)] = prevented

    def _marginal(ward_id: str, c: int) -> float:
        return benefit[(ward_id, c)] - benefit[(ward_id, c - 1)]

    return greedy_crews(_marginal, unique_wards, total_crews, cap=cap, weights=weights)
