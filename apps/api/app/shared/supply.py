"""Pure supply conversion helpers (contracts §4; ADR-0009).

Deterministic, offline NumPy/SciPy helpers for moment-matched window case quantiles,
dataset-verified supply conversion (`round_half_up(c * cases)`), constant verification,
and OLS-through-origin ratio diagnostics.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd
from scipy.stats import nbinom, poisson

from app.ports.supply import SupplyRatios

RESOURCE_KEYS: tuple[str, ...] = ("saline_bags", "diagnostic_kits", "hospital_beds")

SUPPLY_COLUMNS: Mapping[str, str] = {
    "saline_bags": "saline_bags_needed",
    "diagnostic_kits": "diagnostic_kits_needed",
    "hospital_beds": "hospital_beds_required",
}

DATASET_SUPPLY_CONSTANTS: Mapping[str, float] = {
    "saline_bags": 2.385,
    "diagnostic_kits": 1.164,
    "hospital_beds": 0.298,
}

# Above this dispersion size, NB(r_W, p) is numerically indistinguishable from Poisson(M)
# and direct float64 evaluation of p = r_W / (r_W + M) risks rounding p to 1.0.
_POISSON_DISPERSION_THRESHOLD = 1e8


def round_half_up(value: float) -> int:
    """Deterministic round-half-up: ``floor(x + 0.5)`` matching the onsite dataset rule."""
    v = float(value)
    if not math.isfinite(v):
        raise ValueError(f"value must be finite, got {value!r}")
    return int(math.floor(v + 0.5))


def window_case_quantile(means: Sequence[float], nb_r: Sequence[float], q: float) -> int:
    """Return the integer service-level quantile of summed window cases (ADR-0009).

    Invariants:
    - Moment-matched negative binomial over the window: ``M = sum(means)``,
      ``V = sum(mu + mu^2 / r)``.
    - Falls back to ``Poisson(M)`` when ``V <= M`` (or dispersion is numerically infinite).
    - Returns ``0`` when means are empty or sum to ``0`` (no division by zero).
    - Monotone non-decreasing in ``q`` and in every element of ``means``.
    """
    if len(means) != len(nb_r):
        raise ValueError(f"means ({len(means)}) and nb_r ({len(nb_r)}) must have the same length")
    q_f = float(q)
    if not math.isfinite(q_f) or q_f < 0.0 or q_f >= 1.0:
        raise ValueError(f"quantile q must be in [0, 1), got {q!r}")
    if not means or q_f == 0.0:
        return 0

    total_mean = 0.0
    total_var = 0.0
    for mu_raw, r_raw in zip(means, nb_r, strict=True):
        mu = float(mu_raw)
        r = float(r_raw)
        if not math.isfinite(mu) or mu < 0.0:
            raise ValueError(f"forecast mean must be finite and non-negative, got {mu_raw!r}")
        if math.isnan(r) or r <= 0.0:
            raise ValueError(f"nb_r must be positive, got {r_raw!r}")
        total_mean += mu
        overdisp = 0.0 if math.isinf(r) else (mu * mu) / r
        total_var += mu + overdisp

    if total_mean <= 0.0:
        return 0

    excess_var = total_var - total_mean
    if excess_var > 1e-12 * max(total_mean, 1.0):
        r_window = (total_mean * total_mean) / excess_var
        if math.isfinite(r_window) and r_window <= _POISSON_DISPERSION_THRESHOLD:
            p = r_window / (r_window + total_mean)
            if 0.0 < p < 1.0:
                return max(0, int(nbinom.ppf(q_f, r_window, p)))

    return max(0, int(poisson.ppf(q_f, total_mean)))


def single_week_case_quantile(mean: float, nb_r: float, q: float) -> int:
    """Return the integer service-level quantile for a single forecast week (NB or Poisson)."""
    return window_case_quantile([mean], [nb_r], q)


def peak_week_case_quantile(means: Sequence[float], nb_r: Sequence[float], q: float) -> int:
    """Return the maximum single-week case quantile across horizons in a planning window.

    Hospital beds are reusable week to week, so peak-week sizing takes ``max_h Q_{q, h}``
    instead of summing bed-weeks across the window (ADR-0009, M1).
    """
    if len(means) != len(nb_r):
        raise ValueError(f"means ({len(means)}) and nb_r ({len(nb_r)}) must have the same length")
    q_f = float(q)
    if not math.isfinite(q_f) or q_f < 0.0 or q_f >= 1.0:
        raise ValueError(f"quantile q must be in [0, 1), got {q!r}")
    if not means or q_f == 0.0:
        return 0
    return max(single_week_case_quantile(mu, r, q_f) for mu, r in zip(means, nb_r, strict=True))


def supply_for_cases(cases: int, ratios: SupplyRatios) -> dict[str, int]:
    """Convert an integer planned case count into integer supply quantities (ADR-0009).

    Returns a dict with keys ``saline_bags``, ``diagnostic_kits``, and ``hospital_beds``
    computed as ``round_half_up(c * cases) = floor(c * cases + 0.5)``. Zero cases always
    produces zero for every supply.
    """
    if isinstance(cases, bool) or not isinstance(cases, int):
        raise TypeError(f"cases must be an int, got {type(cases).__name__}")
    if cases < 0:
        raise ValueError(f"cases must be non-negative, got {cases}")
    if cases == 0:
        return {
            "saline_bags": 0,
            "diagnostic_kits": 0,
            "hospital_beds": 0,
        }
    return {
        "saline_bags": round_half_up(ratios.saline_bags * cases),
        "diagnostic_kits": round_half_up(ratios.diagnostic_kits * cases),
        "hospital_beds": round_half_up(ratios.hospital_beds * cases),
    }


def _extract_ratio_map(ratios: SupplyRatios | Mapping[str, float]) -> dict[str, float]:
    if isinstance(ratios, SupplyRatios):
        return {
            "saline_bags": float(ratios.saline_bags),
            "diagnostic_kits": float(ratios.diagnostic_kits),
            "hospital_beds": float(ratios.hospital_beds),
        }
    missing = [k for k in RESOURCE_KEYS if k not in ratios]
    if missing:
        raise KeyError(f"Missing supply ratio keys: {', '.join(missing)}")
    return {k: float(ratios[k]) for k in RESOURCE_KEYS}


def verify_constants(
    frame: pd.DataFrame,
    ratios: SupplyRatios | Mapping[str, float],
) -> dict[str, float]:
    """Return exact row-match share per supply column under ``round_half_up(c * dengue_cases)``."""
    if frame is None or not isinstance(frame, pd.DataFrame):
        raise TypeError("frame must be a pandas DataFrame")
    if frame.empty:
        raise ValueError("frame must contain at least one row")
    if "dengue_cases" not in frame.columns:
        raise ValueError("Missing required column: dengue_cases")

    ratio_map = _extract_ratio_map(ratios)
    cases = frame["dengue_cases"].to_numpy(dtype=np.int64)
    cases_f = cases.astype(np.float64)
    n_rows = int(len(cases))

    matches: dict[str, float] = {}
    for key, col in SUPPLY_COLUMNS.items():
        if col not in frame.columns:
            raise ValueError(f"Missing required supply column: {col}")
        actual = frame[col].to_numpy(dtype=np.int64)
        c = ratio_map[key]
        predicted = np.floor(cases_f * c + 0.5).astype(np.int64)
        matches[key] = float(int(np.sum(predicted == actual)) / n_rows)
    return matches


def _ols_origin_slope_and_r2(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    denom = float(np.dot(x, x))
    if denom <= 0.0:
        return 0.0, 1.0
    slope = float(np.dot(x, y) / denom)
    ss_res = float(np.sum((y - slope * x) ** 2))
    y_mean = float(np.mean(y))
    ss_tot = float(np.sum((y - y_mean) ** 2))
    r2 = 1.0 if ss_tot <= 0.0 else 1.0 - (ss_res / ss_tot)
    return slope, r2


def fit_ratios(
    frame: pd.DataFrame,
    years: tuple[int, int] = (2016, 2022),
    *,
    dataset_sha256: str = "",
) -> SupplyRatios:
    """Compute OLS-through-origin R^2 diagnostics and verified exact supply constants.

    Training years ``years`` are used for OLS-through-origin R^2 and per-city diagnostics;
    exact dataset constants are verified across all rows of ``frame``.
    """
    if frame is None or not isinstance(frame, pd.DataFrame):
        raise TypeError("frame must be a pandas DataFrame")
    if frame.empty:
        raise ValueError("frame must contain at least one row")
    if "dengue_cases" not in frame.columns:
        raise ValueError("Missing required column: dengue_cases")
    for col in SUPPLY_COLUMNS.values():
        if col not in frame.columns:
            raise ValueError(f"Missing required supply column: {col}")

    date_col = "date" if "date" in frame.columns else ("week" if "week" in frame.columns else None)
    if date_col is not None:
        dt_series = pd.to_datetime(frame[date_col], errors="raise")
        train_mask = (dt_series.dt.year >= years[0]) & (dt_series.dt.year <= years[1])
        train_df = frame.loc[train_mask]
        if train_df.empty:
            raise ValueError(f"No rows found within training years {years[0]}..{years[1]}")
    else:
        train_df = frame

    all_cases = frame["dengue_cases"].to_numpy(dtype=np.int64)
    all_cases_f = all_cases.astype(np.float64)
    pos_mask = all_cases > 0
    pos_cases_f = all_cases_f[pos_mask]

    train_cases_f = train_df["dengue_cases"].to_numpy(dtype=np.float64)

    selected: dict[str, float] = {}
    r2_map: dict[str, float] = {}
    valid_interval: dict[str, tuple[float, float]] = {}

    for key, col in SUPPLY_COLUMNS.items():
        train_y = train_df[col].to_numpy(dtype=np.float64)
        ols_slope, r2 = _ols_origin_slope_and_r2(train_cases_f, train_y)
        r2_map[key] = round(r2, 6)

        all_y = frame[col].to_numpy(dtype=np.int64)
        if np.any(pos_mask):
            pos_y = all_y[pos_mask].astype(np.float64)
            lo = float(np.max((pos_y - 0.5) / pos_cases_f))
            hi = float(np.min((pos_y + 0.5) / pos_cases_f))
            valid_interval[key] = (round(lo, 6), round(hi, 6))
        else:
            lo, hi = 0.0, 0.0
            valid_interval[key] = (0.0, 0.0)

        canonical = float(DATASET_SUPPLY_CONSTANTS[key])
        if np.all(np.floor(all_cases_f * canonical + 0.5).astype(np.int64) == all_y):
            selected[key] = canonical
        elif lo < hi:
            mid = (lo + hi) / 2.0
            if np.all(np.floor(all_cases_f * mid + 0.5).astype(np.int64) == all_y):
                selected[key] = round(mid, 6)
            else:
                selected[key] = round(ols_slope, 6)
        else:
            selected[key] = round(ols_slope, 6)

    row_match = verify_constants(frame, selected)

    per_city: dict[str, dict[str, float]] = {}
    if "city" in train_df.columns:
        for city_name in sorted(str(c) for c in train_df["city"].dropna().unique()):
            city_sub = train_df.loc[train_df["city"] == city_name]
            cx = city_sub["dengue_cases"].to_numpy(dtype=np.float64)
            per_city[city_name] = {
                key: round(_ols_origin_slope_and_r2(cx, city_sub[col].to_numpy(dtype=np.float64))[0], 6)
                for key, col in SUPPLY_COLUMNS.items()
            }

    n_rows = int(len(frame))
    matched_all = all(share == 1.0 for share in row_match.values())
    method = (
        f"supply = round_half_up(c × dengue_cases); constants reproduce {n_rows:,}/{n_rows:,} rows"
        if matched_all
        else "OLS through origin with round_half_up supply verification"
    )

    return SupplyRatios(
        saline_bags=selected["saline_bags"],
        diagnostic_kits=selected["diagnostic_kits"],
        hospital_beds=selected["hospital_beds"],
        dataset_sha256=dataset_sha256,
        r2=r2_map,
        fitted_years=years,
        valid_interval=valid_interval,
        row_match=row_match,
        method=method,
        per_city=per_city,
    )
