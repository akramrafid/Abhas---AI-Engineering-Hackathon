"""Risk bands (continuous NegBin conformal), 0–100 risk score, cost-sensitive tier cut-offs, and escalation.

Framework-free pure numeric helpers imported by training, backtesting, model adapter, and serving.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
from scipy.stats import nbinom

TIERS: tuple[str, ...] = ("Low", "Medium", "High", "Critical")
TIER_TO_IDX: dict[str, int] = {t: i for i, t in enumerate(TIERS)}
DEFAULT_TIER_CUTOFFS: tuple[float, float, float] = (3.0, 8.0, 14.0)
EPIDEMIC_FLOOR: float = 5.0


@dataclass(frozen=True)
class HorizonCalibration:
    """Per-horizon NegBin dispersion & locally-weighted conformal band calibration fit strictly on 2023."""

    nb_r: float
    conformal_scale: float = 1.0
    conformal_add: float = 0.0
    q_low: float = 0.10
    q_high: float = 0.90
    use_cqr: bool = False
    cqr_q: float = 0.0
    use_sigma_conformal: bool = False
    z_low: float = 1.05
    z_high: float = 2.30


def tier_from_cases(
    cases: float,
    cutoffs: tuple[float, float, float] = DEFAULT_TIER_CUTOFFS,
) -> str:
    """Map weekly case count to Low / Medium / High / Critical."""
    med, high, crit = cutoffs
    if cases < med:
        return "Low"
    if cases < high:
        return "Medium"
    if cases < crit:
        return "High"
    return "Critical"


def escalate_tier(base_tier: str, p90: float, epidemic_threshold: float) -> tuple[str, bool]:
    """Escalate by one tier (up to Critical) when P90 exceeds the ward's epidemic threshold."""
    if p90 > epidemic_threshold and base_tier != "Critical":
        return TIERS[TIER_TO_IDX[base_tier] + 1], True
    return base_tier, False


def peak_tier(tiers: Sequence[str]) -> str:
    """Return the highest severity tier across a sequence of tiers."""
    if not tiers:
        return "Low"
    return max(tiers, key=lambda t: TIER_TO_IDX.get(t, 0))


def ward_fingerprint(
    population_density_sqkm: float,
    water_logging_risk_index: float,
    sanitation_score: float,
) -> tuple[float, float, float]:
    """Rounded static-feature tuple uniquely identifying each of the 60 wards."""
    return (
        round(float(population_density_sqkm), 2),
        round(float(water_logging_risk_index), 4),
        round(float(sanitation_score), 4),
    )


def decode_iso_week(sin_val: float, cos_val: float) -> int:
    """Invert `iso_week_cyclical` back into canonical ISO week 1..52."""
    angle = math.atan2(float(sin_val), float(cos_val))
    if angle < 0.0:
        angle += 2.0 * math.pi
    idx = int(round(angle * 52.0 / (2.0 * math.pi))) % 52
    return idx + 1


def _continuous_nbinom_ppf(q: float, r: float, mu: np.ndarray) -> np.ndarray:
    """Piecewise-linear continuous inverse CDF of NegBin(r, p = r/(r+mu)).

    Eliminates integer-step over-coverage on zero-inflated off-season weeks while retaining
    exact Negative Binomial tail scaling (Var = mu + mu^2 / r) during outbreak surges.
    """
    mu_pos = np.maximum(mu, 1e-6)
    p = r / (r + mu_pos)
    k = np.asarray(nbinom.ppf(q, r, p), dtype=float)
    cdf_k = np.asarray(nbinom.cdf(k, r, p), dtype=float)
    cdf_km1 = np.where(k > 0.0, np.asarray(nbinom.cdf(np.maximum(k - 1.0, 0.0), r, p), dtype=float), 0.0)
    pmf_k = np.maximum(cdf_k - cdf_km1, 1e-12)
    frac = np.clip((q - cdf_km1) / pmf_k, 0.0, 1.0)
    return np.where(k <= 0.0, 0.0, (k - 1.0) + frac)


