"""Train and serialize the Abhas LightGBM Poisson direct multi-horizon (h=1..4) forecaster.

Usage:
    python -m ml.train                 # tuned production model (tuned strictly on 2019-2023)
    python -m ml.train --mode baseline # untuned default LightGBM baseline (recorded before tuning)

Guarantees:
- Imports canonical feature generation exclusively from `app/shared/features.py` (zero train/serve skew).
- Fits rainfall normals, endemic channels, NegBin dispersion, conformal calibration, and cost-sensitive
  tier cut-offs strictly on years <= 2023 (never tunes on locked 2024-2025 hold-out).
- Applies monotone-increasing (+1) constraints on origin-relative rainfall features for h=2..4 (AC-7).
- Pins `n_jobs=1` on serving boosters to eliminate OpenMP thread contention under 20 VUs.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from app.adapters.lgbm_model import compute_file_sha256
from app.core.config import API_DIR, get_settings
from app.shared.features import (
    DEFAULT_TRAIN_MAX_YEAR,
    FEATURE_COLUMNS,
    VALID_HORIZONS,
    build_features,
    canonical_iso_week,
    fit_rain_normals,
    normalize_observation_columns,
)
from app.shared.tiers import (
    HorizonCalibration,
    build_endemic_thresholds,
    calibrate_negbin_conformal,
    compute_bands_and_risk_vectorized,
    escalate_tier,
    select_cost_sensitive_cutoffs,
    tier_from_cases,
    ward_fingerprint,
)

ARTIFACTS_DIR = API_DIR / "ml" / "artifacts"
CURRENT_ARTIFACT_PATH = ARTIFACTS_DIR / "current.joblib"
METADATA_PATH = ARTIFACTS_DIR / "metadata.json"

NO_WEATHER_COLUMNS: tuple[str, ...] = (
    "population_density_sqkm",
    "water_logging_risk_index",
    "sanitation_score",
    "iso_week_sin",
    "iso_week_cos",
)

BASELINE_PARAMS: dict[str, Any] = {
    "objective": "poisson",
    "n_estimators": 100,
    "learning_rate": 0.1,
    "num_leaves": 31,
    "random_state": 42,
    "n_jobs": 1,
    "verbose": -1,
}

TUNED_PARAMS: dict[str, Any] = {
    "objective": "poisson",
    "n_estimators": 250,
    "learning_rate": 0.04,
    "num_leaves": 31,
    "min_child_samples": 25,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.85,
    "reg_alpha": 0.5,
    "reg_lambda": 2.0,
    "random_state": 42,
    "n_jobs": 1,
    "verbose": -1,
}


def monotone_constraints_for_horizon(horizon: int) -> list[int]:
    """Return per-feature monotone constraints aligned with the 2–4 week Aedes breeding clock.

    Enforces +1 on origin-week rainfall features (`rainfall_lag_0`, `rain_sum_0_3`, `rain_anomaly`)
    for horizons h=2..4 so raising origin rainfall in POST /api/v1/scenario strictly increases risk (AC-7).
    """
    constrained: set[str]
    if horizon == 1:
        constrained = {"rainfall_lag_1", "rainfall_lag_2", "rainfall_lag_3", "rain_sum_0_3"}
    elif horizon == 2:
        constrained = {
            "rainfall_lag_0",
            "rainfall_lag_1",
            "rainfall_lag_2",
            "rain_sum_0_3",
            "rain_anomaly",
        }
    elif horizon == 3:
        constrained = {"rainfall_lag_0", "rainfall_lag_1", "rain_sum_0_3", "rain_anomaly"}
    elif horizon == 4:
        constrained = {"rainfall_lag_0", "rain_sum_0_3", "rain_anomaly"}
    else:
        raise ValueError(f"Unsupported horizon {horizon}")
    return [1 if col in constrained else 0 for col in FEATURE_COLUMNS]


def load_training_dataframe() -> pd.DataFrame:
    settings = get_settings()
    raw = pd.read_excel(settings.raw_dataset_path, sheet_name=settings.raw_dataset_sheet)
    df = normalize_observation_columns(raw)
    df = df.sort_values(["ward_id", "week"], kind="mergesort").reset_index(drop=True)
    return df


def build_supervised_frame(
    df: pd.DataFrame,
    *,
    horizon: int,
    rain_normals: dict[tuple[str, int], float],
) -> pd.DataFrame:
    """Build leak-free features and join target `dengue_cases` at `target_week = week + h`."""
    feats = build_features(df, horizon=horizon, rain_normals=rain_normals, drop_incomplete_lags=True)
    case_map = {
        (str(w), wk): float(c) for w, wk, c in zip(df["ward_id"], df["week"], df["dengue_cases"], strict=True)
    }
    feats["y"] = [
        case_map.get((str(w), tw), np.nan)
        for w, tw in zip(feats["ward_id"], feats["target_week"], strict=True)
    ]
    feats = feats.loc[feats["y"].notna()].reset_index(drop=True)
    feats["target_year"] = [tw.year for tw in feats["target_week"].tolist()]
    return feats


def _fit_ward_climatology(df: pd.DataFrame, max_year: int) -> dict[tuple[str, int], dict[str, float]]:
    train = df.loc[[wk.year <= max_year for wk in df["week"].tolist()]].copy()
    train["_iso_week"] = [canonical_iso_week(wk) for wk in train["week"].tolist()]
    clim: dict[tuple[str, int], dict[str, float]] = {}
    grp = train.groupby(["ward_id", "_iso_week"])
    for key, sub in grp:
        wid = str(key[0])  # type: ignore[index]
        iw = int(key[1])  # type: ignore[index]
        clim[(wid, iw)] = {
            "avg_temp_c": round(float(sub["avg_temp_c"].mean()), 2),
            "max_temp_c": round(float(sub["max_temp_c"].mean()), 2),
            "min_temp_c": round(float(sub["min_temp_c"].mean()), 2),
            "rainfall_mm": round(float(sub["rainfall_mm"].mean()), 2),
            "relative_humidity_pct": round(float(sub["relative_humidity_pct"].mean()), 2),
        }
    return clim


def _fit_endemic_thresholds(df: pd.DataFrame, max_year: int) -> dict[tuple[str, int], float]:
    train = df.loc[[wk.year <= max_year for wk in df["week"].tolist()]].copy()
    train["_iso_week"] = [canonical_iso_week(wk) for wk in train["week"].tolist()]
    ward_iso_cases: dict[tuple[str, int], list[float]] = {}
    for key, series in train.groupby(["ward_id", "_iso_week"])["dengue_cases"]:
        ward_iso_cases[(str(key[0]), int(key[1]))] = series.to_numpy(dtype=float).tolist()  # type: ignore[index]
    return build_endemic_thresholds(ward_iso_cases)


def _extract_ward_fingerprints(df: pd.DataFrame) -> dict[tuple[float, float, float], str]:
    wards = df[
        ["ward_id", "population_density_sqkm", "water_logging_risk_index", "sanitation_score"]
    ].drop_duplicates(subset=["ward_id"])
    fps: dict[tuple[float, float, float], str] = {}
    for row in wards.itertuples(index=False):
        fp = ward_fingerprint(
            float(row.population_density_sqkm),
            float(row.water_logging_risk_index),
            float(row.sanitation_score),
        )
        fps[fp] = str(row.ward_id)
    return fps


def _fit_poisson_lgbm(
    X: np.ndarray, y: np.ndarray, params: dict[str, Any], horizon: int
) -> lgb.LGBMRegressor:
    model = lgb.LGBMRegressor(**params, monotone_constraints=monotone_constraints_for_horizon(horizon))
    model.fit(X, y)
    return model


def _fit_quantile_cqr(
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_cal: np.ndarray,
    y_cal: np.ndarray,
    params: dict[str, Any],
    horizon: int,
) -> tuple[lgb.LGBMRegressor, lgb.LGBMRegressor, float]:
    del horizon
    q_params = {k: v for k, v in params.items() if k != "objective"}
    lo = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.10)
    hi = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.90)
    lo.fit(X_tr, y_tr)
    hi.fit(X_tr, y_tr)
    p10_cal = np.maximum(0.0, lo.predict(X_cal))
    p90_cal = np.maximum(p10_cal, hi.predict(X_cal))
    scores = np.maximum(p10_cal - y_cal, y_cal - p90_cal)
    cqr_q = max(0.0, float(np.quantile(scores, 0.80)))
    return lo, hi, round(cqr_q, 4)


def train_and_save(
    *,
    mode: str = "tuned",
    output_path: Path = CURRENT_ARTIFACT_PATH,
    metadata_path: Path = METADATA_PATH,
) -> dict[str, Any]:
    """Train h=1..4 LightGBM Poisson models, calibrate on 2023, and write joblib + metadata.json."""
    if mode not in ("baseline", "tuned"):
        raise ValueError(f"mode must be 'baseline' or 'tuned', got {mode}")

    params = dict(BASELINE_PARAMS if mode == "baseline" else TUNED_PARAMS)
    model_version = "abhas-lgbm-baseline-0.1.0" if mode == "baseline" else "abhas-lgbm-1.0.0"

    df = load_training_dataframe()
    df_le23 = df.loc[[wk.year <= DEFAULT_TRAIN_MAX_YEAR for wk in df["week"].tolist()]].copy()

    # --- Phase A: Calibrate dispersion, conformal factor, and cost-sensitive cut-offs STRICTLY on 2023 ---
    normals_22 = fit_rain_normals(df_le23, max_year=2022)
    epi_22 = _fit_endemic_thresholds(df_le23, max_year=2022)

    calibrations: dict[int, HorizonCalibration] = {}
    cal_y_all: list[np.ndarray] = []
    cal_mu_all: list[np.ndarray] = []
    cal_p90_all: list[np.ndarray] = []
    cal_epi_all: list[np.ndarray] = []
    cal_summary: dict[str, dict[str, float]] = {}

    for h in VALID_HORIZONS:
        sup_23 = build_supervised_frame(df_le23, horizon=h, rain_normals=normals_22)
        tr = sup_23.loc[sup_23["target_year"] <= 2022]
        va = sup_23.loc[sup_23["target_year"] == 2023]
        X_tr = tr[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_tr = tr["y"].to_numpy(dtype=np.float64)
        X_va = va[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_va = va["y"].to_numpy(dtype=np.float64)

        cal_model = _fit_poisson_lgbm(X_tr, y_tr, params, h)
        mu_va = np.maximum(0.0, np.asarray(cal_model.predict(X_va), dtype=np.float64))
        cal_h = calibrate_negbin_conformal(y_va, mu_va, target_coverage=0.825)
        p10_va, p90_va, _ = compute_bands_and_risk_vectorized(mu_va, cal_h)
        cov_23 = float(np.mean((y_va >= p10_va) & (y_va <= p90_va)))

        # ADR-0004 fallback: switch to quantile LightGBM + CQR only if NegBin conformal misses [0.75, 0.90]
        if not (0.75 <= cov_23 <= 0.90):
            lo_q, hi_q, cqr_q = _fit_quantile_cqr(X_tr, y_tr, X_va, y_va, params, h)
            cal_h = HorizonCalibration(
                nb_r=cal_h.nb_r,
                conformal_scale=cal_h.conformal_scale,
                conformal_add=0.0,
                use_cqr=True,
                cqr_q=cqr_q,
            )
            p10_va, p90_va, _ = compute_bands_and_risk_vectorized(
                mu_va,
                cal_h,
                cqr_p10=np.asarray(lo_q.predict(X_va), dtype=np.float64),
                cqr_p90=np.asarray(hi_q.predict(X_va), dtype=np.float64),
            )
            cov_23 = float(np.mean((y_va >= p10_va) & (y_va <= p90_va)))

        calibrations[h] = cal_h
        cal_y_all.append(y_va)
        cal_mu_all.append(mu_va)
        cal_p90_all.append(p90_va)
        epis_va = np.array(
            [
                epi_22.get((str(w), canonical_iso_week(tw)), 5.0)
                for w, tw in zip(va["ward_id"], va["target_week"], strict=True)
            ],
            dtype=np.float64,
        )
        cal_epi_all.append(epis_va)
        cal_summary[f"h{h}"] = {
            "mae_2023": round(float(np.mean(np.abs(y_va - mu_va))), 4),
            "coverage_80_2023": round(cov_23, 4),
            "nb_r": cal_h.nb_r,
            "conformal_scale": cal_h.conformal_scale,
            "z_low": cal_h.z_low,
            "z_high": cal_h.z_high,
        }

    tier_cutoffs = select_cost_sensitive_cutoffs(
        np.concatenate(cal_y_all),
        np.concatenate(cal_mu_all),
        np.concatenate(cal_p90_all),
        np.concatenate(cal_epi_all),
        missed_critical_weight=5.0,
    )

    # Verify 2023 tier accuracy summary
    y_all_23 = np.concatenate(cal_y_all)
    mu_all_23 = np.concatenate(cal_mu_all)
    p90_all_23 = np.concatenate(cal_p90_all)
    epi_all_23 = np.concatenate(cal_epi_all)
    tiers_23 = [
        escalate_tier(tier_from_cases(float(m), tier_cutoffs), float(p9), float(ep))[0]
        for m, p9, ep in zip(mu_all_23, p90_all_23, epi_all_23, strict=True)
    ]
    actual_tiers_23 = [tier_from_cases(float(y)) for y in y_all_23]
    crit_total_23 = sum(1 for a in actual_tiers_23 if a == "Critical")
    crit_hits_23 = sum(
        1
        for a, p in zip(actual_tiers_23, tiers_23, strict=True)
        if a == "Critical" and p in ("High", "Critical")
    )

    # --- Phase B: Final production fit strictly on purged years <= 2023 ---
    normals_23 = fit_rain_normals(df_le23, max_year=DEFAULT_TRAIN_MAX_YEAR)
    epi_23 = _fit_endemic_thresholds(df_le23, max_year=DEFAULT_TRAIN_MAX_YEAR)
    clim_23 = _fit_ward_climatology(df_le23, max_year=DEFAULT_TRAIN_MAX_YEAR)
    fingerprints = _extract_ward_fingerprints(df_le23)

    boosters: dict[int, lgb.Booster] = {}
    cqr_low_boosters: dict[int, lgb.Booster] = {}
    cqr_high_boosters: dict[int, lgb.Booster] = {}
    no_weather_mae: dict[str, float] = {}

    for h in VALID_HORIZONS:
        sup_full = build_supervised_frame(df, horizon=h, rain_normals=normals_23)
        tr_23 = sup_full.loc[sup_full["target_year"] <= DEFAULT_TRAIN_MAX_YEAR]
        ho_24_25 = sup_full.loc[sup_full["target_year"].isin([2024, 2025])]

        X_tr = tr_23[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_tr = tr_23["y"].to_numpy(dtype=np.float64)
        final_model = _fit_poisson_lgbm(X_tr, y_tr, params, h)
        boosters[h] = final_model.booster_

        if calibrations[h].use_cqr:
            q_params = {k: v for k, v in params.items() if k != "objective"}
            lo = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.10)
            hi = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.90)
            lo.fit(X_tr, y_tr)
            hi.fit(X_tr, y_tr)
            cqr_low_boosters[h] = lo.booster_
            cqr_high_boosters[h] = hi.booster_

        # Weather ablation benchmark (static + target-week seasonality only, fit <= 2023)
        nw_model = lgb.LGBMRegressor(**params)
        nw_model.fit(tr_23[list(NO_WEATHER_COLUMNS)].to_numpy(dtype=np.float64), y_tr)
        nw_pred = np.maximum(
            0.0,
            np.asarray(nw_model.predict(ho_24_25[list(NO_WEATHER_COLUMNS)].to_numpy(dtype=np.float64))),
        )
        y_ho = ho_24_25["y"].to_numpy(dtype=np.float64)
        no_weather_mae[str(h)] = round(float(np.mean(np.abs(y_ho - nw_pred))), 4)

    bundle: dict[str, Any] = {
        "model_version": model_version,
        "feature_names": list(FEATURE_COLUMNS),
        "train_end_year": DEFAULT_TRAIN_MAX_YEAR,
        "max_normal_year": DEFAULT_TRAIN_MAX_YEAR,
        "boosters": boosters,
        "calibrations": {h: dataclasses.asdict(calibrations[h]) for h in VALID_HORIZONS},
        "cqr_low_boosters": cqr_low_boosters,
        "cqr_high_boosters": cqr_high_boosters,
        "tier_cutoffs": list(tier_cutoffs),
        "rain_normals": normals_23,
        "endemic_thresholds": epi_23,
        "ward_fingerprints": fingerprints,
        "ward_climatology": clim_23,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, output_path, compress=3)
    sha256 = compute_file_sha256(output_path)

    serialized_normals = {
        f"{wid}|{iw}": round(float(val), 4) for (wid, iw), val in sorted(normals_23.items())
    }
    metadata: dict[str, Any] = {
        "model_version": model_version,
        "mode": mode,
        "artifact_file": output_path.name,
        "sha256": sha256,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "train_end_year": DEFAULT_TRAIN_MAX_YEAR,
        "max_normal_year": DEFAULT_TRAIN_MAX_YEAR,
        "train_max_year": DEFAULT_TRAIN_MAX_YEAR,
        "feature_names": list(FEATURE_COLUMNS),
        "horizons": list(VALID_HORIZONS),
        "tier_cutoffs": list(tier_cutoffs),
        "monotone_constraints": {str(h): monotone_constraints_for_horizon(h) for h in VALID_HORIZONS},
        "calibrations": {str(h): dataclasses.asdict(calibrations[h]) for h in VALID_HORIZONS},
        "no_weather_mae": no_weather_mae,
        "rain_normals": serialized_normals,
        "params": params,
        "calibration_2023": {
            "by_horizon": cal_summary,
            "critical_recall_2023": round(crit_hits_23 / max(crit_total_23, 1), 4),
        },
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(
        f"Trained {model_version} ({mode}) -> {output_path.name} "
        f"[sha256={sha256[:12]}..., cutoffs={tier_cutoffs}, no_weather_mae={no_weather_mae}]"
    )
    return metadata


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Train Abhas LightGBM Poisson direct multi-horizon models.")
    ap.add_argument("--mode", choices=["baseline", "tuned"], default="tuned")
    args = ap.parse_args(argv)
    train_and_save(mode=args.mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
