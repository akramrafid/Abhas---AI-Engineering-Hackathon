"""Precompute ADR-0021 Structural-Fix Planner -> apps/api/evals/results/structural.json.

Usage:
    npm run structural
    node scripts/py.mjs -m ml.structural

Estimates annualised cases prevented per ward for -0.1 / -0.2 improvements in
`water_logging_risk_index` and +0.1 / +0.2 improvements in `sanitation_score` using BOTH:
  1. Poisson GLM (rainfall_lag_2..4 + population_density_sqkm, water_logging_risk_index, sanitation_score)
  2. LightGBM partial dependence cross-check (changing ONLY the target trait on abhas-lgbm-1.1.2)
with deterministic cluster-bootstrap 95% CIs and a Build-vs-Send join against simulator crew ROI.
"""

from __future__ import annotations

import argparse
import json
import warnings
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm

from app.adapters.lgbm_model import load_model
from app.core.config import API_DIR, REPO_ROOT, get_settings
from app.core.run_meta import resolve_git_sha
from app.shared.features import (
    FEATURE_COLUMNS,
    build_features,
    fit_rain_normals,
    normalize_observation_columns,
)
from app.shared.intervention import EFFICACY_PRESETS, apply_reduction, reduction
from app.shared.structural import (
    STRUCTURAL_DISCLAIMER,
    bootstrap_ci_95,
    build_vs_send_ratio,
    clamp_trait_delta,
    classify_build_vs_send,
    glm_annual_prevented,
    pd_annual_prevented,
)
from ml.fit_supply import DEFAULT_INPUT_PATH, EXPECTED_ONSITE_SHA256, compute_sha256

RESULTS_DIR = API_DIR / "evals" / "results"
DEFAULT_STRUCTURAL_OUT = RESULTS_DIR / "structural.json"

GLM_COLS: tuple[str, ...] = (
    "rainfall_lag_2",
    "rainfall_lag_3",
    "rainfall_lag_4",
    "population_density_sqkm",
    "water_logging_risk_index",
    "sanitation_score",
)
TRAIN_MAX_YEAR = 2023
BOOTSTRAP_RESAMPLES = 500
BOOTSTRAP_SEED = 20261127
BUILD_VS_SEND_ORIGIN = date(2024, 8, 5)


def _fit_poisson_glm(
    X: np.ndarray,
    y: np.ndarray,
    *,
    start_params: np.ndarray | None = None,
) -> np.ndarray:
    """Fit log-link Poisson GLM and return parameter vector [const, *GLM_COLS]."""
    X_design = sm.add_constant(X, has_constant="add")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = sm.GLM(y, X_design, family=sm.families.Poisson())
        res = model.fit(start_params=start_params, maxiter=40, disp=False)
    return np.asarray(res.params, dtype=np.float64)


def _compute_sim_1crew_roi_by_ward(
    feat_df: pd.DataFrame,
    artifact: Any,
    origin_week: date,
) -> dict[str, float]:
    """Compute exact 1-crew peak-season simulator ROI (h=2..4, base preset) per ward (ADR-0013)."""
    origin_rows = feat_df.loc[feat_df["week"] == origin_week].copy()
    if origin_rows.empty:
        raise ValueError(f"No feature rows found for build_vs_send origin {origin_week.isoformat()}")

    e_max, k_rate = EFFICACY_PRESETS["base"]
    frac = reduction(1, e_max, k_rate)
    roi_map: dict[str, float] = {}

    for _, row in origin_rows.iterrows():
        wid = str(row["ward_id"])
        row_dict = {col: float(row[col]) for col in FEATURE_COLUMNS}
        rain_total = float(row["rain_sum_0_3"])
        prevented = 0.0
        for h in (2, 3, 4):
            booster = artifact._boosters[h]
            base_frame = pd.DataFrame([row_dict], columns=list(FEATURE_COLUMNS))
            cf_dict = apply_reduction(row_dict, horizon=h, fraction=frac, rain_total=rain_total)
            cf_frame = pd.DataFrame([cf_dict], columns=list(FEATURE_COLUMNS))
            mu_base = max(0.0, float(booster.predict(base_frame)[0]))
            mu_cf = max(0.0, float(booster.predict(cf_frame)[0]))
            prevented += max(0.0, mu_base - mu_cf)
        roi_map[wid] = round(prevented, 4)
    return roi_map


