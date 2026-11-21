"""Expanding-window chronological backtest (2019–2022), 2023 tuning fold, and locked 2024–2025 hold-out.

Compares 6 models required by GET /api/v1/validation:
  lightgbm, lightgbm_no_weather, negbin_glm (statsmodels), climatology, seasonal_naive, persistence.

Writes `apps/api/evals/results/validation.json` matching `ValidationResponse`.
"""

from __future__ import annotations

import json
import warnings
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
import statsmodels.api as sm

from app.adapters.lgbm_model import load_model
from app.core.config import API_DIR, get_settings
from app.shared.features import (
    FEATURE_COLUMNS,
    VALID_HORIZONS,
    canonical_iso_week,
    fit_rain_normals,
)
from app.shared.tiers import (
    DEFAULT_TIER_CUTOFFS,
    TIERS,
    calibrate_negbin_conformal,
    compute_bands_and_risk_vectorized,
)
from evals.scoring import (
    ClimatologyBaseline,
    coverage_80,
    mae,
    poisson_deviance,
    rmse,
    tier_metrics,
)
from ml.train import (
    NO_WEATHER_COLUMNS,
    TUNED_PARAMS,
    build_supervised_frame,
    load_training_dataframe,
    monotone_constraints_for_horizon,
)

RESULTS_DIR = API_DIR / "evals" / "results"
VALIDATION_OUTPUT_PATH = RESULTS_DIR / "validation.json"
EVAL_CONFIG_PATH = API_DIR / "evals" / "config.json"

GLM_FEATURES: tuple[str, ...] = (
    "rainfall_lag_0",
    "rainfall_lag_1",
    "rainfall_lag_2",
    "rainfall_lag_3",
    "rainfall_lag_4",
    "rainfall_lag_5",
    "rainfall_lag_6",
    "rainfall_lag_7",
    "rainfall_lag_8",
    "water_logging_risk_index",
    "population_density_sqkm",
    "sanitation_score",
    "iso_week_sin",
    "iso_week_cos",
)

FOLDS: tuple[tuple[str, int, tuple[int, ...]], ...] = (
    ("2019", 2018, (2019,)),
    ("2020", 2019, (2020,)),
    ("2021", 2020, (2021,)),
    ("2022", 2021, (2022,)),
    ("tune_2023", 2022, (2023,)),
    ("holdout_2024_2025", 2023, (2024, 2025)),
)


def _fit_predict_negbin_glm(tr: pd.DataFrame, te: pd.DataFrame) -> np.ndarray:
    """Epidemiology-standard distributed-lag Negative Binomial GLM (statsmodels)."""
    X_tr_raw = tr[list(GLM_FEATURES)].to_numpy(dtype=np.float64)
    X_te_raw = te[list(GLM_FEATURES)].to_numpy(dtype=np.float64)
    means = np.mean(X_tr_raw, axis=0)
    stds = np.where(np.std(X_tr_raw, axis=0) > 1e-8, np.std(X_tr_raw, axis=0), 1.0)
    X_tr = sm.add_constant((X_tr_raw - means) / stds, has_constant="add")
    X_te = sm.add_constant((X_te_raw - means) / stds, has_constant="add")
    y_tr = tr["y"].to_numpy(dtype=np.float64)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            glm = sm.GLM(y_tr, X_tr, family=sm.families.NegativeBinomial(alpha=0.5))
            res = glm.fit(maxiter=60, disp=False)
            pred = np.asarray(res.predict(X_te), dtype=np.float64)
        except Exception:  # noqa: BLE001
            # Fallback to Poisson GLM if NegBin IRLS hits boundary
            glm = sm.GLM(y_tr, X_tr, family=sm.families.Poisson())
            res = glm.fit(maxiter=60, disp=False)
            pred = np.asarray(res.predict(X_te), dtype=np.float64)
    pred = np.where(np.isfinite(pred), pred, float(np.mean(y_tr)))
    return np.clip(pred, 0.0, 100.0)


