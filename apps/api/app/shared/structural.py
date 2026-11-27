"""Pure, deterministic, offline structural-fix planner math (ADR-0021).

Framework-free module (NumPy/math only): zero FastAPI, ORM, LightGBM, or network imports.
Computes clamped trait deltas, Poisson GLM multiplicative seasonal/annual case reductions,
LightGBM partial-dependence annualisation, and Build-vs-Send crew equivalence ratios.
"""

from __future__ import annotations

import math
from typing import Literal

import numpy as np

STRUCTURAL_DISCLAIMER = "associations in simulated data, not causal real-world estimates"

PrioritySignal = Literal["build_and_send", "build_priority", "send_priority", "monitor"]


def clamp_trait_delta(
    value: float,
    delta: float,
    *,
    low: float = 0.0,
    high: float = 1.0,
) -> float:
    """Return effective shift keeping value + effective_delta inside [low, high] (ST2)."""
    v = float(value)
    d = float(delta)
    target = min(max(v + d, float(low)), float(high))
    return round(target - v, 6)


def glm_annual_prevented(
    baseline_cases_yr: float,
    beta: float,
    effective_delta: float,
) -> tuple[float, float]:
    """Return (pct_reduction, cases_prevented_yr) under log-link Poisson GLM (ST1).

    Shifting feature x by effective_delta scales expected cases by exp(beta * effective_delta),
    so fractional reduction is 1 - exp(beta * effective_delta).
    """
    base = max(0.0, float(baseline_cases_yr))
    frac = 1.0 - math.exp(float(beta) * float(effective_delta))
    pct = 100.0 * frac
    cases = base * frac
    return round(pct, 4), round(cases, 4)


def pd_annual_prevented(
    baseline_weekly: np.ndarray,
    shifted_weekly: np.ndarray,
    *,
    weeks_per_year: float = 52.0,
) -> tuple[float, float]:
    """Annualise LightGBM partial-dependence weekly prediction differences (ST3).

    Returns (pct_reduction, cases_prevented_yr).
    """
    base = np.asarray(baseline_weekly, dtype=np.float64)
    shifted = np.asarray(shifted_weekly, dtype=np.float64)
    if base.shape != shifted.shape or base.size == 0:
        raise ValueError("baseline_weekly and shifted_weekly must be non-empty arrays of identical shape")
    diff = base - shifted
    mean_diff = float(np.mean(diff))
    sum_base = float(np.sum(base))
    pct = (100.0 * float(np.sum(diff)) / sum_base) if sum_base > 0.0 else 0.0
    cases_yr = weeks_per_year * mean_diff
    return round(pct, 4), round(cases_yr, 4)


def build_vs_send_ratio(
    drainage_cases_per_yr: float,
    sim_roi_cases_per_crew: float,
) -> float | None:
    """Return equivalent peak spraying crew deployments per year (ST4), or None if ROI <= 0."""
    roi = float(sim_roi_cases_per_crew)
    if not math.isfinite(roi) or roi <= 1e-9:
        return None
    val = float(drainage_cases_per_yr) / roi
    if not math.isfinite(val):
        return None
    return round(val, 2)


def classify_build_vs_send(
    drainage_cases_per_yr: float,
    sim_roi_cases_per_crew: float,
    *,
    drainage_median: float,
    roi_median: float,
) -> PrioritySignal:
    """Tag ward relative to medians: build_and_send, build_priority, send_priority, or monitor."""
    high_build = float(drainage_cases_per_yr) >= float(drainage_median)
    high_send = float(sim_roi_cases_per_crew) >= float(roi_median)
    if high_build and high_send:
        return "build_and_send"
    if high_build:
        return "build_priority"
    if high_send:
        return "send_priority"
    return "monitor"


def bootstrap_ci_95(samples: np.ndarray, *, point_estimate: float | None = None) -> tuple[float, float]:
    """Compute deterministic 95% percentile CI (2.5th, 97.5th), preserving ci_low <= estimate <= ci_high."""
    arr = np.asarray(samples, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        val = round(float(point_estimate or 0.0), 4)
        return val, val
    lo, hi = np.quantile(arr, [0.025, 0.975])
    lo_f = float(lo)
    hi_f = float(hi)
    if point_estimate is not None and math.isfinite(float(point_estimate)):
        pt = float(point_estimate)
        lo_f = min(lo_f, pt)
        hi_f = max(hi_f, pt)
    return round(lo_f, 4), round(hi_f, 4)
