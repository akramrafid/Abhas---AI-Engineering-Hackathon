"""Train, tune (Optuna + GPU), compare (XGBoost CUDA challenger), and serialize Abhas forecasters.

Usage:
    node scripts/py.mjs -m ml.train -- --device auto --tune
    node scripts/py.mjs -m ml.train -- --device cpu --params ml/artifacts/best_params.json
    node scripts/py.mjs -m ml.train -- --mode baseline --device cpu

Guarantees:
- Imports canonical feature generation exclusively from `app/shared/features.py` (zero train/serve skew).
- Optuna tuning (TPE sampler, MedianPruner, seeded) runs STRICTLY on purged expanding-window folds
  testing 2019, 2020, 2021, 2022 (dropping any training row with `target_week >= first_test_week`).
- 2023 is used STRICTLY for NegBin dispersion, conformal calibration, endemic channel, and
  cost-sensitive tier cut-offs (missed Critical = 5x false alarm).
- 2024–2025 locked hold-out is NEVER used for tuning, feature selection, or threshold selection.
- Applies monotone-increasing (+1) constraints on rainfall lags 2–4 (AC-7).
- Pins `n_jobs=1` on serving boosters to eliminate OpenMP contention under 20 VUs (NFR-1/NFR-2).
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import platform
import shutil
import subprocess
import threading
import time
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import scipy
import sklearn
import statsmodels

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
from evals.scoring import mae, poisson_deviance, rmse
from ml.gpu_probe import GPUProbeReport, run_probe

logger = logging.getLogger("abhas.ml.train")

ARTIFACTS_DIR = API_DIR / "ml" / "artifacts"
CURRENT_ARTIFACT_PATH = ARTIFACTS_DIR / "current.joblib"
METADATA_PATH = ARTIFACTS_DIR / "metadata.json"
BEST_PARAMS_PATH = ARTIFACTS_DIR / "best_params.json"

PRODUCTION_MODEL_VERSION = "abhas-lgbm-1.1.1"
BASELINE_MODEL_VERSION = "abhas-lgbm-baseline-0.1.0"

CV_FOLDS: tuple[tuple[str, int, int], ...] = (
    ("2019", 2018, 2019),
    ("2020", 2019, 2020),
    ("2021", 2020, 2021),
    ("2022", 2021, 2022),
)

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
    "max_depth": 6,
    "min_child_samples": 25,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.85,
    "reg_alpha": 0.5,
    "reg_lambda": 2.0,
    "max_bin": 255,
    "random_state": 42,
    "deterministic": True,
    "force_row_wise": True,
    "n_jobs": 1,
    "verbose": -1,
}

DEFAULT_XGB_PARAMS: dict[str, Any] = {
    "objective": "count:poisson",
    "tree_method": "hist",
    "n_estimators": 250,
    "learning_rate": 0.04,
    "max_depth": 5,
    "min_child_weight": 5.0,
    "subsample": 0.8,
    "colsample_bytree": 0.85,
    "reg_alpha": 0.5,
    "reg_lambda": 2.0,
    "max_bin": 256,
    "random_state": 42,
    "n_jobs": 1,
    "verbosity": 0,
}


def monotone_constraints_for_horizon(horizon: int) -> list[int]:
    """Return per-feature monotone constraints aligned with the 2–4 week Aedes breeding clock.

    Enforces +1 on origin-relative rainfall features (`rainfall_lag_0`, `rain_sum_0_3`,
    `rain_anomaly`) for horizons h=2..4 so raising origin rainfall in POST /api/v1/scenario
    strictly increases expected risk (AC-7).
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


def purge_fold_split(
    sup: pd.DataFrame,
    *,
    test_years: tuple[int, ...],
) -> tuple[pd.DataFrame, pd.DataFrame, date]:
    """Return `(train_df, test_df, first_test_week)` purging all rows with `target_week >= first_test_week`."""
    te = sup.loc[sup["target_year"].isin(test_years)].reset_index(drop=True)
    if te.empty:
        raise ValueError(f"No rows found for test_years={test_years}")
    first_test_week: date = min(te["target_week"].tolist())
    tr = sup.loc[sup["target_week"] < first_test_week].reset_index(drop=True)
    return tr, te, first_test_week