def _est_ci(est: float, lo: float, hi: float) -> dict[str, float]:
    return {
        "estimate": round(float(est), 2),
        "ci_low": round(float(lo), 2),
        "ci_high": round(float(hi), 2),
    }


def build_structural_plan(
    *,
    dataset_path: Path = DEFAULT_INPUT_PATH,
    expected_sha256: str = EXPECTED_ONSITE_SHA256,
    bootstrap_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Fit Poisson GLM + LightGBM partial dependence + bootstrap CIs + Build-vs-Send join."""
    if not dataset_path.exists():
        raise FileNotFoundError(f"Onsite dataset not found: {dataset_path}")
    actual_sha = compute_sha256(dataset_path)
    if actual_sha != expected_sha256.lower():
        raise ValueError(
            f"Onsite dataset SHA-256 mismatch: expected {expected_sha256.lower()}, got {actual_sha}"
        )

    raw_df = normalize_observation_columns(pd.read_excel(dataset_path))
    raw_df = raw_df.sort_values(["ward_id", "week"], kind="mergesort").reset_index(drop=True)
    rain_normals = fit_rain_normals(raw_df, max_year=TRAIN_MAX_YEAR)
    feat_df = build_features(raw_df, horizon=3, rain_normals=rain_normals)
    feat_df["dengue_cases"] = raw_df["dengue_cases"].to_numpy(dtype=np.float64)
    feat_df["year"] = feat_df["week"].map(lambda d: d.year)

    # Fit Poisson GLM strictly on 2016–2023 non-null lag rows.
    glm_df = (
        feat_df.loc[feat_df["year"] <= TRAIN_MAX_YEAR].dropna(subset=list(GLM_COLS) + ["dengue_cases"]).copy()
    )
    if glm_df.empty:
        raise ValueError("No valid 2016–2023 rows for Poisson GLM fit")

    X_glm = glm_df[list(GLM_COLS)].to_numpy(dtype=np.float64)
    y_glm = glm_df["dengue_cases"].to_numpy(dtype=np.float64)
    # Standardise population_density_sqkm internally for numerical stability, keep wl & san raw.
    dens_idx = GLM_COLS.index("population_density_sqkm")
    wl_idx = GLM_COLS.index("water_logging_risk_index") + 1  # +1 for intercept
    san_idx = GLM_COLS.index("sanitation_score") + 1

    X_scaled = X_glm.copy()
    X_scaled[:, dens_idx] = X_scaled[:, dens_idx] / 10_000.0
    base_params = _fit_poisson_glm(X_scaled, y_glm)
    beta_wl = float(base_params[wl_idx])
    beta_san = float(base_params[san_idx])

    # Cluster bootstrap over ward-year blocks for GLM slopes (fast warm-started IRLS).
    glm_df["block"] = glm_df["ward_id"].astype(str) + "_" + glm_df["year"].astype(str)
    unique_blocks = sorted(glm_df["block"].unique().tolist())
    block_indices = [np.flatnonzero(glm_df["block"].to_numpy() == b) for b in unique_blocks]
    n_blocks = len(block_indices)
    rng = np.random.default_rng(seed)

    boot_beta_wl = np.empty(bootstrap_resamples, dtype=np.float64)
    boot_beta_san = np.empty(bootstrap_resamples, dtype=np.float64)
    for b_i in range(bootstrap_resamples):
        drawn = rng.integers(0, n_blocks, size=n_blocks)
        idx = np.concatenate([block_indices[j] for j in drawn])
        params_b = _fit_poisson_glm(X_scaled[idx], y_glm[idx], start_params=base_params)
        boot_beta_wl[b_i] = params_b[wl_idx]
        boot_beta_san[b_i] = params_b[san_idx]

    # LightGBM partial-dependence cross-check (production h=3 model, changing ONLY the target trait).
    artifact = load_model(get_settings().model_path)
    booster_h3 = artifact._boosters[3]
    pd_df = feat_df.dropna(subset=list(FEATURE_COLUMNS)).copy()
    pd_df["block"] = pd_df["ward_id"].astype(str) + "_" + pd_df["year"].astype(str)

    X_pd_base = pd_df[list(FEATURE_COLUMNS)].copy()
    pred_base = np.clip(np.asarray(booster_h3.predict(X_pd_base), dtype=np.float64), 0.0, None)

    scenarios: tuple[tuple[str, str, float], ...] = (
        ("water_logging_minus_01", "water_logging_risk_index", -0.1),
        ("water_logging_minus_02", "water_logging_risk_index", -0.2),
        ("sanitation_plus_01", "sanitation_score", +0.1),
        ("sanitation_plus_02", "sanitation_score", +0.2),
    )
    pd_shifted: dict[str, np.ndarray] = {}
    for key, col, delta in scenarios:
        X_mod = X_pd_base.copy()
        X_mod[col] = np.clip(X_mod[col].to_numpy(dtype=np.float64) + delta, 0.0, 1.0)
        pd_shifted[key] = np.clip(np.asarray(booster_h3.predict(X_mod), dtype=np.float64), 0.0, None)

    # Pre-aggregate PD sums per (ward, year) block for rapid cluster bootstrap CIs.
    pd_blocks = sorted(pd_df["block"].unique().tolist())
    pd_block_arr = pd_df["block"].to_numpy()
    pd_base_sum_by_block = np.array(
        [float(np.sum(pred_base[pd_block_arr == b])) for b in pd_blocks], dtype=np.float64
    )
    pd_diff_sum_by_block: dict[str, np.ndarray] = {}
    for key, _, _ in scenarios:
        diff_vec = pred_base - pd_shifted[key]
        pd_diff_sum_by_block[key] = np.array(
            [float(np.sum(diff_vec[pd_block_arr == b])) for b in pd_blocks], dtype=np.float64
        )

    rng_pd = np.random.default_rng(seed + 1)
    pd_boot_draws = rng_pd.integers(0, len(pd_blocks), size=(bootstrap_resamples, len(pd_blocks)))

    # Build-vs-send simulator 1-crew ROI per ward on reference peak origin 2024-08-05.
    sim_roi_by_ward = _compute_sim_1crew_roi_by_ward(feat_df, artifact, BUILD_VS_SEND_ORIGIN)

    # Ward metadata & historical annualised case burden (full panel 2016–2025).
    ward_stats = (
        raw_df.groupby("ward_id", sort=True)
        .agg(
            city=("city", "first"),
            water_logging_risk_index=("water_logging_risk_index", "first"),
            sanitation_score=("sanitation_score", "first"),
            population_density_sqkm=("population_density_sqkm", "first"),
            mean_weekly_cases=("dengue_cases", "mean"),
        )
        .reset_index()
    )

    # Aggregate seasonal % reduction summary across all 60 wards (both GLM & LightGBM PD).
    summary: dict[str, Any] = {}
    for key, col, delta in scenarios:
        beta = beta_wl if col == "water_logging_risk_index" else beta_san
        boot_betas = boot_beta_wl if col == "water_logging_risk_index" else boot_beta_san

        # Population-weighted effective GLM seasonal % reduction across the 60 wards (respecting clamping).
        total_base_yr = 0.0
        total_prev_yr = 0.0
        boot_prev_totals = np.zeros(bootstrap_resamples, dtype=np.float64)
        for _, wr in ward_stats.iterrows():
            base_yr = float(wr["mean_weekly_cases"]) * 52.0
            eff_d = clamp_trait_delta(float(wr[col]), delta)
            _, prev_yr = glm_annual_prevented(base_yr, beta, eff_d)
            total_base_yr += base_yr
            total_prev_yr += prev_yr
            boot_prev_totals += base_yr * (1.0 - np.exp(boot_betas * eff_d))

        glm_pct = (100.0 * total_prev_yr / total_base_yr) if total_base_yr > 0.0 else 0.0
        glm_pct_samples = (100.0 * boot_prev_totals / total_base_yr) if total_base_yr > 0.0 else np.zeros(1)
        glm_lo, glm_hi = bootstrap_ci_95(glm_pct_samples, point_estimate=glm_pct)

        pd_pct, _ = pd_annual_prevented(pred_base, pd_shifted[key])
        num_b = np.sum(pd_diff_sum_by_block[key][pd_boot_draws], axis=1)
        den_b = np.sum(pd_base_sum_by_block[pd_boot_draws], axis=1)
        pd_pct_samples = np.where(den_b > 0.0, 100.0 * num_b / den_b, 0.0)
        pd_lo, pd_hi = bootstrap_ci_95(pd_pct_samples, point_estimate=pd_pct)

        summary[key] = {
            "glm": _est_ci(glm_pct, glm_lo, glm_hi),
            "lgbm_pd": _est_ci(pd_pct, pd_lo, pd_hi),
            "unclamped_glm_pct": round(100.0 * (1.0 - float(np.exp(beta * delta))), 2),
        }

    # Per-ward annualised cases prevented (GLM + LightGBM PD + 95% CIs).
    ward_entries: list[dict[str, Any]] = []
    rng_ward = np.random.default_rng(seed + 2)
    pd_ward_arr = pd_df["ward_id"].astype(str).to_numpy()
    pd_year_arr = pd_df["year"].to_numpy()

    for _, wr in ward_stats.iterrows():
        wid = str(wr["ward_id"])
        city = str(wr["city"])
        wl = float(wr["water_logging_risk_index"])
        san = float(wr["sanitation_score"])
        dens = float(wr["population_density_sqkm"])
        base_yr = float(wr["mean_weekly_cases"]) * 52.0

        w_mask = pd_ward_arr == wid
        w_years = sorted(np.unique(pd_year_arr[w_mask]).tolist())
        w_year_masks = [w_mask & (pd_year_arr == yr) for yr in w_years]
        n_wy = len(w_year_masks)
        wy_draws = rng_ward.integers(0, n_wy, size=(bootstrap_resamples, n_wy))

        effects: dict[str, Any] = {}
        for key, col, delta in scenarios:
            beta = beta_wl if col == "water_logging_risk_index" else beta_san
            boot_betas = boot_beta_wl if col == "water_logging_risk_index" else boot_beta_san
            eff_d = clamp_trait_delta(wl if col == "water_logging_risk_index" else san, delta)

            _, glm_cases = glm_annual_prevented(base_yr, beta, eff_d)
            glm_samples = base_yr * (1.0 - np.exp(boot_betas * eff_d))
            g_lo, g_hi = bootstrap_ci_95(glm_samples, point_estimate=glm_cases)

            _, pd_cases = pd_annual_prevented(pred_base[w_mask], pd_shifted[key][w_mask])
            diff_full = pred_base - pd_shifted[key]
            annual_by_yr = np.array(
                [52.0 * float(np.mean(diff_full[m])) for m in w_year_masks], dtype=np.float64
            )
            pd_samples = np.mean(annual_by_yr[wy_draws], axis=1)
            p_lo, p_hi = bootstrap_ci_95(pd_samples, point_estimate=pd_cases)

            effects[key] = {
                "effective_delta": eff_d,
                "glm": _est_ci(glm_cases, g_lo, g_hi),
                "lgbm_pd": _est_ci(pd_cases, p_lo, p_hi),
            }

        ward_entries.append(
            {
                "ward_id": wid,
                "city": city,
                "water_logging_risk_index": round(wl, 4),
                "sanitation_score": round(san, 4),
                "population_density_sqkm": round(dens, 1),
                "baseline_cases_per_yr": round(base_yr, 2),
                **effects,
                "sim_roi_cases_per_crew": round(float(sim_roi_by_ward.get(wid, 0.0)), 2),
            }
        )

    # Attach Build-vs-Send comparison relative to medians across all 60 wards.
    drain_vals = [float(w["water_logging_minus_02"]["glm"]["estimate"]) for w in ward_entries]
    roi_vals = [float(w["sim_roi_cases_per_crew"]) for w in ward_entries]
    drain_med = float(np.median(drain_vals))
    roi_med = float(np.median(roi_vals))

    for w in ward_entries:
        d_glm = float(w["water_logging_minus_02"]["glm"]["estimate"])
        d_pd = float(w["water_logging_minus_02"]["lgbm_pd"]["estimate"])
        roi_val = float(w.pop("sim_roi_cases_per_crew"))
        w["build_vs_send"] = {
            "drainage_cases_per_yr_glm": round(d_glm, 2),
            "drainage_cases_per_yr_pd": round(d_pd, 2),
            "sim_roi_cases_per_crew": round(roi_val, 2),
            "crew_deployments_equiv": build_vs_send_ratio(d_glm, roi_val),
            "priority_signal": classify_build_vs_send(
                d_glm, roi_val, drainage_median=drain_med, roi_median=roi_med
            ),
        }

    # Sort descending by drainage -0.2 GLM cases/yr, tie-break by ward_id.
    ward_entries.sort(
        key=lambda item: (-float(item["water_logging_minus_02"]["glm"]["estimate"]), str(item["ward_id"]))
    )

    data_as_of = max(raw_df["week"]).isoformat()
    return {
        "model_version": artifact.version,
        "git_sha": resolve_git_sha(),
        "data_as_of": data_as_of,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_sha256": actual_sha,
        "disclaimer": STRUCTURAL_DISCLAIMER,
        "fit_years": [2016, TRAIN_MAX_YEAR],
        "bootstrap_resamples": int(bootstrap_resamples),
        "seed": int(seed),
        "build_vs_send_origin_week": BUILD_VS_SEND_ORIGIN.isoformat(),
        "glm_coefficients": {
            "water_logging_risk_index": round(beta_wl, 4),
            "sanitation_score": round(beta_san, 4),
        },
        "summary": summary,
        "wards": ward_entries,
    }


def run_structural(
    *,
    dataset_path: Path = DEFAULT_INPUT_PATH,
    output_path: Path = DEFAULT_STRUCTURAL_OUT,
) -> dict[str, Any]:
    payload = build_structural_plan(dataset_path=dataset_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Precompute ADR-0021 Structural-Fix Planner JSON.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_STRUCTURAL_OUT)
    args = parser.parse_args(argv)
    payload = run_structural(dataset_path=args.input, output_path=args.out)
    s = payload["summary"]
    top = payload["wards"][0]
    print(
        f"structural OK -> {args.out.relative_to(REPO_ROOT)}: "
        f"-0.1 wl GLM={s['water_logging_minus_01']['glm']['estimate']:.2f}% "
        f"(PD={s['water_logging_minus_01']['lgbm_pd']['estimate']:.2f}%) | "
        f"+0.1 san GLM={s['sanitation_plus_01']['glm']['estimate']:.2f}% "
        f"(PD={s['sanitation_plus_01']['lgbm_pd']['estimate']:.2f}%) | "
        f"top={top['ward_id']} ({top['water_logging_minus_02']['glm']['estimate']:.1f} cases/yr vs "
        f"ROI {top['build_vs_send']['sim_roi_cases_per_crew']:.2f}/crew)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
