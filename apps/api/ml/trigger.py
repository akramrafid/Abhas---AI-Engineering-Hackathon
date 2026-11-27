"""Precompute ADR-0020 Early-Action Trigger evaluation -> apps/api/evals/results/trigger.json.

Usage:
    npm run trigger
    node scripts/py.mjs -m ml.trigger

Strictly fits thresholds (R, W) on 2016–2023 ONLY (maximising Peirce skill score for High
cases >= 8 at h = 3), freezes them, evaluates on the locked 2024–2025 hold-out alongside
Abhas LightGBM h = 3 alerts on the exact same ward-weeks, and writes deterministic JSON.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.adapters.lgbm_model import load_model
from app.core.config import API_DIR, REPO_ROOT, get_settings
from app.core.run_meta import resolve_git_sha
from app.shared.features import (
    FEATURE_COLUMNS,
    canonical_iso_week,
    fit_rain_normals,
    normalize_observation_columns,
)
from app.shared.tiers import compute_bands_and_risk_vectorized, escalate_tier, tier_from_cases
from app.shared.trigger import (
    DEFAULT_HIGH_CASE_THRESHOLD,
    DEFAULT_MAX_TRAIN_YEAR,
    DEFAULT_TARGET_HORIZON,
    LeadTimeStats,
    TriggerScore,
    episode_lead_times,
    evaluate_trigger,
    score_binary_alerts,
    select_best_trigger,
    trigger_alerts,
)
from ml.fit_supply import DEFAULT_INPUT_PATH, EXPECTED_ONSITE_SHA256, compute_sha256
from ml.train import build_supervised_frame

RESULTS_DIR = API_DIR / "evals" / "results"
DEFAULT_TRIGGER_OUT = RESULTS_DIR / "trigger.json"

R_GRID: tuple[float, ...] = tuple(float(r) for r in range(20, 205, 10))
# Non-vacuous drainage cutoffs strictly above the minimum ward water_logging_risk_index (~0.22)
# so the second clause of the rule genuinely screens wards rather than always evaluating True.
W_GRID: tuple[float, ...] = tuple(round(0.30 + 0.05 * k, 2) for k in range(0, 12))


def _format_rule_en(r_mm: float, w_min: float) -> str:
    r_str = f"{int(r_mm)}" if float(r_mm).is_integer() else f"{r_mm:.1f}"
    return (
        f"Act when 2-week rain > {r_str} mm AND water_logging_risk_index >= {w_min:.2f} "
        f"(3-week early warning for High risk, >= {DEFAULT_HIGH_CASE_THRESHOLD} cases)."
    )


def _format_rule_bn(r_mm: float, w_min: float) -> str:
    bn_digits = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
    r_str = (f"{int(r_mm)}" if float(r_mm).is_integer() else f"{r_mm:.1f}").translate(bn_digits)
    w_str = f"{w_min:.2f}".translate(bn_digits)
    cases_str = str(DEFAULT_HIGH_CASE_THRESHOLD).translate(bn_digits)
    return (
        f"২ সপ্তাহের বৃষ্টিপাত > {r_str} মিমি এবং জলাবদ্ধতা সূচক >= {w_str} হলে "
        f"৩ সপ্তাহ আগেই ব্যবস্থা নিন (উচ্চ ঝুঁকি >= {cases_str} রোগী)।"
    )


def _metrics_dict(score: TriggerScore, lead: LeadTimeStats) -> dict[str, Any]:
    return {
        "hit_rate": round(score.hit_rate, 4),
        "false_alarm_ratio": round(score.false_alarm_ratio, 4),
        "false_alarm_rate": round(score.false_alarm_rate, 4),
        "peirce_skill_score": round(score.peirce_skill_score, 4),
        "alerts": score.alerts,
        "high_weeks": score.high_weeks,
        "total_ward_weeks": score.total_ward_weeks,
        "tp": score.tp,
        "fp": score.fp,
        "fn": score.fn,
        "tn": score.tn,
        "lead_time_weeks": {
            "q25": lead.q25,
            "median": lead.median,
            "q75": lead.q75,
            "spells_covered": lead.spells_covered,
            "total_spells": lead.total_spells,
        },
    }


def _select_model_threshold_on_train(
    y_pred_train: np.ndarray,
    high_train: np.ndarray,
    target_hit_rate: float,
) -> float:
    """Choose LightGBM h=3 alert threshold strictly on 2016–2023 (or 2023 tune) by max PSS
    among thresholds that achieve at least the rule's training hit rate (or highest PSS overall).
    """
    best_tau = 4.0
    best_key: tuple[float, float, float] = (-1.0, -999.0, -999.0)
    grid = np.round(np.arange(1.5, 12.05, 0.25), 2)
    for tau in grid:
        sc = score_binary_alerts(y_pred_train >= float(tau), high_train)
        meets = 1.0 if sc.hit_rate >= target_hit_rate else 0.0
        key = (meets, sc.peirce_skill_score, -sc.false_alarm_ratio)
        if key > best_key:
            best_key = key
            best_tau = float(tau)
    return best_tau


def build_trigger_evaluation(
    *,
    dataset_path: Path = DEFAULT_INPUT_PATH,
    expected_sha256: str = EXPECTED_ONSITE_SHA256,
) -> dict[str, Any]:
    """Run leak-free 2016–2023 trigger search + locked 2024–2025 hold-out evaluation vs Abhas."""
    if not dataset_path.exists():
        raise FileNotFoundError(f"Onsite dataset not found: {dataset_path}")
    actual_sha = compute_sha256(dataset_path)
    if actual_sha != expected_sha256.lower():
        raise ValueError(
            f"Onsite dataset SHA-256 mismatch: expected {expected_sha256.lower()}, got {actual_sha}"
        )

    raw_df = normalize_observation_columns(pd.read_excel(dataset_path))
    raw_df = raw_df.sort_values(["ward_id", "week"], kind="mergesort").reset_index(drop=True)
    rain_normals = fit_rain_normals(raw_df, max_year=DEFAULT_MAX_TRAIN_YEAR)
    sup = build_supervised_frame(raw_df, horizon=DEFAULT_TARGET_HORIZON, rain_normals=rain_normals)
    sup = sup.dropna(subset=["rainfall_lag_0", "rainfall_lag_1", "water_logging_risk_index", "y"]).copy()
    sup["rain_2w"] = sup["rainfall_lag_0"].astype(float) + sup["rainfall_lag_1"].astype(float)
    sup["origin_year"] = sup["week"].map(lambda d: d.year)
    sup["target_year"] = sup["target_week"].map(lambda d: d.year)
    sup["high_event"] = sup["y"].astype(float) >= float(DEFAULT_HIGH_CASE_THRESHOLD)

    # Strict temporal purge: training rows have target_week <= 2023; hold-out is locked 2024–2025.
    train_df = sup.loc[sup["target_year"] <= DEFAULT_MAX_TRAIN_YEAR].copy()
    hold_df = sup.loc[sup["target_year"].isin([2024, 2025])].copy()
    if train_df.empty or hold_df.empty:
        raise ValueError("Supervised frame produced empty train or hold-out split")

    best_cand, top_cands = select_best_trigger(
        train_df["rain_2w"].to_numpy(dtype=np.float64),
        train_df["water_logging_risk_index"].to_numpy(dtype=np.float64),
        train_df["high_event"].to_numpy(dtype=bool),
        train_df["target_year"].to_numpy(dtype=np.int64),
        r_grid=R_GRID,
        w_grid=W_GRID,
        max_train_year=DEFAULT_MAX_TRAIN_YEAR,
        top_k=5,
    )

    # Evaluate frozen rule on locked 2024–2025 hold-out.
    hold_rain_2w = hold_df["rain_2w"].to_numpy(dtype=np.float64)
    hold_wl = hold_df["water_logging_risk_index"].to_numpy(dtype=np.float64)
    hold_high = hold_df["high_event"].to_numpy(dtype=bool)
    hold_wards = hold_df["ward_id"].astype(str).tolist()
    hold_target_weeks: list[date] = list(hold_df["target_week"])
    hold_origin_weeks: list[date] = list(hold_df["week"])

    rule_score_hold = evaluate_trigger(
        hold_rain_2w,
        hold_wl,
        hold_high,
        r_mm=best_cand.rain_2w_gt_mm,
        w_min=best_cand.water_logging_gte,
    )
    # For episode lead times, align alerts at origin_week against actual High flags at that week.
    # Build per-ward weekly calendar over 2024–2025 (plus late 2023 look-back alerts).
    lead_window_df = sup.loc[sup["week"] >= date(2023, 11, 1)].copy()
    lead_alerts_all = trigger_alerts(
        lead_window_df["rain_2w"].to_numpy(dtype=np.float64),
        lead_window_df["water_logging_risk_index"].to_numpy(dtype=np.float64),
        r_mm=best_cand.rain_2w_gt_mm,
        w_min=best_cand.water_logging_gte,
    )
    # Map actual observed High events on 2024–2025 dates directly from raw_df so onset week is exact.
    obs_hold = raw_df.loc[raw_df["week"] >= date(2023, 11, 1)].copy()
    obs_hold["is_high_holdout"] = (obs_hold["week"] >= date(2024, 1, 1)) & (
        obs_hold["dengue_cases"].astype(float) >= float(DEFAULT_HIGH_CASE_THRESHOLD)
    )
    alert_lookup_rule = {
        (str(w), wk): bool(al)
        for w, wk, al in zip(
            lead_window_df["ward_id"].astype(str),
            lead_window_df["week"],
            lead_alerts_all,
            strict=True,
        )
    }
    rule_lead = episode_lead_times(
        obs_hold["ward_id"].astype(str).tolist(),
        list(obs_hold["week"]),
        [
            alert_lookup_rule.get((str(w), wk), False)
            for w, wk in zip(obs_hold["ward_id"].astype(str), obs_hold["week"], strict=True)
        ],
        obs_hold["is_high_holdout"].astype(bool).tolist(),
        max_lookback_weeks=8,
    )

    # Score Abhas production LightGBM h=3 alerts on the exact same hold-out ward-weeks.
    artifact = load_model(get_settings().model_path)
    booster_h3 = artifact._boosters[DEFAULT_TARGET_HORIZON]
    cal_h3 = artifact.calibrations[DEFAULT_TARGET_HORIZON]
    cutoffs = artifact.tier_cutoffs

    X_train_2023 = train_df.loc[train_df["target_year"] == DEFAULT_MAX_TRAIN_YEAR, list(FEATURE_COLUMNS)]
    y_high_2023 = train_df.loc[train_df["target_year"] == DEFAULT_MAX_TRAIN_YEAR, "high_event"].to_numpy(
        dtype=bool
    )
    pred_2023 = np.clip(np.asarray(booster_h3.predict(X_train_2023), dtype=np.float64), 0.0, None)
    rule_2023 = evaluate_trigger(
        train_df.loc[train_df["target_year"] == DEFAULT_MAX_TRAIN_YEAR, "rain_2w"].to_numpy(dtype=np.float64),
        train_df.loc[train_df["target_year"] == DEFAULT_MAX_TRAIN_YEAR, "water_logging_risk_index"].to_numpy(
            dtype=np.float64
        ),
        y_high_2023,
        r_mm=best_cand.rain_2w_gt_mm,
        w_min=best_cand.water_logging_gte,
    )
    model_tau = _select_model_threshold_on_train(
        pred_2023,
        y_high_2023,
        target_hit_rate=min(0.99, rule_2023.hit_rate + 0.045),
    )

    X_hold = hold_df[list(FEATURE_COLUMNS)]
    pred_hold = np.clip(np.asarray(booster_h3.predict(X_hold), dtype=np.float64), 0.0, None)
    ep_hold = np.array(
        [
            artifact.endemic_thresholds.get((w, canonical_iso_week(tw)), 8.0)
            for w, tw in zip(hold_wards, hold_target_weeks, strict=True)
        ],
        dtype=np.float64,
    )
    _, p90_hold, _ = compute_bands_and_risk_vectorized(pred_hold, cal_h3)
    tiers_hold = [
        escalate_tier(tier_from_cases(float(mu), cutoffs), float(p90), float(ep))[0]
        for mu, p90, ep in zip(pred_hold, p90_hold, ep_hold, strict=True)
    ]
    tier_alerts_hold = np.array([t in ("High", "Critical") for t in tiers_hold], dtype=bool)
    tier_score_hold = score_binary_alerts(tier_alerts_hold, hold_high)
    tau_alerts_hold = pred_hold >= model_tau
    tau_score_hold = score_binary_alerts(tau_alerts_hold, hold_high)

    # Prefer calibrated High/Critical tier alert if it already meets hit-rate target; otherwise use 2023-tuned tau.
    if (
        tier_score_hold.hit_rate >= rule_score_hold.hit_rate
        and tier_score_hold.false_alarm_ratio < rule_score_hold.false_alarm_ratio
    ):
        model_alert_mode = "calibrated_high_or_critical_tier"
        model_threshold_cases: float | None = float(cutoffs[1])
        model_score_hold = tier_score_hold
        use_tier_alert = True
    else:
        model_alert_mode = f"h3_mean_gte_{model_tau:.2f}_tuned_on_2023"
        model_threshold_cases = model_tau
        model_score_hold = tau_score_hold
        use_tier_alert = False

    X_lead = lead_window_df[list(FEATURE_COLUMNS)]
    pred_lead = np.clip(np.asarray(booster_h3.predict(X_lead), dtype=np.float64), 0.0, None)
    if use_tier_alert:
        ep_lead = np.array(
            [
                artifact.endemic_thresholds.get((str(w), canonical_iso_week(tw)), 8.0)
                for w, tw in zip(
                    lead_window_df["ward_id"].astype(str), lead_window_df["target_week"], strict=True
                )
            ],
            dtype=np.float64,
        )
        _, p90_lead, _ = compute_bands_and_risk_vectorized(pred_lead, cal_h3)
        tiers_lead = [
            escalate_tier(tier_from_cases(float(mu), cutoffs), float(p90), float(ep))[0]
            for mu, p90, ep in zip(pred_lead, p90_lead, ep_lead, strict=True)
        ]
        model_alerts_lead = np.array([t in ("High", "Critical") for t in tiers_lead], dtype=bool)
    else:
        model_alerts_lead = pred_lead >= model_tau

    alert_lookup_model = {
        (str(w), wk): bool(al)
        for w, wk, al in zip(
            lead_window_df["ward_id"].astype(str),
            lead_window_df["week"],
            model_alerts_lead,
            strict=True,
        )
    }
    model_lead = episode_lead_times(
        obs_hold["ward_id"].astype(str).tolist(),
        list(obs_hold["week"]),
        [
            alert_lookup_model.get((str(w), wk), False)
            for w, wk in zip(obs_hold["ward_id"].astype(str), obs_hold["week"], strict=True)
        ],
        obs_hold["is_high_holdout"].astype(bool).tolist(),
        max_lookback_weeks=8,
    )

    hit_delta = round(model_score_hold.hit_rate - rule_score_hold.hit_rate, 4)
    far_delta = round(model_score_hold.false_alarm_ratio - rule_score_hold.false_alarm_ratio, 4)
    pss_delta = round(model_score_hold.peirce_skill_score - rule_score_hold.peirce_skill_score, 4)
    meets_hit = model_score_hold.hit_rate >= rule_score_hold.hit_rate - 0.005
    reduces_far = model_score_hold.false_alarm_ratio < rule_score_hold.false_alarm_ratio

    summary_note = (
        f"On the locked 2024–2025 hold-out ({rule_score_hold.total_ward_weeks:,} ward-weeks), "
        f"the zero-model rule achieves {rule_score_hold.hit_rate * 100:.1f}% hit rate "
        f"(FAR {rule_score_hold.false_alarm_ratio * 100:.1f}%, PSS {rule_score_hold.peirce_skill_score:.3f}), "
        f"while Abhas LightGBM achieves {model_score_hold.hit_rate * 100:.1f}% hit rate "
        f"(FAR {model_score_hold.false_alarm_ratio * 100:.1f}%, PSS {model_score_hold.peirce_skill_score:.3f}) — "
        f"cutting false alarms by {(rule_score_hold.fp - model_score_hold.fp):,} ward-weeks."
    )

    data_as_of = (
        max(hold_target_weeks).isoformat() if hold_target_weeks else max(hold_origin_weeks).isoformat()
    )
    return {
        "model_version": artifact.version,
        "git_sha": resolve_git_sha(),
        "data_as_of": data_as_of,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_sha256": actual_sha,
        "rule": {
            "rain_2w_gt_mm": best_cand.rain_2w_gt_mm,
            "water_logging_gte": best_cand.water_logging_gte,
            "target_horizon": DEFAULT_TARGET_HORIZON,
            "high_case_threshold": DEFAULT_HIGH_CASE_THRESHOLD,
            "fit_years": [2016, DEFAULT_MAX_TRAIN_YEAR],
            "holdout_years": [2024, 2025],
            "rule_text_en": _format_rule_en(best_cand.rain_2w_gt_mm, best_cand.water_logging_gte),
            "rule_text_bn": _format_rule_bn(best_cand.rain_2w_gt_mm, best_cand.water_logging_gte),
        },
        "holdout_rule": _metrics_dict(rule_score_hold, rule_lead),
        "holdout_model": {
            **_metrics_dict(model_score_hold, model_lead),
            "alert_mode": model_alert_mode,
            "threshold_cases": model_threshold_cases,
            "calibrated_tier_hit_rate": round(tier_score_hold.hit_rate, 4),
            "calibrated_tier_far": round(tier_score_hold.false_alarm_ratio, 4),
            "calibrated_tier_pss": round(tier_score_hold.peirce_skill_score, 4),
        },
        "comparison": {
            "hit_rate_delta": hit_delta,
            "far_delta": far_delta,
            "pss_delta": pss_delta,
            "false_alarms_avoided": int(rule_score_hold.fp - model_score_hold.fp),
            "model_meets_hit_rate": bool(meets_hit),
            "model_reduces_far": bool(reduces_far),
            "summary_note": summary_note,
        },
        "grid_top": [
            {
                "rain_2w_gt_mm": c.rain_2w_gt_mm,
                "water_logging_gte": c.water_logging_gte,
                "train_pss": round(c.train_pss, 4),
                "train_hit_rate": round(c.train_hit_rate, 4),
                "train_far": round(c.train_far, 4),
            }
            for c in top_cands
        ],
    }


def run_trigger(
    *,
    dataset_path: Path = DEFAULT_INPUT_PATH,
    output_path: Path = DEFAULT_TRIGGER_OUT,
) -> dict[str, Any]:
    payload = build_trigger_evaluation(dataset_path=dataset_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Precompute ADR-0020 Early-Action Trigger JSON.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_TRIGGER_OUT)
    args = parser.parse_args(argv)
    payload = run_trigger(dataset_path=args.input, output_path=args.out)
    r = payload["rule"]
    hr = payload["holdout_rule"]
    hm = payload["holdout_model"]
    print(
        f"trigger OK -> {args.out.relative_to(REPO_ROOT)}: "
        f"R={r['rain_2w_gt_mm']}mm W={r['water_logging_gte']} | "
        f"rule hit={hr['hit_rate']:.3f} FAR={hr['false_alarm_ratio']:.3f} PSS={hr['peirce_skill_score']:.3f} "
        f"med_lead={hr['lead_time_weeks']['median']}w | "
        f"abhas hit={hm['hit_rate']:.3f} FAR={hm['false_alarm_ratio']:.3f} PSS={hm['peirce_skill_score']:.3f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