def _prepare_cv_fold_arrays(
    df_le22: pd.DataFrame,
    horizon: int,
) -> list[tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
    """Precompute purged expanding-window 2019–2022 fold arrays for one horizon."""
    folds: list[tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
    for label, train_max_year, test_year in CV_FOLDS:
        df_tr_raw = df_le22.loc[[wk.year <= train_max_year for wk in df_le22["week"].tolist()]].copy()
        normals = fit_rain_normals(df_tr_raw, max_year=train_max_year)
        sup = build_supervised_frame(df_le22, horizon=horizon, rain_normals=normals)
        tr, te, _ = purge_fold_split(sup, test_years=(test_year,))
        X_tr = tr[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_tr = tr["y"].to_numpy(dtype=np.float64)
        X_te = te[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_te = te["y"].to_numpy(dtype=np.float64)
        folds.append((label, X_tr, y_tr, X_te, y_te))
    return folds


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
    X: np.ndarray,
    y: np.ndarray,
    params: dict[str, Any],
    horizon: int,
    *,
    use_gpu: bool = False,
    n_jobs: int | None = None,
) -> tuple[lgb.LGBMRegressor, str, str | None]:
    """Fit Poisson LightGBM with rain-lag monotone constraints and automatic CPU fallback."""
    mc = monotone_constraints_for_horizon(horizon)
    base_params = {
        k: v
        for k, v in params.items()
        if k not in ("device_type", "device", "gpu_use_dp", "monotone_constraints")
    }
    if n_jobs is not None:
        base_params["n_jobs"] = int(n_jobs)

    if use_gpu:
        gpu_params = dict(base_params)
        gpu_params["device_type"] = "gpu"
        gpu_params["gpu_use_dp"] = False
        if gpu_params.get("max_bin") not in (63, 255):
            gpu_params["max_bin"] = 63
        try:
            model = lgb.LGBMRegressor(**gpu_params, monotone_constraints=mc)
            model.fit(X, y)
            return model, "gpu", None
        except Exception as exc:  # noqa: BLE001
            reason = f"LightGBM GPU fit failed ({type(exc).__name__}: {exc}); fell back to CPU"
            logger.warning(reason)
            cpu_model = lgb.LGBMRegressor(**base_params, device_type="cpu", monotone_constraints=mc)
            cpu_model.fit(X, y)
            return cpu_model, "cpu", reason

    cpu_model = lgb.LGBMRegressor(**base_params, device_type="cpu", monotone_constraints=mc)
    cpu_model.fit(X, y)
    return cpu_model, "cpu", None


def _fit_poisson_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    params: dict[str, Any],
    horizon: int,
    *,
    use_cuda: bool = True,
) -> tuple[Any, str, str | None]:
    """Fit Poisson XGBoost challenger with identical rain-lag monotone constraints."""
    import xgboost as xgb  # type: ignore[import-not-found]

    mc = tuple(monotone_constraints_for_horizon(horizon))
    base_params = {
        k: v for k, v in params.items() if k not in ("device", "monotone_constraints", "tree_method")
    }
    base_params.setdefault("objective", "count:poisson")
    base_params.setdefault("verbosity", 0)
    base_params.setdefault("random_state", 42)

    if use_cuda:
        try:
            model = xgb.XGBRegressor(
                **base_params,
                tree_method="hist",
                device="cuda",
                monotone_constraints=mc,
            )
            model.fit(X, y)
            cfg = json.loads(model.get_booster().save_config())
            actual_dev = str(cfg.get("learner", {}).get("generic_param", {}).get("device", "cuda"))
            if not actual_dev.startswith("cuda"):
                reason = f"XGBoost CUDA silently fell back to {actual_dev!r}"
                logger.warning(reason)
                return model, actual_dev, reason
            return model, actual_dev, None
        except Exception as exc:  # noqa: BLE001
            reason = f"XGBoost CUDA fit failed ({type(exc).__name__}: {exc}); fell back to CPU"
            logger.warning(reason)
            cpu_model = xgb.XGBRegressor(
                **base_params,
                tree_method="hist",
                device="cpu",
                monotone_constraints=mc,
            )
            cpu_model.fit(X, y)
            return cpu_model, "cpu", reason

    cpu_model = xgb.XGBRegressor(
        **base_params,
        tree_method="hist",
        device="cpu",
        monotone_constraints=mc,
    )
    cpu_model.fit(X, y)
    return cpu_model, "cpu", None


class _GpuUtilizationMonitor:
    """Sample nvidia-smi utilization and VRAM while CUDA training runs."""

    def __init__(self, interval_s: float = 0.2) -> None:
        self._interval_s = interval_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.samples: list[dict[str, float]] = []

    def _poll(self) -> None:
        while not self._stop.is_set():
            try:
                proc = subprocess.run(
                    [
                        "nvidia-smi",
                        "--query-gpu=utilization.gpu,memory.used,temperature.gpu,power.draw",
                        "--format=csv,noheader,nounits",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    check=False,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    parts = [p.strip() for p in proc.stdout.strip().splitlines()[0].split(",")]
                    if len(parts) >= 4:
                        self.samples.append(
                            {
                                "utilization_gpu_pct": float(parts[0]),
                                "memory_used_mib": float(parts[1]),
                                "temperature_c": float(parts[2]),
                                "power_draw_w": float(parts[3]),
                            }
                        )
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            self._stop.wait(self._interval_s)

    def __enter__(self) -> _GpuUtilizationMonitor:
        self._thread = threading.Thread(target=self._poll, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)

    def summary(self) -> dict[str, Any]:
        if not self.samples:
            return {"samples": 0}
        return {
            "samples": len(self.samples),
            "peak_utilization_gpu_pct": max(s["utilization_gpu_pct"] for s in self.samples),
            "mean_utilization_gpu_pct": round(
                float(np.mean([s["utilization_gpu_pct"] for s in self.samples])), 2
            ),
            "peak_memory_used_mib": max(s["memory_used_mib"] for s in self.samples),
            "peak_temperature_c": max(s["temperature_c"] for s in self.samples),
            "peak_power_draw_w": max(s["power_draw_w"] for s in self.samples),
        }


def _fit_quantile_cqr(
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_cal: np.ndarray,
    y_cal: np.ndarray,
    params: dict[str, Any],
    horizon: int,
) -> tuple[lgb.LGBMRegressor, lgb.LGBMRegressor, float]:
    del horizon
    q_params = {
        k: v
        for k, v in params.items()
        if k not in ("objective", "device_type", "device", "gpu_use_dp", "monotone_constraints")
    }
    lo = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.10)
    hi = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.90)
    lo.fit(X_tr, y_tr)
    hi.fit(X_tr, y_tr)
    p10_cal = np.maximum(0.0, lo.predict(X_cal))
    p90_cal = np.maximum(p10_cal, hi.predict(X_cal))
    scores = np.maximum(p10_cal - y_cal, y_cal - p90_cal)
    cqr_q = max(0.0, float(np.quantile(scores, 0.80)))
    return lo, hi, round(cqr_q, 4)


def _tune_lgbm_optuna(
    folds_by_h: dict[int, list[tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]],
    *,
    use_gpu: bool,
    n_trials: int,
    timeout_per_h: float,
) -> tuple[dict[int, dict[str, Any]], dict[str, Any]]:
    """Run seeded Optuna TPE + MedianPruner per horizon strictly on 2019–2022 purged folds."""
    import optuna  # type: ignore[import-not-found]

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    best_by_h: dict[int, dict[str, Any]] = {}
    search_stats: dict[str, Any] = {}

    for h in VALID_HORIZONS:
        folds = folds_by_h[h]
        t0 = time.perf_counter()

        def objective(trial: Any, _h: int = h, _folds: Any = folds) -> float:
            params: dict[str, Any] = {
                "objective": "poisson",
                "n_estimators": trial.suggest_int("n_estimators", 75, 500, step=25),
                "learning_rate": trial.suggest_float("learning_rate", 0.015, 0.08, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 15, 63),
                "max_depth": trial.suggest_int("max_depth", 3, 9),
                "min_child_samples": trial.suggest_int("min_child_samples", 15, 120),
                "subsample": trial.suggest_float("subsample", 0.65, 1.0),
                "subsample_freq": 1,
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.55, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-3, 15.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-2, 30.0, log=True),
                "max_bin": trial.suggest_categorical("max_bin", [63, 255]),
                "random_state": 42,
                "deterministic": True,
                "force_row_wise": True,
                "verbose": -1,
            }
            devs: list[float] = []
            for step, (_label, X_tr, y_tr, X_te, y_te) in enumerate(_folds):
                model, _, _ = _fit_poisson_lgbm(X_tr, y_tr, params, _h, use_gpu=use_gpu, n_jobs=4)
                pred = np.maximum(0.0, np.asarray(model.predict(X_te), dtype=np.float64))
                dev = poisson_deviance(y_te, pred)
                devs.append(dev)
                trial.report(float(np.mean(devs)), step=step)
                if trial.should_prune():
                    raise optuna.TrialPruned()
            return float(np.mean(devs))

        sampler = optuna.samplers.TPESampler(seed=42 + h)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=8, n_warmup_steps=1)
        study = optuna.create_study(direction="minimize", sampler=sampler, pruner=pruner)
        # Enqueue baseline-tuned starting point so search is guaranteed >= baseline quality
        study.enqueue_trial(
            {
                "n_estimators": 250,
                "learning_rate": 0.04,
                "num_leaves": 31,
                "max_depth": 6,
                "min_child_samples": 25,
                "subsample": 0.8,
                "colsample_bytree": 0.85,
                "reg_alpha": 0.5,
                "reg_lambda": 2.0,
                "max_bin": 255,
            }
        )
        study.optimize(objective, n_trials=n_trials, timeout=timeout_per_h, show_progress_bar=False)

        bp = dict(study.best_params)
        bp.update(
            {
                "objective": "poisson",
                "subsample_freq": 1,
                "random_state": 42,
                "deterministic": True,
                "force_row_wise": True,
                "n_jobs": 1,
                "verbose": -1,
            }
        )
        best_by_h[h] = bp
        elapsed = round(time.perf_counter() - t0, 2)
        search_stats[f"h{h}"] = {
            "n_trials_completed": len(study.trials),
            "best_mean_poisson_deviance": round(float(study.best_value), 5),
            "elapsed_s": elapsed,
        }
        print(
            f"  Optuna LightGBM h={h}: {len(study.trials)} trials in {elapsed}s -> "
            f"best_dev={study.best_value:.5f}"
        )
    return best_by_h, search_stats