def compute_bands_and_risk_vectorized(
    expected: np.ndarray,
    calibration: HorizonCalibration,
    *,
    high_cutoff: float = DEFAULT_TIER_CUTOFFS[1],
    cqr_p10: np.ndarray | None = None,
    cqr_p90: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute (p10, p90, risk_score_0_100) for a vector of Poisson expected case means.

    Guarantees `0 <= p10 <= expected <= p90` element-wise.
    Risk score 0–100 = `round(P(cases >= high_cutoff) * 100)` under the fitted NegBin model.
    """
    mu = np.maximum(np.asarray(expected, dtype=float), 0.0)
    mu_pos = np.maximum(mu, 1e-6)
    nb_r = max(1e-3, float(calibration.nb_r))

    # Risk score uses the unscaled fitted NegBin around mu
    p_prob_risk = nb_r / (nb_r + mu_pos)
    high_threshold_k = max(1, int(math.ceil(high_cutoff)))
    prob_high = np.where(mu <= 1e-9, 0.0, 1.0 - nbinom.cdf(high_threshold_k - 1, nb_r, p_prob_risk))
    risk_score = np.clip(np.rint(prob_high * 100.0), 0, 100).astype(int)

    if calibration.use_cqr and cqr_p10 is not None and cqr_p90 is not None:
        raw_p10 = np.asarray(cqr_p10, dtype=float) - calibration.cqr_q
        raw_p90 = np.asarray(cqr_p90, dtype=float) + calibration.cqr_q
    elif calibration.use_sigma_conformal:
        # Locally-weighted split conformal around NegBin SD = sqrt(mu + mu^2 / r) (ADR-0004).
        sigma_nb = np.sqrt(mu + (mu**2) / nb_r)
        raw_p10 = mu - float(calibration.z_low) * sigma_nb - calibration.conformal_add
        raw_p90 = mu + float(calibration.z_high) * sigma_nb + calibration.conformal_add
    else:
        eff_r = max(1e-3, nb_r / max(float(calibration.conformal_scale), 1e-3))
        raw_p10 = _continuous_nbinom_ppf(calibration.q_low, eff_r, mu) - calibration.conformal_add
        raw_p90 = _continuous_nbinom_ppf(calibration.q_high, eff_r, mu) + calibration.conformal_add

    p10 = np.maximum(0.0, np.minimum(raw_p10, mu))
    p90 = np.maximum(raw_p90, mu)
    return p10, p90, risk_score


def fit_negbin_dispersion(y_true: np.ndarray, mu_pred: np.ndarray) -> float:
    """Method-of-moments Negative Binomial dispersion `r` (Var = mu + mu^2 / r)."""
    yt = np.asarray(y_true, dtype=float)
    mu = np.maximum(np.asarray(mu_pred, dtype=float), 1e-6)
    num = float(np.sum((yt - mu) ** 2 - mu))
    den = float(np.sum(mu**2))
    alpha = max(1e-3, min(10.0, num / max(den, 1e-6)))
    return float(1.0 / alpha)


def calibrate_negbin_conformal(
    y_cal: np.ndarray,
    mu_cal: np.ndarray,
    *,
    target_coverage: float = 0.855,
) -> HorizonCalibration:
    """Fit NegBin dispersion and asymmetric locally-weighted conformal factors strictly on 2023.

    Uses the NegBin scale `sigma_nb = sqrt(mu + mu^2 / r)` so the 80% band reflects right-skewed
    overdispersion across both off-season zeros and monsoon outbreak surges. Because ~58% of weeks
    are off-season zeros (where `0 in [0, p90]` naturally yields >90% coverage), targeting ~85.5%
    global coverage (comfortably inside [0.75, 0.90]) ensures active Medium/High/Critical weeks
    also receive balanced >=82% coverage instead of pinching `p10` too high.
    """
    yt = np.asarray(y_cal, dtype=float)
    mu = np.maximum(np.asarray(mu_cal, dtype=float), 0.0)
    nb_r = fit_negbin_dispersion(yt, mu)

    crit_mask = yt >= DEFAULT_TIER_CUTOFFS[2]
    high_mask = (yt >= DEFAULT_TIER_CUTOFFS[1]) & (~crit_mask)
    med_mask = (yt >= DEFAULT_TIER_CUTOFFS[0]) & (yt < DEFAULT_TIER_CUTOFFS[1])
    active_mask = yt >= 1.0

    best_cal = HorizonCalibration(
        nb_r=round(nb_r, 4),
        use_sigma_conformal=True,
        z_low=1.05,
        z_high=2.30,
    )
    best_score = float("inf")
    fallback_cal = best_cal
    fallback_dist = float("inf")

    for z_lo in (0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.35):
        for z_hi in (1.5, 1.65, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8):
            cal = HorizonCalibration(
                nb_r=round(nb_r, 4),
                use_sigma_conformal=True,
                z_low=float(z_lo),
                z_high=float(z_hi),
            )
            p10, p90, _ = compute_bands_and_risk_vectorized(mu, cal)
            covered = (yt >= p10) & (yt <= p90)
            cov_all = float(np.mean(covered))
            dist = abs(cov_all - target_coverage)
            if 0.77 <= cov_all <= 0.89 and dist < fallback_dist:
                fallback_dist = dist
                fallback_cal = cal
            # Keep safe margin inside [0.75, 0.90] so hold-out stays squarely calibrated
            if not (0.81 <= cov_all <= 0.875):
                continue
            cov_crit = float(np.mean(covered[crit_mask])) if np.any(crit_mask) else cov_all
            cov_high = float(np.mean(covered[high_mask])) if np.any(high_mask) else cov_all
            cov_med = float(np.mean(covered[med_mask])) if np.any(med_mask) else cov_all
            cov_act = float(np.mean(covered[active_mask])) if np.any(active_mask) else cov_all
            # Check tail balance on active counts (avoid pinching lower tail)
            below_p10_act = float(np.mean(yt[active_mask] < p10[active_mask])) if np.any(active_mask) else 0.0
            above_p90_act = float(np.mean(yt[active_mask] > p90[active_mask])) if np.any(active_mask) else 0.0
            tail_imbalance = abs(below_p10_act - above_p90_act)

            score = (
                abs(cov_all - target_coverage) * 2.0
                + max(0.0, 0.86 - cov_crit) * 3.0
                + max(0.0, 0.84 - cov_high) * 2.5
                + max(0.0, 0.82 - cov_med) * 2.5
                + max(0.0, 0.80 - cov_act) * 2.0
                + tail_imbalance * 1.0
            )
            if score < best_score:
                best_score = score
                best_cal = cal

    return best_cal if best_score < float("inf") else fallback_cal


def select_cost_sensitive_cutoffs(
    y_cal: np.ndarray,
    mu_cal: np.ndarray,
    p90_cal: np.ndarray,
    epi_thresh_cal: np.ndarray,
    *,
    missed_critical_weight: float = 5.0,
) -> tuple[float, float, float]:
    """Select tier cut-offs on 2023 minimizing asymmetric cost (missed Critical = 5x false alarm).

    Searches cut-offs that account for P90 epidemic-threshold escalation so `within_one_tier >= 0.96`
    and `critical_recall >= 0.90` hold cleanly on 2023 without over-escalating Low weeks or
    under-predicting High weeks as Low.
    """
    yt = np.asarray(y_cal, dtype=float)
    mu = np.asarray(mu_cal, dtype=float)
    p90 = np.asarray(p90_cal, dtype=float)
    epi = np.asarray(epi_thresh_cal, dtype=float)
    actual_idx = np.array([TIER_TO_IDX[tier_from_cases(float(y))] for y in yt], dtype=int)

    best_cutoffs = DEFAULT_TIER_CUTOFFS
    best_loss = float("inf")
    soft_cutoffs = DEFAULT_TIER_CUTOFFS
    soft_loss = float("inf")

    for med in (2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0):
        for high in (6.5, 7.0, 7.5, 8.0, 8.5):
            for crit in (11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0):
                if not (med < high < crit):
                    continue
                base_idx = np.where(mu < med, 0, np.where(mu < high, 1, np.where(mu < crit, 2, 3)))
                pred_idx = np.where((p90 > epi) & (base_idx < 3), base_idx + 1, base_idx)

                within_one = float(np.mean(np.abs(actual_idx - pred_idx) <= 1))
                crit_mask = actual_idx == 3
                high_mask = actual_idx == 2
                crit_rec = float(np.mean(pred_idx[crit_mask] >= 2)) if np.any(crit_mask) else 1.0
                high_within_one = (
                    float(np.mean(np.abs(actual_idx[high_mask] - pred_idx[high_mask]) <= 1))
                    if np.any(high_mask)
                    else 1.0
                )

                under_crit = np.sum((actual_idx == 3) & (pred_idx < 2)) * (missed_critical_weight * 2.0)
                soft_under_crit = np.sum((actual_idx == 3) & (pred_idx == 2)) * missed_critical_weight
                other_under = np.sum((actual_idx < 3) & (pred_idx < actual_idx)) * 1.5
                two_tier_err = np.sum(np.abs(actual_idx - pred_idx) >= 2) * 6.0
                false_alarm = np.sum(pred_idx > actual_idx) * 1.0
                loss = float(under_crit + soft_under_crit + other_under + two_tier_err + false_alarm) / max(
                    len(yt), 1
                )

                penalty = (
                    max(0.0, 0.96 - within_one) * 50.0
                    + max(0.0, 0.90 - crit_rec) * 50.0
                    + max(0.0, 0.90 - high_within_one) * 20.0
                )
                if loss + penalty < soft_loss:
                    soft_loss = loss + penalty
                    soft_cutoffs = (float(med), float(high), float(crit))

                if within_one < 0.96 or crit_rec < 0.90 or high_within_one < 0.90:
                    continue

                if loss < best_loss:
                    best_loss = loss
                    best_cutoffs = (float(med), float(high), float(crit))

    return best_cutoffs if best_loss < float("inf") else soft_cutoffs


def build_endemic_thresholds(
    ward_iso_cases: Mapping[tuple[str, int], Sequence[float]],
    *,
    floor: float = EPIDEMIC_FLOOR,
) -> dict[tuple[str, int], float]:
    """Compute ward × ISO-week epidemic threshold = max(floor, mean + 2*SD) from training years."""
    thresholds: dict[tuple[str, int], float] = {}
    for key, vals in ward_iso_cases.items():
        arr = np.asarray(vals, dtype=float)
        if len(arr) == 0:
            thresholds[key] = float(floor)
            continue
        mean_v = float(np.mean(arr))
        std_v = float(np.std(arr, ddof=0))
        thresholds[key] = round(max(float(floor), mean_v + 2.0 * std_v), 4)
    return thresholds
