"""Pure supply conversion helpers (contracts §4; ADR-0009).

Algorithm bodies are implemented in WP1; WP0 locks the typed signatures and docstrings.
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

from app.ports.supply import SupplyRatios


def window_case_quantile(means: Sequence[float], nb_r: Sequence[float], q: float) -> int:
    """Return the integer service-level quantile of summed window cases.

    Invariants:
    - Moment-matched negative binomial over the window: M = sum(means), V = sum(mu + mu^2 / r).
    - Falls back to Poisson(M) when V <= M.
    - Returns 0 when means sum to 0 (no division by zero).
    - Monotone non-decreasing in q and in every element of means.
    """
    raise NotImplementedError("Implemented in WP1 (supply conversion)")


def supply_for_cases(cases: int, ratios: SupplyRatios) -> dict[str, int]:
    """Convert an integer planned case count into integer supply quantities.

    Returns a dict with keys ``saline_bags``, ``diagnostic_kits``, and ``hospital_beds``
    computed as ``ceil(ratio * cases)``. Zero cases always produces zero for every supply.
    """
    raise NotImplementedError("Implemented in WP1 (supply conversion)")


def fit_ratios(
    frame: pd.DataFrame,
    years: tuple[int, int] = (2016, 2022),
    *,
    dataset_sha256: str = "",
) -> SupplyRatios:
    """Fit OLS-through-origin per-case supply ratios, R^2, and per-city ratios on training years only.

    Used offline by ``ml/fit_supply.py`` to write ``apps/api/config/supply_ratios.json``.
    """
    raise NotImplementedError("Implemented in WP1 (supply ratio fitting)")