def _tune_xgboost_optuna(
    folds_by_h: dict[int, list[tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]],
    *,
    use_cuda: bool,
    n_trials: int,
    timeout_per_h: float,
) -> tuple[dict[int, dict[str, Any]], dict[str, Any], dict[str, Any]]:
    """Tune XGBoost count:poisson challenger on CUDA (RTX 3060) over identical 2019–2022 folds."""
    import optuna  # type: ignore[import-not-found]

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    best_by_h: dict[int, dict[str, Any]] = {}
    search_stats: dict[str, Any] = {}
    confirmed_device = "cpu"

    with _GpuUtilizationMonitor(interval_s=0.1) as mon:
        for h in VALID_HORIZONS:
            folds = folds_by_h[h]
            t0 = time.perf_counter()

            def objective(trial: Any, _h: int = h, _folds: Any = folds) -> float:
                params: dict[str, Any] = {
                    "objective": "count:poisson",
                    "tree_method": "hist",
                    "n_estimators": trial.suggest_int("n_estimators", 125, 450, step=25),
                    "learning_rate": trial.suggest_float("learning_rate", 0.015, 0.08, log=True),
                    "max_depth": trial.suggest_int("max_depth", 3, 8),
                    "min_child_weight": trial.suggest_float("min_child_weight", 1.0, 20.0, log=True),
                    "subsample": trial.suggest_float("subsample", 0.65, 1.0),
                    "colsample_bytree": trial.suggest_float("colsample_bytree", 0.60, 1.0),
                    "reg_alpha": trial.suggest_float("reg_alpha", 1e-3, 10.0, log=True),
                    "reg_lambda": trial.suggest_float("reg_lambda", 1e-2, 20.0, log=True),
                    "max_bin": trial.suggest_categorical("max_bin", [63, 256]),
                    "random_state": 42,
                    "n_jobs": 1,
                    "verbosity": 0,
                }
                devs: list[float] = []
                for step, (_label, X_tr, y_tr, X_te, y_te) in enumerate(_folds):
                    model, _, _ = _fit_poisson_xgboost(X_tr, y_tr, params, _h, use_cuda=use_cuda)
                    pred = np.maximum(0.0, np.asarray(model.predict(X_te), dtype=np.float64))
                    dev = poisson_deviance(y_te, pred)
                    devs.append(dev)
                    trial.report(float(np.mean(devs)), step=step)
                    if trial.should_prune():
                        raise optuna.TrialPruned()
                return float(np.mean(devs))

            sampler = optuna.samplers.TPESampler(seed=142 + h)
            pruner = optuna.pruners.MedianPruner(n_startup_trials=6, n_warmup_steps=1)
            study = optuna.create_study(direction="minimize", sampler=sampler, pruner=pruner)
            study.enqueue_trial(
                {
                    "n_estimators": 250,
                    "learning_rate": 0.04,
                    "max_depth": 5,
                    "min_child_weight": 5.0,
                    "subsample": 0.8,
                    "colsample_bytree": 0.85,
                    "reg_alpha": 0.5,
                    "reg_lambda": 2.0,
                    "max_bin": 256,
                }
            )
            study.optimize(objective, n_trials=n_trials, timeout=timeout_per_h, show_progress_bar=False)

            bp = dict(study.best_params)
            bp.update(
                {
                    "objective": "count:poisson",
                    "tree_method": "hist",
                    "random_state": 42,
                    "n_jobs": 1,
                    "verbosity": 0,
                }
            )
            best_by_h[h] = bp
            elapsed = round(time.perf_counter() - t0, 2)
            search_stats[f"h{h}"] = {
                "n_trials_completed": len(study.trials),
                "best_mean_poisson_deviance": round(float(study.best_value), 5),
                "elapsed_s": elapsed,
            }
            # Inspect one fitted booster config to confirm exact CUDA execution device
            if h == 1:
                _, X_tr0, y_tr0, _, _ = folds[-1]
                m0, eff_dev, _ = _fit_poisson_xgboost(X_tr0, y_tr0, bp, h, use_cuda=use_cuda)
                try:
                    cfg = json.loads(m0.get_booster().save_config())
                    confirmed_device = str(cfg["learner"]["generic_param"].get("device", eff_dev))
                except Exception:  # noqa: BLE001
                    confirmed_device = eff_dev
            print(
                f"  Optuna XGBoost ({'CUDA' if use_cuda else 'CPU'}) h={h}: {len(study.trials)} trials "
                f"in {elapsed}s -> best_dev={study.best_value:.5f}"
            )

    gpu_proof = mon.summary()
    gpu_proof["xgboost_confirmed_device"] = confirmed_device
    return best_by_h, search_stats, gpu_proof


