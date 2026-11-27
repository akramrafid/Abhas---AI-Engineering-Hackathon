"""Pure, deterministic, offline early-action trigger math (ADR-0020).

Framework-free module (NumPy only): zero FastAPI, ORM, LightGBM, or network imports.
Evaluates the clipboard-auditable rule:
    act when 2-week rainfall > R mm AND water_logging_risk_index >= W
for predicting a High/Critical dengue week (cases >= 8) three weeks later (h = 3).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

import numpy as np

DEFAULT_HIGH_CASE_THRESHOLD = 8
DEFAULT_TARGET_HORIZON = 3
DEFAULT_MAX_TRAIN_YEAR = 2023


@dataclass(frozen=True)
class TriggerScore:
    """Contingency counts and verification scores for binary outbreak alerts."""

    tp: int
    fp: int
    fn: int
    tn: int
    hit_rate: float
    false_alarm_ratio: float
    false_alarm_rate: float
    peirce_skill_score: float
    alerts: int
    high_weeks: int
    total_ward_weeks: int


@dataclass(frozen=True)
class LeadTimeStats:
    """Pre-onset alert lead-time quartiles across High outbreak spells."""

    q25: float | None
    median: float | None
    q75: float | None
    spells_covered: int
    total_spells: int


@dataclass(frozen=True)
class TriggerGridCandidate:
    """Single (R, W) candidate evaluated on the training span."""

    rain_2w_gt_mm: float
    water_logging_gte: float
    train_pss: float
    train_hit_rate: float
    train_far: float


def trigger_alerts(
    rain_2w: np.ndarray,
    wl_index: np.ndarray,
    *,
    r_mm: float,
    w_min: float,
) -> np.ndarray:
    """Apply strict `rain_2w > r_mm` AND inclusive `wl_index >= w_min` (TR2)."""
    r_arr = np.asarray(rain_2w, dtype=np.float64)
    w_arr = np.asarray(wl_index, dtype=np.float64)
    if r_arr.shape != w_arr.shape:
        raise ValueError("rain_2w and wl_index must have the same shape")
    return (r_arr > float(r_mm)) & (w_arr >= float(w_min))


def score_binary_alerts(
    alerts: np.ndarray,
    high_events: np.ndarray,
) -> TriggerScore:
    """Compute hit rate, FAR, FPR, and Peirce skill score with zero-division guards (TR1, TR4)."""
    a_bool = np.asarray(alerts, dtype=bool)
    e_bool = np.asarray(high_events, dtype=bool)
    if a_bool.shape != e_bool.shape:
        raise ValueError("alerts and high_events must have the same shape")

    tp = int(np.sum(a_bool & e_bool))
    fp = int(np.sum(a_bool & (~e_bool)))
    fn = int(np.sum((~a_bool) & e_bool))
    tn = int(np.sum((~a_bool) & (~e_bool)))

    high_weeks = tp + fn
    non_high = fp + tn
    alert_count = tp + fp
    total = tp + fp + fn + tn

    hit_rate = (tp / high_weeks) if high_weeks > 0 else 0.0
    fpr = (fp / non_high) if non_high > 0 else 0.0
    far = (fp / alert_count) if alert_count > 0 else 0.0
    pss = hit_rate - fpr

    return TriggerScore(
        tp=tp,
        fp=fp,
        fn=fn,
        tn=tn,
        hit_rate=round(hit_rate, 6),
        false_alarm_ratio=round(far, 6),
        false_alarm_rate=round(fpr, 6),
        peirce_skill_score=round(pss, 6),
        alerts=alert_count,
        high_weeks=high_weeks,
        total_ward_weeks=total,
    )


def evaluate_trigger(
    rain_2w: np.ndarray,
    wl_index: np.ndarray,
    high_next_3w: np.ndarray,
    *,
    r_mm: float,
    w_min: float,
) -> TriggerScore:
    """Evaluate a (R, W) threshold rule against observed h=3 High events."""
    alerts = trigger_alerts(rain_2w, wl_index, r_mm=r_mm, w_min=w_min)
    return score_binary_alerts(alerts, high_next_3w)


def select_best_trigger(
    rain_2w: np.ndarray,
    wl_index: np.ndarray,
    high_next_3w: np.ndarray,
    years: np.ndarray,
    *,
    r_grid: Sequence[float],
    w_grid: Sequence[float],
    max_train_year: int = DEFAULT_MAX_TRAIN_YEAR,
    top_k: int = 5,
) -> tuple[TriggerGridCandidate, list[TriggerGridCandidate]]:
    """Select (R, W) strictly on rows with year <= max_train_year by maximising Peirce skill score.

    Raises ValueError if ANY input row has year > max_train_year to prevent hold-out leakage.
    Deterministic tie-break: higher PSS -> lower FAR -> higher R -> higher W.
    """
    yr_arr = np.asarray(years, dtype=np.int64)
    if yr_arr.size == 0:
        raise ValueError("Training arrays for trigger selection cannot be empty")
    if int(np.max(yr_arr)) > int(max_train_year):
        raise ValueError(
            f"Hold-out leakage guard: received year {int(np.max(yr_arr))} > max_train_year={max_train_year}"
        )

    r_arr = np.asarray(rain_2w, dtype=np.float64)
    w_arr = np.asarray(wl_index, dtype=np.float64)
    e_arr = np.asarray(high_next_3w, dtype=bool)

    candidates: list[TriggerGridCandidate] = []
    for r_val in r_grid:
        for w_val in w_grid:
            sc = evaluate_trigger(r_arr, w_arr, e_arr, r_mm=float(r_val), w_min=float(w_val))
            candidates.append(
                TriggerGridCandidate(
                    rain_2w_gt_mm=round(float(r_val), 2),
                    water_logging_gte=round(float(w_val), 4),
                    train_pss=round(sc.peirce_skill_score, 6),
                    train_hit_rate=round(sc.hit_rate, 6),
                    train_far=round(sc.false_alarm_ratio, 6),
                )
            )

    if not candidates:
        raise ValueError("Trigger candidate grid cannot be empty")

    candidates.sort(
        key=lambda c: (
            -c.train_pss,
            c.train_far,
            -c.rain_2w_gt_mm,
            -c.water_logging_gte,
        )
    )
    return candidates[0], candidates[: max(1, int(top_k))]


def episode_lead_times(
    ward_ids: Sequence[str],
    weeks: Sequence[date],
    alerts: Sequence[bool],
    high_flags: Sequence[bool],
    *,
    max_lookback_weeks: int = 8,
    min_calm_weeks: int = 4,
) -> LeadTimeStats:
    """Compute pre-onset alert lead-time quartiles across distinct High outbreak waves (TR3).

    For each ward sorted by week:
    - A distinct High wave onset is week t_0 where high_flags[t_0] is True and none of the
      preceding `min_calm_weeks` weeks was High (avoiding counting a 1-week dip during peak
      monsoon as a new outbreak).
    - Look back over causal weeks [1, max_lookback_weeks] strictly prior to t_0; if any alert
      fired, take the earliest alert of the contiguous alert cluster leading up to onset.
    """
    n = len(ward_ids)
    if not (len(weeks) == n and len(alerts) == n and len(high_flags) == n):
        raise ValueError("ward_ids, weeks, alerts, and high_flags must have identical length")
    if n == 0:
        return LeadTimeStats(q25=None, median=None, q75=None, spells_covered=0, total_spells=0)

    by_ward: dict[str, list[tuple[date, bool, bool]]] = {}
    for wid, wk, al, hi in zip(ward_ids, weeks, alerts, high_flags, strict=True):
        by_ward.setdefault(str(wid), []).append((wk, bool(al), bool(hi)))

    leads: list[float] = []
    total_spells = 0

    for wid in sorted(by_ward):
        rows = sorted(by_ward[wid], key=lambda item: item[0])
        alert_weeks = {wk for wk, al, _ in rows if al}
        high_weeks_set = {wk for wk, _, hi in rows if hi}

        for wk, _, hi in rows:
            if not hi:
                continue
            had_recent_high = any(
                date.fromordinal(wk.toordinal() - 7 * back) in high_weeks_set
                for back in range(1, max(1, int(min_calm_weeks)) + 1)
            )
            if had_recent_high:
                continue

            total_spells += 1
            matched_leads = [
                lag
                for lag in range(1, max_lookback_weeks + 1)
                if date.fromordinal(wk.toordinal() - 7 * lag) in alert_weeks
            ]
            if not matched_leads:
                continue
            lead_lag = matched_leads[0]
            matched_set = set(matched_leads)
            while (lead_lag + 1) in matched_set:
                lead_lag += 1
            leads.append(float(lead_lag))

    if not leads:
        return LeadTimeStats(
            q25=None,
            median=None,
            q75=None,
            spells_covered=0,
            total_spells=total_spells,
        )

    arr = np.asarray(leads, dtype=np.float64)
    q25, med, q75 = np.quantile(arr, [0.25, 0.50, 0.75])
    return LeadTimeStats(
        q25=round(float(q25), 2),
        median=round(float(med), 2),
        q75=round(float(q75), 2),
        spells_covered=len(leads),
        total_spells=total_spells,
    )
