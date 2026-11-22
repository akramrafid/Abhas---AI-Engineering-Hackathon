"""Expanding-window chronological backtest (2019–2022), 2023 tuning fold, and locked 2024–2025 hold-out.

Compares 7 models across all chronological periods with strict target-week purging:
  lightgbm, xgboost (CUDA challenger), lightgbm_no_weather, negbin_glm (statsmodels),
  climatology, seasonal_naive, persistence.

Writes BOTH:
  - `apps/api/evals/results/backtest.json` (all 7 models in `metrics`, coverage, confusion,
    challenger comparison, and deseasonalized lag-correlation evidence)
  - `apps/api/evals/results/validation.json` (the 6 contract `ModelName` values in `metrics` so
    `/api/v1/validation` and `ValidationResponse` remain 100% contract-compliant, plus top-level
    `challenger_metrics`, `challenger_summary`, and `lag_correlation_evidence`).
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
    compute_all_lag_correlations,
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
from ml.gpu_probe import probe_xgboost_cuda
from ml.train import (
    BEST_PARAMS_PATH,
    DEFAULT_XGB_PARAMS,
    NO_WEATHER_COLUMNS,
    TUNED_PARAMS,
    _fit_poisson_lgbm,
    _fit_poisson_xgboost,
    build_supervised_frame,
    load_params_file,
    load_training_dataframe,
    purge_fold_split,
)

RESULTS_DIR = API_DIR / "evals" / "results"
VALIDATION_OUTPUT_PATH = RESULTS_DIR / "validation.json"
BACKTEST_OUTPUT_PATH = RESULTS_DIR / "backtest.json"
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


def _resolve_params() -> tuple[dict[int, dict[str, Any]], dict[int, dict[str, Any]] | None]:
    if BEST_PARAMS_PATH.exists():
        lgbm_by_h, xgb_by_h = load_params_file(BEST_PARAMS_PATH)
    else:
        lgbm_by_h = {h: dict(TUNED_PARAMS) for h in VALID_HORIZONS}
        xgb_by_h = None

    if xgb_by_h is None:
        try:
            import xgboost as _xgb  # noqa: F401  # type: ignore[import-not-found]

            xgb_by_h = {h: dict(DEFAULT_XGB_PARAMS) for h in VALID_HORIZONS}
        except ImportError:
            xgb_by_h = None
    return lgbm_by_h, xgb_by_h


def run_backtest(
    validation_output_path: Path = VALIDATION_OUTPUT_PATH,
    backtest_output_path: Path = BACKTEST_OUTPUT_PATH,
) -> dict[str, Any]:
    """Run purged chronological backtest and write both backtest.json and validation.json."""
    settings = get_settings()
    df = load_training_dataframe()

    artifact = load_model(settings.model_path)
    lgbm_params_by_h, xgb_params_by_h = _resolve_params()
    xgb_probe = probe_xgboost_cuda() if xgb_params_by_h is not None else None
    xgb_use_cuda = bool(xgb_probe and xgb_probe.usable)

    case_map = {
        (str(w), wk): float(c) for w, wk, c in zip(df["ward_id"], df["week"], df["dengue_cases"], strict=True)
    }

    clim_df = df.rename(columns={"week": "date"}).copy()
    clim_df["year"] = [d.year for d in clim_df["date"].tolist()]
    clim_df["iso_week"] = [canonical_iso_week(d) for d in clim_df["date"].tolist()]

    # Deseasonalized lag-correlation evidence (dataset-wide peaks at lag 3 ~0.47)
    dataset_corrs, ward_corrs = compute_all_lag_correlations(df, max_lag=8)
    lag_evidence = {
        "max_lag": 8,
        "peak_lag_dataset": int(np.argmax(dataset_corrs)),
        "peak_corr_dataset": round(float(max(dataset_corrs)), 4),
        "dataset_correlations": [
            {"lag_weeks": k, "pearson_r": round(float(r), 4)} for k, r in enumerate(dataset_corrs)
        ],
        "wards_peaking_at_lag_3": sum(1 for vals in ward_corrs.values() if int(np.argmax(vals)) == 3),
        "total_wards": len(ward_corrs),
    }

    contract_metrics: list[dict[str, Any]] = []
    challenger_metrics: list[dict[str, Any]] = []
    coverage_rows: list[dict[str, Any]] = []

    holdout_y_all: list[float] = []
    holdout_pred_tiers_all: list[str] = []

    for period, train_max_year, test_years in FOLDS:
        df_tr_raw = df.loc[[wk.year <= train_max_year for wk in df["week"].tolist()]].copy()
        normals = fit_rain_normals(df_tr_raw, max_year=train_max_year)
        clim = ClimatologyBaseline.fit(clim_df, train_end_year=train_max_year)

        for h in VALID_HORIZONS:
            sup = build_supervised_frame(df, horizon=h, rain_normals=normals)
            tr, te, _ = purge_fold_split(sup, test_years=test_years)

            y_tr = tr["y"].to_numpy(dtype=np.float64)
            y_te = te["y"].to_numpy(dtype=np.float64)
            X_tr = tr[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
            X_te = te[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)

            if period == "holdout_2024_2025":
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
                model, _, _ = _fit_poisson_lgbm(X_tr, y_tr, lgbm_params_by_h[h], h, use_gpu=False, n_jobs=1)
                lgbm_pred = np.maximum(0.0, np.asarray(model.predict(X_te), dtype=np.float64))
                cal_year = train_max_year
                tr_sub = tr.loc[tr["target_year"] < cal_year]
                va_sub = tr.loc[tr["target_year"] == cal_year]
                if len(tr_sub) > 100 and len(va_sub) > 100:
                    m_cal, _, _ = _fit_poisson_lgbm(
                        tr_sub[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64),
                        tr_sub["y"].to_numpy(dtype=np.float64),
                        lgbm_params_by_h[h],
                        h,
                        use_gpu=False,
                        n_jobs=1,
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
            nw_params = {
                k: v
                for k, v in lgbm_params_by_h[h].items()
                if k not in ("device_type", "device", "gpu_use_dp", "monotone_constraints")
            }
            nw_model = lgb.LGBMRegressor(**nw_params, device_type="cpu")
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

            contract_metrics.append(_metric_row("lightgbm", h, period, y_te, lgbm_pred))
            contract_metrics.append(_metric_row("lightgbm_no_weather", h, period, y_te, nw_pred))
            contract_metrics.append(_metric_row("negbin_glm", h, period, y_te, glm_pred))
            contract_metrics.append(_metric_row("climatology", h, period, y_te, clim_pred))
            contract_metrics.append(_metric_row("seasonal_naive", h, period, y_te, sn_pred))
            contract_metrics.append(_metric_row("persistence", h, period, y_te, pers_pred))

            # 7) xgboost (CUDA challenger)
            if xgb_params_by_h is not None:
                xm, _, _ = _fit_poisson_xgboost(X_tr, y_tr, xgb_params_by_h[h], h, use_cuda=xgb_use_cuda)
                xgb_pred = np.maximum(0.0, np.asarray(xm.predict(X_te), dtype=np.float64))
                challenger_metrics.append(_metric_row("xgboost", h, period, y_te, xgb_pred))

            coverage_rows.append(
                {
                    "horizon": h,
                    "period": period,
                    "coverage_80": round(coverage_80(y_te, p10_te, p90_te), 4),
                }
            )

    # Summarize 2019–2022 LightGBM vs XGBoost challenger comparison
    cv_periods = {"2019", "2020", "2021", "2022"}
    lgbm_cv_mae = float(
        np.mean(
            [m["mae"] for m in contract_metrics if m["model"] == "lightgbm" and m["period"] in cv_periods]
        )
    )
    challenger_summary: dict[str, Any] = {
        "serving_engine": "lightgbm",
        "challenger_engine": "xgboost",
        "xgb_device": "cuda" if xgb_use_cuda else "cpu",
        "lgbm_cv_2019_2022_mean_mae": round(lgbm_cv_mae, 4),
    }
    if challenger_metrics:
        xgb_cv_mae = float(np.mean([m["mae"] for m in challenger_metrics if m["period"] in cv_periods]))
        delta_pct = ((lgbm_cv_mae - xgb_cv_mae) / max(lgbm_cv_mae, 1e-9)) * 100.0
        challenger_summary.update(
            {
                "xgb_cv_2019_2022_mean_mae": round(xgb_cv_mae, 4),
                "xgb_improvement_over_lgbm_pct": round(delta_pct, 2),
                "switch_threshold_pct": 3.0,
                "decision": "keep_lightgbm" if delta_pct < 3.0 else "review_for_adr_0009",
            }
        )

    tm = tier_metrics(holdout_y_all, holdout_pred_tiers_all)
    locked_sha: str | None = None
    if EVAL_CONFIG_PATH.exists():
        cfg = json.loads(EVAL_CONFIG_PATH.read_text(encoding="utf-8"))
        locked_sha = cfg.get("heldout_sha256")

    generated_at = datetime.now(UTC).isoformat(timespec="seconds")
    split_desc = (
        "Expanding-window chronological folds test 2019–2022 (purged); "
        "2023 calibrates NegBin conformal bands, endemic channel & cost-sensitive tier cut-offs; "
        "2024–2025 hold-out locked by SHA-256 and scored once."
    )
    confusion_block = {
        "labels": list(TIERS),
        "matrix": tm["matrix"],
        "within_one_tier": tm["within_one_tier"],
        "critical_recall": tm["critical_recall"],
        "macro_f1": tm["macro_f1"],
    }

    # Contract-compliant payload for GET /api/v1/validation (6 contract models in `metrics`)
    validation_payload: dict[str, Any] = {
        "model_version": artifact.version,
        "generated_at": generated_at,
        "split": split_desc,
        "metrics": contract_metrics,
        "challenger_metrics": challenger_metrics,
        "challenger_summary": challenger_summary,
        "coverage": coverage_rows,
        "confusion": confusion_block,
        "lag_correlation_evidence": lag_evidence,
        "holdout_locked_sha256": locked_sha,
    }

    # Full backtest artifact with all 7 models (including `xgboost`) inside `metrics`
    backtest_payload: dict[str, Any] = {
        "model_version": artifact.version,
        "generated_at": generated_at,
        "split": split_desc,
        "metrics": [*contract_metrics, *challenger_metrics],
        "challenger_summary": challenger_summary,
        "coverage": coverage_rows,
        "confusion": confusion_block,
        "lag_correlation_evidence": lag_evidence,
        "holdout_locked_sha256": locked_sha,
    }

    validation_output_path.parent.mkdir(parents=True, exist_ok=True)
    backtest_output_path.parent.mkdir(parents=True, exist_ok=True)
    validation_output_path.write_text(json.dumps(validation_payload, indent=2) + "\n", encoding="utf-8")
    backtest_output_path.write_text(json.dumps(backtest_payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"Backtest saved to {backtest_output_path.name} ({len(backtest_payload['metrics'])} rows) "
        f"and {validation_output_path.name} ({len(contract_metrics)} contract rows + "
        f"{len(challenger_metrics)} challenger rows): within_one_tier={tm['within_one_tier']}, "
        f"critical_recall={tm['critical_recall']}, macro_f1={tm['macro_f1']}"
    )
    return backtest_payload


def main() -> int:
    run_backtest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