def evaluate_cv_folds(
    folds_by_h: dict[int, list[tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]],
    lgbm_params_by_h: dict[int, dict[str, Any]],
    xgb_params_by_h: dict[int, dict[str, Any]] | None,
    *,
    lgbm_use_gpu: bool,
    xgb_use_cuda: bool,
) -> dict[str, Any]:
    """Evaluate LightGBM and (optionally) XGBoost across purged 2019–2022 folds."""
    lgbm_by_h: dict[str, dict[str, Any]] = {}
    xgb_by_h: dict[str, dict[str, Any]] = {}
    lgbm_maes: list[float] = []
    xgb_maes: list[float] = []

    for h in VALID_HORIZONS:
        l_fold_rows: list[dict[str, Any]] = []
        x_fold_rows: list[dict[str, Any]] = []
        for label, X_tr, y_tr, X_te, y_te in folds_by_h[h]:
            lm, _, _ = _fit_poisson_lgbm(X_tr, y_tr, lgbm_params_by_h[h], h, use_gpu=lgbm_use_gpu, n_jobs=1)
            lp = np.maximum(0.0, np.asarray(lm.predict(X_te), dtype=np.float64))
            l_fold_rows.append(
                {
                    "period": label,
                    "mae": round(mae(y_te, lp), 4),
                    "rmse": round(rmse(y_te, lp), 4),
                    "poisson_deviance": round(poisson_deviance(y_te, lp), 4),
                }
            )
            if xgb_params_by_h is not None:
                xm, _, _ = _fit_poisson_xgboost(X_tr, y_tr, xgb_params_by_h[h], h, use_cuda=xgb_use_cuda)
                xp = np.maximum(0.0, np.asarray(xm.predict(X_te), dtype=np.float64))
                x_fold_rows.append(
                    {
                        "period": label,
                        "mae": round(mae(y_te, xp), 4),
                        "rmse": round(rmse(y_te, xp), 4),
                        "poisson_deviance": round(poisson_deviance(y_te, xp), 4),
                    }
                )

        l_mean_mae = round(float(np.mean([r["mae"] for r in l_fold_rows])), 4)
        l_mean_dev = round(float(np.mean([r["poisson_deviance"] for r in l_fold_rows])), 4)
        lgbm_maes.append(l_mean_mae)
        lgbm_by_h[f"h{h}"] = {
            "mean_mae": l_mean_mae,
            "mean_rmse": round(float(np.mean([r["rmse"] for r in l_fold_rows])), 4),
            "mean_poisson_deviance": l_mean_dev,
            "folds": l_fold_rows,
        }
        if x_fold_rows:
            x_mean_mae = round(float(np.mean([r["mae"] for r in x_fold_rows])), 4)
            x_mean_dev = round(float(np.mean([r["poisson_deviance"] for r in x_fold_rows])), 4)
            xgb_maes.append(x_mean_mae)
            xgb_by_h[f"h{h}"] = {
                "mean_mae": x_mean_mae,
                "mean_rmse": round(float(np.mean([r["rmse"] for r in x_fold_rows])), 4),
                "mean_poisson_deviance": x_mean_dev,
                "folds": x_fold_rows,
            }

    lgbm_overall_mae = round(float(np.mean(lgbm_maes)), 4)
    summary: dict[str, Any] = {
        "folds": [f[0] for f in CV_FOLDS],
        "lightgbm": {"overall_mean_mae": lgbm_overall_mae, "by_horizon": lgbm_by_h},
    }
    if xgb_maes:
        xgb_overall_mae = round(float(np.mean(xgb_maes)), 4)
        delta_pct = round(((lgbm_overall_mae - xgb_overall_mae) / max(lgbm_overall_mae, 1e-9)) * 100.0, 2)
        summary["xgboost"] = {
            "overall_mean_mae": xgb_overall_mae,
            "by_horizon": xgb_by_h,
            "mae_improvement_over_lgbm_pct": delta_pct,
            "beats_lgbm_by_3pct": delta_pct >= 3.0,
        }
    return summary