def _metric_row(
    model: str, horizon: int, period: str, y_true: np.ndarray, y_pred: np.ndarray
) -> dict[str, Any]:
    return {
        "model": model,
        "horizon": horizon,
        "period": period,
        "mae": round(mae(y_true, y_pred), 4),
        "rmse": round(rmse(y_true, y_pred), 4),
        "poisson_deviance": round(poisson_deviance(y_true, y_pred), 4),
        "n": int(len(y_true)),
    }


def run_backtest(output_path: Path = VALIDATION_OUTPUT_PATH) -> dict[str, Any]:
    """Run expanding-window + 2023 tuning + locked 2024–2025 backtest and save validation.json."""
    settings = get_settings()
    df = load_training_dataframe()

    # Load committed artifact for the final holdout_2024_2025 evaluation so validation.json matches serving 1:1.
    artifact = load_model(settings.model_path)
    case_map = {
        (str(w), wk): float(c) for w, wk, c in zip(df["ward_id"], df["week"], df["dengue_cases"], strict=True)
    }

    # Build a climatology-compatible frame once
    clim_df = df.rename(columns={"week": "date"}).copy()
    clim_df["year"] = [d.year for d in clim_df["date"].tolist()]
    clim_df["iso_week"] = [canonical_iso_week(d) for d in clim_df["date"].tolist()]

    metrics: list[dict[str, Any]] = []
    coverage_rows: list[dict[str, Any]] = []

    holdout_y_all: list[float] = []
    holdout_pred_tiers_all: list[str] = []

    for period, train_max_year, test_years in FOLDS:
        df_tr_raw = df.loc[[wk.year <= train_max_year for wk in df["week"].tolist()]].copy()
        normals = fit_rain_normals(df_tr_raw, max_year=train_max_year)
        clim = ClimatologyBaseline.fit(clim_df, train_end_year=train_max_year)

        for h in VALID_HORIZONS:
            sup = build_supervised_frame(df, horizon=h, rain_normals=normals)
            tr = sup.loc[sup["target_year"] <= train_max_year]
            te = sup.loc[sup["target_year"].isin(test_years)]

            y_tr = tr["y"].to_numpy(dtype=np.float64)
            y_te = te["y"].to_numpy(dtype=np.float64)
            X_tr = tr[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
            X_te = te[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)

            if period == "holdout_2024_2025":
                # Score exact committed artifact so metrics & confusion matrix match evals/run.py identically.
                te_dicts = te[list(FEATURE_COLUMNS)].to_dict(orient="records")
                wids = [str(w) for w in te["ward_id"].tolist()]
                iws = [canonical_iso_week(tw) for tw in te["target_week"].tolist()]
                pfs = artifact.predict(
                    [{str(k): float(v) for k, v in rec.items()} for rec in te_dicts],
                    horizon=h,
                    ward_ids=wids,
                    target_iso_weeks=iws,
                )
                lgbm_pred = np.array([pf.expected_cases for pf in pfs], dtype=np.float64)
                p10_te = np.array([pf.p10 for pf in pfs], dtype=np.float64)
                p90_te = np.array([pf.p90 for pf in pfs], dtype=np.float64)
                holdout_y_all.extend(y_te.tolist())
                holdout_pred_tiers_all.extend(pf.tier for pf in pfs)
            else:
                model = lgb.LGBMRegressor(
                    **TUNED_PARAMS,
                    monotone_constraints=monotone_constraints_for_horizon(h),
                )
                model.fit(X_tr, y_tr)
                lgbm_pred = np.maximum(0.0, np.asarray(model.predict(X_te), dtype=np.float64))
                # Fold coverage uses calibration fit strictly on the previous year when available
                cal_year = train_max_year
                tr_sub = tr.loc[tr["target_year"] < cal_year]
                va_sub = tr.loc[tr["target_year"] == cal_year]
                if len(tr_sub) > 100 and len(va_sub) > 100:
                    m_cal = lgb.LGBMRegressor(
                        **TUNED_PARAMS,
                        monotone_constraints=monotone_constraints_for_horizon(h),
                    )
                    m_cal.fit(
                        tr_sub[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64),
                        tr_sub["y"].to_numpy(dtype=np.float64),
                    )
                    mu_cal = np.maximum(
                        0.0,
                        np.asarray(m_cal.predict(va_sub[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64))),
                    )
                    cal_fold = calibrate_negbin_conformal(va_sub["y"].to_numpy(dtype=np.float64), mu_cal)
                else:
                    cal_fold = artifact.calibrations[h]
                p10_te, p90_te, _ = compute_bands_and_risk_vectorized(
                    lgbm_pred, cal_fold, high_cutoff=DEFAULT_TIER_CUTOFFS[1]
                )

            # 2) lightgbm_no_weather
            nw_model = lgb.LGBMRegressor(**TUNED_PARAMS)
            nw_model.fit(tr[list(NO_WEATHER_COLUMNS)].to_numpy(dtype=np.float64), y_tr)
            nw_pred = np.maximum(
                0.0, np.asarray(nw_model.predict(te[list(NO_WEATHER_COLUMNS)].to_numpy(dtype=np.float64)))
            )

            # 3) negbin_glm (statsmodels)
            glm_pred = _fit_predict_negbin_glm(tr, te)

            # 4) climatology
            clim_pred = np.array(
                [
                    clim.predict_one(str(w), tw).expected_cases
                    for w, tw in zip(te["ward_id"], te["target_week"], strict=True)
                ],
                dtype=np.float64,
            )

            # 5) seasonal_naive (same ward, 52 weeks prior to target_week)
            sn_pred = np.array(
                [
                    case_map.get((str(w), tw - timedelta(weeks=52)), 0.0)
                    for w, tw in zip(te["ward_id"], te["target_week"], strict=True)
                ],
                dtype=np.float64,
            )

            # 6) persistence (observed cases at origin week)
            pers_pred = np.array(
                [case_map.get((str(w), ow), 0.0) for w, ow in zip(te["ward_id"], te["week"], strict=True)],
                dtype=np.float64,
            )

            metrics.append(_metric_row("lightgbm", h, period, y_te, lgbm_pred))
            metrics.append(_metric_row("lightgbm_no_weather", h, period, y_te, nw_pred))
            metrics.append(_metric_row("negbin_glm", h, period, y_te, glm_pred))
            metrics.append(_metric_row("climatology", h, period, y_te, clim_pred))
            metrics.append(_metric_row("seasonal_naive", h, period, y_te, sn_pred))
            metrics.append(_metric_row("persistence", h, period, y_te, pers_pred))

            coverage_rows.append(
                {
                    "horizon": h,
                    "period": period,
                    "coverage_80": round(coverage_80(y_te, p10_te, p90_te), 4),
                }
            )

    tm = tier_metrics(holdout_y_all, holdout_pred_tiers_all)
    locked_sha: str | None = None
    if EVAL_CONFIG_PATH.exists():
        cfg = json.loads(EVAL_CONFIG_PATH.read_text(encoding="utf-8"))
        locked_sha = cfg.get("heldout_sha256")

    payload: dict[str, Any] = {
        "model_version": artifact.version,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "split": (
            "Expanding-window chronological folds test 2019–2022 (purged); "
            "2023 tunes hyperparameters, NegBin conformal bands & cost-sensitive tier cut-offs; "
            "2024–2025 hold-out locked by SHA-256 and scored once."
        ),
        "metrics": metrics,
        "coverage": coverage_rows,
        "confusion": {
            "labels": list(TIERS),
            "matrix": tm["matrix"],
            "within_one_tier": tm["within_one_tier"],
            "critical_recall": tm["critical_recall"],
            "macro_f1": tm["macro_f1"],
        },
        "holdout_locked_sha256": locked_sha,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"Backtest saved to {output_path.name}: {len(metrics)} metric rows, "
        f"within_one_tier={tm['within_one_tier']}, critical_recall={tm['critical_recall']}, "
        f"macro_f1={tm['macro_f1']}"
    )
    return payload


def main() -> int:
    run_backtest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