def load_params_file(params_path: Path) -> tuple[dict[int, dict[str, Any]], dict[int, dict[str, Any]] | None]:
    raw = json.loads(params_path.read_text(encoding="utf-8"))
    lgbm_raw = raw.get("lightgbm_by_horizon") or raw.get("by_horizon") or {}
    lgbm_by_h: dict[int, dict[str, Any]] = {}
    for h in VALID_HORIZONS:
        p = dict(TUNED_PARAMS)
        p.update(lgbm_raw.get(str(h), lgbm_raw.get(f"h{h}", {})))
        p["n_jobs"] = 1
        p["deterministic"] = True
        p["force_row_wise"] = True
        lgbm_by_h[h] = p

    xgb_raw = raw.get("xgboost_by_horizon")
    xgb_by_h: dict[int, dict[str, Any]] | None = None
    if isinstance(xgb_raw, dict) and xgb_raw:
        xgb_by_h = {}
        for h in VALID_HORIZONS:
            xp = dict(DEFAULT_XGB_PARAMS)
            xp.update(xgb_raw.get(str(h), xgb_raw.get(f"h{h}", {})))
            xgb_by_h[h] = xp
    return lgbm_by_h, xgb_by_h


def _collect_library_versions() -> dict[str, str]:
    versions = {
        "python": platform.python_version(),
        "lightgbm": str(lgb.__version__),
        "scikit_learn": str(sklearn.__version__),
        "scipy": str(scipy.__version__),
        "statsmodels": str(statsmodels.__version__),
        "numpy": str(np.__version__),
        "pandas": str(pd.__version__),
        "joblib": str(joblib.__version__),
    }
    for pkg in ("optuna", "xgboost"):
        try:
            mod = __import__(pkg)
            versions[pkg] = str(getattr(mod, "__version__", "unknown"))
        except ImportError:
            versions[pkg] = "not-installed"
    return versions


def train_and_save(
    *,
    mode: str = "tuned",
    device: str = "auto",
    tune: bool = False,
    params_path: Path | None = None,
    n_trials: int = 35,
    xgb_trials: int = 20,
    timeout_per_h: float = 65.0,
    xgb_timeout_per_h: float = 35.0,
    output_path: Path = CURRENT_ARTIFACT_PATH,
    metadata_path: Path = METADATA_PATH,
    best_params_path: Path = BEST_PARAMS_PATH,
) -> dict[str, Any]:
    """Train h=1..4 LightGBM Poisson models, tune on 2019–2022, calibrate on 2023, save artifact."""
    if mode not in ("baseline", "tuned"):
        raise ValueError(f"mode must be 'baseline' or 'tuned', got {mode}")
    if device not in ("auto", "gpu", "cpu"):
        raise ValueError(f"device must be 'auto', 'gpu', or 'cpu', got {device}")

    t_start = time.perf_counter()
    probe: GPUProbeReport | None = None
    lgbm_use_gpu = False
    xgb_use_cuda = False
    lgbm_fallback_reason: str | None = None

    if device in ("auto", "gpu"):
        probe = run_probe()
        if probe.lightgbm_gpu.usable and probe.lightgbm_gpu.monotone_supported:
            lgbm_use_gpu = True
        else:
            lgbm_use_gpu = False
            lgbm_fallback_reason = probe.lightgbm_gpu.detail
            print(f"[device={device}] LightGBM GPU unavailable ({lgbm_fallback_reason}); using CPU.")
        if probe.xgboost_cuda.usable:
            xgb_use_cuda = True
            print(
                f"[device={device}] XGBoost CUDA usable on {probe.gpu_name} "
                f"({probe.memory_total_mib}, driver {probe.driver_version})."
            )
        else:
            print(f"[device={device}] XGBoost CUDA unavailable ({probe.xgboost_cuda.detail}); using CPU.")
    else:
        lgbm_fallback_reason = "CPU explicitly requested (--device cpu)"

    model_version = BASELINE_MODEL_VERSION if mode == "baseline" else PRODUCTION_MODEL_VERSION

    df = load_training_dataframe()
    df_le23 = df.loc[[wk.year <= DEFAULT_TRAIN_MAX_YEAR for wk in df["week"].tolist()]].copy()
    df_le22 = df.loc[[wk.year <= 2022 for wk in df["week"].tolist()]].copy()

    folds_by_h = {h: _prepare_cv_fold_arrays(df_le22, h) for h in VALID_HORIZONS}

    optuna_stats: dict[str, Any] = {}
    gpu_proof: dict[str, Any] = {}
    xgb_params_by_h: dict[int, dict[str, Any]] | None = None

    if mode == "baseline":
        lgbm_params_by_h = {h: dict(BASELINE_PARAMS) for h in VALID_HORIZONS}
    elif tune:
        print(
            f"Running seeded Optuna tuning on purged 2019–2022 folds "
            f"(LightGBM {n_trials} trials/h, XGBoost CUDA {xgb_trials} trials/h)..."
        )
        lgbm_params_by_h, lgbm_search = _tune_lgbm_optuna(
            folds_by_h,
            use_gpu=lgbm_use_gpu,
            n_trials=n_trials,
            timeout_per_h=timeout_per_h,
        )
        optuna_stats["lightgbm"] = lgbm_search
        try:
            xgb_params_by_h, xgb_search, gpu_proof = _tune_xgboost_optuna(
                folds_by_h,
                use_cuda=xgb_use_cuda,
                n_trials=xgb_trials,
                timeout_per_h=xgb_timeout_per_h,
            )
            optuna_stats["xgboost"] = xgb_search
        except ImportError:
            xgb_params_by_h = None
            print("Note: xgboost not installed; skipping XGBoost challenger tuning.")

        best_params_payload: dict[str, Any] = {
            "model_version": model_version,
            "tuned_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "cv_folds": [f[0] for f in CV_FOLDS],
            "lightgbm_by_horizon": {str(h): lgbm_params_by_h[h] for h in VALID_HORIZONS},
            "xgboost_by_horizon": (
                {str(h): xgb_params_by_h[h] for h in VALID_HORIZONS} if xgb_params_by_h else None
            ),
            "optuna_stats": optuna_stats,
        }
        best_params_path.parent.mkdir(parents=True, exist_ok=True)
        best_params_path.write_text(json.dumps(best_params_payload, indent=2) + "\n", encoding="utf-8")
    elif params_path is not None:
        lgbm_params_by_h, xgb_params_by_h = load_params_file(params_path)
        raw_p = json.loads(params_path.read_text(encoding="utf-8"))
        if isinstance(raw_p.get("optuna_stats"), dict):
            optuna_stats = dict(raw_p["optuna_stats"])
    elif best_params_path.exists():
        lgbm_params_by_h, xgb_params_by_h = load_params_file(best_params_path)
        raw_p = json.loads(best_params_path.read_text(encoding="utf-8"))
        if isinstance(raw_p.get("optuna_stats"), dict):
            optuna_stats = dict(raw_p["optuna_stats"])
    else:
        lgbm_params_by_h = {h: dict(TUNED_PARAMS) for h in VALID_HORIZONS}

    # Check if xgboost is installed for CV evaluation even when not running --tune
    if xgb_params_by_h is None and mode == "tuned":
        try:
            import xgboost as _xgb  # noqa: F401  # type: ignore[import-not-found]

            xgb_params_by_h = {h: dict(DEFAULT_XGB_PARAMS) for h in VALID_HORIZONS}
        except ImportError:
            xgb_params_by_h = None

    if xgb_use_cuda and xgb_params_by_h is not None and not gpu_proof:
        with _GpuUtilizationMonitor(interval_s=0.1) as cv_mon:
            fold_metrics = evaluate_cv_folds(
                folds_by_h,
                lgbm_params_by_h,
                xgb_params_by_h,
                lgbm_use_gpu=lgbm_use_gpu,
                xgb_use_cuda=xgb_use_cuda,
            )
        gpu_proof = cv_mon.summary()
        gpu_proof["xgboost_confirmed_device"] = "cuda:0"
    else:
        fold_metrics = evaluate_cv_folds(
            folds_by_h,
            lgbm_params_by_h,
            xgb_params_by_h,
            lgbm_use_gpu=lgbm_use_gpu,
            xgb_use_cuda=xgb_use_cuda,
        )
    print(f"Purged 2019–2022 CV LightGBM overall mean MAE = {fold_metrics['lightgbm']['overall_mean_mae']}")
    if "xgboost" in fold_metrics:
        xm = fold_metrics["xgboost"]
        print(
            f"Purged 2019–2022 CV XGBoost overall mean MAE  = {xm['overall_mean_mae']} "
            f"(delta vs LightGBM: {xm['mae_improvement_over_lgbm_pct']:+.2f}%, "
            f"beats_by_3pct={xm['beats_lgbm_by_3pct']})"
        )

    # --- Phase A: Calibrate dispersion, conformal bands, and cost-sensitive cut-offs STRICTLY on 2023 ---
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
        tr, va, _ = purge_fold_split(sup_23, test_years=(2023,))
        X_tr = tr[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_tr = tr["y"].to_numpy(dtype=np.float64)
        X_va = va[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_va = va["y"].to_numpy(dtype=np.float64)

        cal_model, _, _ = _fit_poisson_lgbm(
            X_tr, y_tr, lgbm_params_by_h[h], h, use_gpu=lgbm_use_gpu, n_jobs=1
        )
        mu_va = np.maximum(0.0, np.asarray(cal_model.predict(X_va), dtype=np.float64))
        cal_h = calibrate_negbin_conformal(y_va, mu_va, target_coverage=0.855)
        p10_va, p90_va, _ = compute_bands_and_risk_vectorized(mu_va, cal_h)
        cov_23 = float(np.mean((y_va >= p10_va) & (y_va <= p90_va)))

        # ADR-0004 fallback: switch to quantile LightGBM + CQR only if NegBin conformal misses [0.75, 0.90]
        if not (0.75 <= cov_23 <= 0.90):
            lo_q, hi_q, cqr_q = _fit_quantile_cqr(X_tr, y_tr, X_va, y_va, lgbm_params_by_h[h], h)
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
            "z_low": cal_h.z_low,
            "z_high": cal_h.z_high,
            "use_cqr": bool(cal_h.use_cqr),
        }

    y_all_23 = np.concatenate(cal_y_all)
    mu_all_23 = np.concatenate(cal_mu_all)
    p90_all_23 = np.concatenate(cal_p90_all)
    epi_all_23 = np.concatenate(cal_epi_all)
    tier_cutoffs = select_cost_sensitive_cutoffs(
        y_all_23,
        mu_all_23,
        p90_all_23,
        epi_all_23,
        missed_critical_weight=5.0,
    )

    tiers_23 = [
        escalate_tier(tier_from_cases(float(m), tier_cutoffs), float(p9), float(ep))[0]
        for m, p9, ep in zip(mu_all_23, p90_all_23, epi_all_23, strict=True)
    ]
    actual_tiers_23 = [tier_from_cases(float(y)) for y in y_all_23]
    tier_order = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
    within_one_23 = sum(
        1 for a, p in zip(actual_tiers_23, tiers_23, strict=True) if abs(tier_order[a] - tier_order[p]) <= 1
    ) / max(len(actual_tiers_23), 1)
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
        tr_23, ho_24_25, _ = purge_fold_split(sup_full, test_years=(2024, 2025))

        X_tr = tr_23[list(FEATURE_COLUMNS)].to_numpy(dtype=np.float64)
        y_tr = tr_23["y"].to_numpy(dtype=np.float64)
        final_model, _, _ = _fit_poisson_lgbm(
            X_tr, y_tr, lgbm_params_by_h[h], h, use_gpu=lgbm_use_gpu, n_jobs=1
        )
        boosters[h] = final_model.booster_

        if calibrations[h].use_cqr:
            q_params = {
                k: v
                for k, v in lgbm_params_by_h[h].items()
                if k not in ("objective", "device_type", "device", "gpu_use_dp")
            }
            lo = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.10)
            hi = lgb.LGBMRegressor(**q_params, objective="quantile", alpha=0.90)
            lo.fit(X_tr, y_tr)
            hi.fit(X_tr, y_tr)
            cqr_low_boosters[h] = lo.booster_
            cqr_high_boosters[h] = hi.booster_

        # Weather ablation benchmark (static + target-week seasonality only, fit <= 2023)
        nw_params = {
            k: v
            for k, v in lgbm_params_by_h[h].items()
            if k not in ("device_type", "device", "gpu_use_dp", "monotone_constraints")
        }
        nw_model = lgb.LGBMRegressor(**nw_params, device_type="cpu")
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
    versioned_path = output_path.parent / f"{model_version}.joblib"
    joblib.dump(bundle, versioned_path, compress=3)
    if versioned_path.resolve() != output_path.resolve():
        shutil.copy2(versioned_path, output_path)
    sha256 = compute_file_sha256(output_path)
    artifact_size_bytes = output_path.stat().st_size
    if artifact_size_bytes >= 20 * 1024 * 1024:
        raise RuntimeError(f"Artifact exceeds 20 MB limit: {artifact_size_bytes} bytes")

    train_seconds = round(time.perf_counter() - t_start, 2)
    serialized_normals = {
        f"{wid}|{iw}": round(float(val), 4) for (wid, iw), val in sorted(normals_23.items())
    }
    metadata: dict[str, Any] = {
        "model_version": model_version,
        "mode": mode,
        "artifact_file": output_path.name,
        "versioned_artifact_file": versioned_path.name,
        "artifact_size_bytes": artifact_size_bytes,
        "sha256": sha256,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "train_seconds": train_seconds,
        "train_end_year": DEFAULT_TRAIN_MAX_YEAR,
        "max_normal_year": DEFAULT_TRAIN_MAX_YEAR,
        "train_max_year": DEFAULT_TRAIN_MAX_YEAR,
        "library_versions": _collect_library_versions(),
        "device": {
            "requested": device,
            "lgbm_effective": "gpu" if lgbm_use_gpu else "cpu",
            "lgbm_fallback_reason": lgbm_fallback_reason,
            "xgb_effective": "cuda" if xgb_use_cuda else "cpu",
        },
        "gpu_name": probe.gpu_name if probe else None,
        "gpu_memory": probe.memory_total_mib if probe else None,
        "gpu_driver": probe.driver_version if probe else None,
        "gpu_proof": gpu_proof,
        "feature_names": list(FEATURE_COLUMNS),
        "horizons": list(VALID_HORIZONS),
        "tier_cutoffs": list(tier_cutoffs),
        "monotone_constraints": {str(h): monotone_constraints_for_horizon(h) for h in VALID_HORIZONS},
        "calibrations": {str(h): dataclasses.asdict(calibrations[h]) for h in VALID_HORIZONS},
        "no_weather_mae": no_weather_mae,
        "best_params": {
            "lightgbm_by_horizon": {str(h): lgbm_params_by_h[h] for h in VALID_HORIZONS},
            "xgboost_by_horizon": (
                {str(h): xgb_params_by_h[h] for h in VALID_HORIZONS} if xgb_params_by_h else None
            ),
        },
        "optuna_stats": optuna_stats,
        "fold_metrics": fold_metrics,
        "calibration_2023": {
            "by_horizon": cal_summary,
            "within_one_tier_2023": round(within_one_23, 4),
            "critical_recall_2023": round(crit_hits_23 / max(crit_total_23, 1), 4),
        },
        "rain_normals": serialized_normals,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(
        f"Trained {model_version} ({mode}, device={device}) -> {versioned_path.name} + {output_path.name} "
        f"[{artifact_size_bytes / 1024:.1f} KiB, sha256={sha256[:12]}..., {train_seconds}s, "
        f"cutoffs={tier_cutoffs}, within_one_23={within_one_23:.4f}, "
        f"crit_rec_23={crit_hits_23 / max(crit_total_23, 1):.4f}]"
    )
    return metadata


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Train Abhas LightGBM Poisson direct multi-horizon models.")
    ap.add_argument("--mode", choices=["baseline", "tuned"], default="tuned")
    ap.add_argument("--device", choices=["auto", "gpu", "cpu"], default="auto")
    ap.add_argument(
        "--tune",
        action="store_true",
        help="Run Optuna TPE hyperparameter search on purged 2019–2022 folds + XGBoost CUDA challenger.",
    )
    ap.add_argument(
        "--params",
        type=Path,
        default=None,
        help="Path to best_params.json for reproducible refit without re-running Optuna.",
    )
    ap.add_argument("--trials", type=int, default=35, help="Optuna trials per horizon for LightGBM.")
    ap.add_argument("--xgb-trials", type=int, default=20, help="Optuna trials per horizon for XGBoost.")
    ap.add_argument(
        "--timeout-per-h", type=float, default=65.0, help="Optuna timeout (s) per horizon (LGBM)."
    )
    ap.add_argument(
        "--xgb-timeout-per-h", type=float, default=35.0, help="Optuna timeout (s) per horizon (XGB)."
    )
    ap.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Optional directory to write artifact + metadata (defaults to ml/artifacts).",
    )
    args = ap.parse_args(argv)
    out_dir = args.output_dir or ARTIFACTS_DIR
    train_and_save(
        mode=args.mode,
        device=args.device,
        tune=args.tune,
        params_path=args.params,
        n_trials=args.trials,
        xgb_trials=args.xgb_trials,
        timeout_per_h=args.timeout_per_h,
        xgb_timeout_per_h=args.xgb_timeout_per_h,
        output_path=out_dir / "current.joblib",
        metadata_path=out_dir / "metadata.json",
        best_params_path=out_dir / "best_params.json",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
