"""THE single canonical lag & feature builder imported by training, backtest, and serving.

Guarantees:
- Zero train/serve skew (one implementation for ml/train.py, ml/backtest.py, and API serving).
- Strict per-ward lag grouping on date-sorted rows: first k rows of every lag-k feature are NaN
  for every ward, with zero cross-ward contamination.
- Strict temporal cutoff: features at origin_week `t` use ONLY observations dated <= `t`.
- Training-year rain normals (`<= 2023`) fit separately via `fit_rain_normals` and passed in.
- Case-insensitive weather column normalization (`avg_temp_C` -> `avg_temp_c`) with non-null check.
- Clean ISO week 53 handling (maps week 53 -> 52 for cyclical encoding and normal lookup).
"""

from __future__ import annotations

import logging
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.ports.repositories import Observation, WardRecord

logger = logging.getLogger("abhas.features")

MAX_RAIN_LAG = 8
MAX_WEATHER_LAG = 3
VALID_HORIZONS: tuple[int, ...] = (1, 2, 3, 4)
DEFAULT_TRAIN_MAX_YEAR = 2023

REQUIRED_WEATHER_COLUMNS: tuple[str, ...] = (
    "avg_temp_c",
    "rainfall_mm",
    "relative_humidity_pct",
)
STATIC_WARD_COLUMNS: tuple[str, ...] = (
    "population_density_sqkm",
    "water_logging_risk_index",
    "sanitation_score",
)

FEATURE_COLUMNS: tuple[str, ...] = (
    "rainfall_lag_0",
    "rainfall_lag_1",
    "rainfall_lag_2",
    "rainfall_lag_3",
    "rainfall_lag_4",
    "rainfall_lag_5",
    "rainfall_lag_6",
    "rainfall_lag_7",
    "rainfall_lag_8",
    "rain_sum_0_3",
    "rain_sum_4_7",
    "rain_anomaly",
    "temp_lag_0",
    "temp_lag_1",
    "temp_lag_2",
    "temp_lag_3",
    "temp_mean_4w",
    "humidity_lag_0",
    "humidity_lag_1",
    "humidity_lag_2",
    "humidity_lag_3",
    "humidity_mean_4w",
    "population_density_sqkm",
    "water_logging_risk_index",
    "sanitation_score",
    "iso_week_sin",
    "iso_week_cos",
)


def canonical_iso_week(d: date) -> int:
    """Return ISO week in 1..52, folding rare ISO week 53 cleanly into week 52."""
    return min(int(d.isocalendar().week), 52)


def iso_week_cyclical(target_week: date) -> tuple[float, float]:
    """Return (sin, cos) seasonal encoding for a target Monday date, handling ISO week 53."""
    week_num = canonical_iso_week(target_week)
    angle = 2.0 * math.pi * (week_num - 1) / 52.0
    return (math.sin(angle), math.cos(angle))


def _coerce_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, pd.Timestamp):
        return value.date()
    return date.fromisoformat(str(value).strip()[:10])


def normalize_observation_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Copy DataFrame, normalize column names case-insensitively (`avg_temp_C` -> `avg_temp_c`),
    normalize `date` -> `week` as `datetime.date`, and assert required weather columns have zero nulls.
    """
    out = df.copy()
    rename_map: dict[str, str] = {}
    for col in out.columns:
        low = str(col).strip().lower()
        if low == "date" and "week" not in {str(c).strip().lower() for c in out.columns}:
            rename_map[col] = "week"
        elif low != col:
            rename_map[col] = low
    if rename_map:
        out = out.rename(columns=rename_map)

    if "ward_id" not in out.columns or "week" not in out.columns:
        raise ValueError("Observation DataFrame must include 'ward_id' and 'week' (or 'date') columns")

    for req_col in REQUIRED_WEATHER_COLUMNS:
        if req_col not in out.columns:
            raise ValueError(f"Missing required weather column: {req_col}")
        null_count = int(out[req_col].isna().to_numpy().sum())
        if null_count > 0:
            raise ValueError(f"Required weather column '{req_col}' contains {null_count} null value(s)")

    out["ward_id"] = out["ward_id"].astype(str)
    out["week"] = [_coerce_date(v) for v in out["week"].tolist()]
    for req_col in REQUIRED_WEATHER_COLUMNS:
        out[req_col] = np.asarray(pd.to_numeric(out[req_col], errors="raise"), dtype=float)
    return out


def observations_to_dataframe(
    observations: Sequence[Observation],
    wards: Sequence[WardRecord] | None = None,
) -> pd.DataFrame:
    """Convert port Observation (+ optional WardRecord) sequences into a canonical DataFrame."""
    obs_rows = [
        {
            "ward_id": o.ward_id,
            "week": o.week,
            "avg_temp_c": float(o.avg_temp_c),
            "max_temp_c": float(o.max_temp_c),
            "min_temp_c": float(o.min_temp_c),
            "rainfall_mm": float(o.rainfall_mm),
            "relative_humidity_pct": float(o.relative_humidity_pct),
            "dengue_cases": int(o.dengue_cases),
        }
        for o in observations
    ]
    obs_df = pd.DataFrame(obs_rows)
    if obs_df.empty:
        return pd.DataFrame(
            columns=[
                "ward_id",
                "week",
                "avg_temp_c",
                "max_temp_c",
                "min_temp_c",
                "rainfall_mm",
                "relative_humidity_pct",
                "dengue_cases",
            ]
        )

    if wards is not None:
        ward_df = pd.DataFrame(
            [
                {
                    "ward_id": w.ward_id,
                    "city": w.city,
                    "population_density_sqkm": float(w.population_density_sqkm),
                    "water_logging_risk_index": float(w.water_logging_risk_index),
                    "sanitation_score": float(w.sanitation_score),
                }
                for w in wards
            ]
        )
        obs_df = obs_df.merge(ward_df, on="ward_id", how="left")
    return obs_df


def fit_rain_normals(
    df: pd.DataFrame,
    max_year: int = DEFAULT_TRAIN_MAX_YEAR,
    *,
    max_normal_year: int | None = None,
) -> dict[tuple[str, int], float]:
    """Fit ward × ISO-week rainfall normals strictly on training years (`week.year <= cutoff_year`).

    ISO week 53 is folded cleanly into week 52 so normals never suffer from 1-row buckets.
    Accepts either `max_year` or explicit keyword `max_normal_year` (CR-5).
    """
    cutoff_year = max_normal_year if max_normal_year is not None else max_year
    norm_df = normalize_observation_columns(df)
    years = [d.year for d in norm_df["week"].tolist()]
    train_mask = [y <= cutoff_year for y in years]
    train_df = norm_df.loc[train_mask].copy()
    if train_df.empty:
        return {}

    train_df["_iso_week"] = [canonical_iso_week(d) for d in train_df["week"].tolist()]
    grouped = train_df.groupby(["ward_id", "_iso_week"])["rainfall_mm"].mean()
    return {(str(k[0]), int(k[1])): float(v) for k, v in grouped.items()}


def _attach_static_wards(df: pd.DataFrame, wards_df: pd.DataFrame | None) -> pd.DataFrame:
    missing_static = [c for c in STATIC_WARD_COLUMNS if c not in df.columns]
    if not missing_static:
        for c in STATIC_WARD_COLUMNS:
            if int(df[c].isna().to_numpy().sum()) > 0:
                raise ValueError(f"Static ward column '{c}' contains null values")
            df[c] = np.asarray(pd.to_numeric(df[c], errors="raise"), dtype=float)
        return df

    if wards_df is None:
        raise ValueError(f"Missing static ward columns {missing_static} and wards_df was not provided")

    wdf = wards_df.copy()
    wdf.columns = [str(c).strip().lower() for c in wdf.columns]
    if "ward_id" not in wdf.columns:
        raise ValueError("wards_df must contain 'ward_id'")
    cols_to_merge = ["ward_id"] + [c for c in STATIC_WARD_COLUMNS if c not in df.columns]
    for c in STATIC_WARD_COLUMNS:
        if c not in wdf.columns and c not in df.columns:
            raise ValueError(f"wards_df missing required static column '{c}'")
    dedup_wards = wdf.drop_duplicates(subset=["ward_id"])
    merged = df.merge(dedup_wards[cols_to_merge], on="ward_id", how="left")
    for c in STATIC_WARD_COLUMNS:
        if int(merged[c].isna().to_numpy().sum()) > 0:
            raise ValueError(f"Static ward column '{c}' has null values after merging wards_df")
        merged[c] = np.asarray(pd.to_numeric(merged[c], errors="raise"), dtype=float)
    return merged


def _assert_consecutive_weeks(df: pd.DataFrame) -> None:
    """Reject duplicate or non-consecutive weekly rows per ward before positional lag shifts (CR-7)."""
    if df.duplicated(subset=["ward_id", "week"]).any():
        raise ValueError("Duplicate (ward_id, week) rows detected in observation input")
    if df.empty:
        return
    step = pd.to_datetime(df["week"]).groupby(df["ward_id"], sort=False).diff().dropna()
    if not (step == pd.Timedelta(weeks=1)).all():
        raise ValueError(
            "non-consecutive weekly rows per ward; reindex to a full Monday calendar before building lags"
        )


def build_features(
    obs_df: pd.DataFrame,
    wards_df: pd.DataFrame | None = None,
    *,
    horizon: int = 1,
    origin_week: date | None = None,
    rain_normals: Mapping[tuple[str, int], float] | None = None,
    max_normal_year: int = DEFAULT_TRAIN_MAX_YEAR,
    drop_incomplete_lags: bool = False,
) -> pd.DataFrame:
    """Build canonical lag, rolling, anomaly, static, and target-week seasonal features.

    Strictly guarantees:
    - If `origin_week` is provided, all observations with `week > origin_week` are dropped BEFORE
      any lag, rolling window, or normal computation (zero future leakage).
    - Every lag feature is computed via `groupby("ward_id").shift(k)` on `(ward_id, week)`-sorted
      rows, so the first `k` rows of every ward are `NaN` with zero cross-ward contamination.
    """
    if horizon not in VALID_HORIZONS:
        raise ValueError(f"horizon must be in {VALID_HORIZONS}, got {horizon}")

    df = normalize_observation_columns(obs_df)
    df = _attach_static_wards(df, wards_df)

    # STRICT TEMPORAL CUTOFF: filter BEFORE any grouping, shifting, rolling, or normal fitting.
    if origin_week is not None:
        cutoff = _coerce_date(origin_week)
        df = df.loc[df["week"] <= cutoff].copy()

    df = df.sort_values(["ward_id", "week"], kind="mergesort").reset_index(drop=True)
    _assert_consecutive_weeks(df)

    if df.empty:
        cols = ["ward_id", "week", *REQUIRED_WEATHER_COLUMNS, *FEATURE_COLUMNS, "horizon", "target_week"]
        return pd.DataFrame(columns=cols)

    # Resolve rain normals (prefer caller's pre-fitted training normals; warn on on-the-fly refit per CR-13)
    normals: Mapping[tuple[str, int], float]
    if rain_normals is not None:
        normals = rain_normals
    else:
        logger.warning(
            "rain_normals omitted in build_features; fitting on-the-fly with max_normal_year=%d "
            "(pass pre-fitted training normals to avoid train/serve skew)",
            max_normal_year,
            extra={"event": "rain_normals_refit_on_the_fly", "max_normal_year": max_normal_year},
        )
        normals = fit_rain_normals(df, max_normal_year=max_normal_year)

    # Fallback per-ward mean from the (already cutoff-filtered) frame if a ward has no <= max_normal_year rows
    ward_fallback_rain: dict[str, float] = {}
    if normals:
        by_ward: dict[str, list[float]] = {}
        for (wid, _wk), val in normals.items():
            by_ward.setdefault(wid, []).append(val)
        ward_fallback_rain = {wid: float(np.mean(vals)) for wid, vals in by_ward.items()}

    grouped = df.groupby("ward_id", sort=False)

    for k in range(MAX_RAIN_LAG + 1):
        df[f"rainfall_lag_{k}"] = grouped["rainfall_mm"].shift(k)

    df["rain_sum_0_3"] = (
        df["rainfall_lag_0"] + df["rainfall_lag_1"] + df["rainfall_lag_2"] + df["rainfall_lag_3"]
    )
    df["rain_sum_4_7"] = (
        df["rainfall_lag_4"] + df["rainfall_lag_5"] + df["rainfall_lag_6"] + df["rainfall_lag_7"]
    )

    # Rain anomaly against ward × ISO-week training normal at the origin week
    ward_ids_list = df["ward_id"].tolist()
    weeks_list = df["week"].tolist()
    rain_vals = df["rainfall_mm"].to_numpy(dtype=float)

    # Build a causal expanding ward mean fallback only for wards completely absent from `normals`
    expanding_ward_mean: np.ndarray | None = None
    expected_normals = np.empty(len(df), dtype=float)
    for i, (wid, wk) in enumerate(zip(ward_ids_list, weeks_list, strict=True)):
        iso_w = canonical_iso_week(wk)
        norm_val = normals.get((wid, iso_w))
        if norm_val is None:
            norm_val = ward_fallback_rain.get(wid)
        if norm_val is None:
            if expanding_ward_mean is None:
                exp_series = (
                    grouped["rainfall_mm"].expanding(min_periods=1).mean().reset_index(level=0, drop=True)
                )
                expanding_ward_mean = np.asarray(exp_series, dtype=float)
            assert expanding_ward_mean is not None
            norm_val = float(expanding_ward_mean[i])
        expected_normals[i] = float(norm_val)
    df["rain_anomaly"] = rain_vals - expected_normals

    for k in range(MAX_WEATHER_LAG + 1):
        df[f"temp_lag_{k}"] = grouped["avg_temp_c"].shift(k)
        df[f"humidity_lag_{k}"] = grouped["relative_humidity_pct"].shift(k)

    df["temp_mean_4w"] = (df["temp_lag_0"] + df["temp_lag_1"] + df["temp_lag_2"] + df["temp_lag_3"]) / 4.0
    df["humidity_mean_4w"] = (
        df["humidity_lag_0"] + df["humidity_lag_1"] + df["humidity_lag_2"] + df["humidity_lag_3"]
    ) / 4.0

    # Target-week seasonality for horizon h
    target_weeks = [wk + timedelta(weeks=horizon) for wk in weeks_list]
    sin_cos = [iso_week_cyclical(tw) for tw in target_weeks]
    df["iso_week_sin"] = [sc[0] for sc in sin_cos]
    df["iso_week_cos"] = [sc[1] for sc in sin_cos]
    df["horizon"] = int(horizon)
    df["target_week"] = target_weeks

    if drop_incomplete_lags:
        df = df.loc[df[f"rainfall_lag_{MAX_RAIN_LAG}"].notna()].reset_index(drop=True)

    return df


def build_serving_features(
    obs_df: pd.DataFrame,
    wards_df: pd.DataFrame | None = None,
    *,
    origin_week: date,
    horizon: int,
    rain_normals: Mapping[tuple[str, int], float],
    ward_ids: Sequence[str] | None = None,
    weather_override: Mapping[str, float] | None = None,
) -> pd.DataFrame:
    """Build feature row(s) for serving or what-if scenario at a specific `origin_week` and `horizon`.

    Requires pre-fitted `rain_normals` from the model artifact (CR-13) to eliminate train/serve skew.
    `weather_override` (e.g. `{"rainfall_mm": 120.0}`) mutates ONLY a copy of the `origin_week`
    row(s) for the selected ward(s), strictly preserving zero future leakage.
    """
    if rain_normals is None:
        raise ValueError("rain_normals is required for build_serving_features to prevent train/serve skew")

    cutoff = _coerce_date(origin_week)
    df = normalize_observation_columns(obs_df)
    df = df.loc[df["week"] <= cutoff].copy()
    if ward_ids is not None:
        allowed = set(ward_ids)
        df = df.loc[df["ward_id"].isin(allowed)].copy()

    if df.empty:
        ward_note = f" for wards {sorted(set(ward_ids))}" if ward_ids is not None else ""
        raise ValueError(
            f"No observations available on or before origin_week {cutoff.isoformat()}{ward_note}"
        )

    if weather_override:
        normalized_override: dict[str, float] = {}
        unknown_keys: list[str] = []
        for col, val in weather_override.items():
            key = str(col).strip().lower()
            if key not in REQUIRED_WEATHER_COLUMNS:
                unknown_keys.append(str(col))
            else:
                normalized_override[key] = float(val)
        if unknown_keys:
            raise ValueError(
                f"Unknown weather_override key(s) {sorted(unknown_keys)}; "
                f"allowed keys are {list(REQUIRED_WEATHER_COLUMNS)}"
            )
        mask = df["week"] == cutoff
        if not bool(mask.any()):
            raise ValueError(
                f"No observation row matches origin_week {cutoff.isoformat()} for weather_override"
            )
        for key, val in normalized_override.items():
            df.loc[mask, key] = val

    feats = build_features(
        df,
        wards_df,
        horizon=horizon,
        origin_week=cutoff,
        rain_normals=rain_normals,
        drop_incomplete_lags=False,
    )
    out = feats.loc[feats["week"] == cutoff].reset_index(drop=True)
    if out.empty:
        raise ValueError(
            f"No feature row produced for origin_week {cutoff.isoformat()}; "
            "ensure origin_week is a Monday present in the observation frame"
        )
    return out


@dataclass(frozen=True)
class LagCorrelationPoint:
    lag_weeks: int
    ward_corr: float
    dataset_corr: float


@dataclass(frozen=True)
class LagCorrelationResult:
    ward_id: str
    max_lag: int
    peak_lag_ward: int
    peak_lag_dataset: int
    correlations: list[LagCorrelationPoint]


def _safe_pearson(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 2:
        return 0.0
    sx = float(np.std(x))
    sy = float(np.std(y))
    if sx <= 1e-12 or sy <= 1e-12:
        return 0.0
    corr = float(np.corrcoef(x, y)[0, 1])
    if math.isnan(corr) or math.isinf(corr):
        return 0.0
    return max(-1.0, min(1.0, round(corr, 4)))


def compute_all_lag_correlations(
    obs_df: pd.DataFrame,
    max_lag: int = MAX_RAIN_LAG,
) -> tuple[list[float], dict[str, list[float]]]:
    """Compute ward×ISO-week-demeaned rain (lagged k) vs demeaned cases Pearson correlation
    for the pooled dataset AND every ward in one vectorized pass.
    """
    if max_lag < 0 or max_lag > MAX_RAIN_LAG:
        raise ValueError(f"max_lag must be in 0..{MAX_RAIN_LAG}, got {max_lag}")

    df = normalize_observation_columns(obs_df)
    if "dengue_cases" not in df.columns:
        raise ValueError("Observation DataFrame must include 'dengue_cases'")
    df = df.sort_values(["ward_id", "week"], kind="mergesort").reset_index(drop=True)
    _assert_consecutive_weeks(df)
    df["_iso_week"] = [canonical_iso_week(d) for d in df["week"].tolist()]

    # Demean within each (ward_id, iso_week) to remove seasonal cycle
    grp = df.groupby(["ward_id", "_iso_week"], sort=False)
    df["_rain_dm"] = df["rainfall_mm"] - grp["rainfall_mm"].transform("mean")
    df["_cases_dm"] = df["dengue_cases"].astype(float) - grp["dengue_cases"].transform("mean")

    cases_all = df["_cases_dm"].to_numpy(dtype=float)
    ward_grouped = df.groupby("ward_id", sort=False)

    dataset_corrs: list[float] = []
    lagged_arrays: list[np.ndarray] = []
    for k in range(max_lag + 1):
        lagged = ward_grouped["_rain_dm"].shift(k).to_numpy(dtype=float)
        lagged_arrays.append(lagged)
        valid = ~np.isnan(lagged) & ~np.isnan(cases_all)
        dataset_corrs.append(_safe_pearson(lagged[valid], cases_all[valid]))

    ward_corrs: dict[str, list[float]] = {}
    for wid, idx in ward_grouped.indices.items():
        w_cases = cases_all[idx]
        corrs_for_ward: list[float] = []
        for k in range(max_lag + 1):
            w_lag = lagged_arrays[k][idx]
            valid = ~np.isnan(w_lag) & ~np.isnan(w_cases)
            corrs_for_ward.append(_safe_pearson(w_lag[valid], w_cases[valid]))
        ward_corrs[str(wid)] = corrs_for_ward

    return dataset_corrs, ward_corrs


def compute_lag_correlations(
    obs_df: pd.DataFrame,
    ward_id: str,
    max_lag: int = MAX_RAIN_LAG,
) -> LagCorrelationResult:
    """Compute deseasonalized rainfall lag 0..max_lag correlations for `ward_id` and pooled dataset."""
    dataset_corrs, ward_map = compute_all_lag_correlations(obs_df, max_lag=max_lag)
    if ward_id not in ward_map:
        raise KeyError(f"Ward {ward_id!r} not found in observation dataset")

    w_corrs = ward_map[ward_id]
    points = [
        LagCorrelationPoint(lag_weeks=k, ward_corr=w_corrs[k], dataset_corr=dataset_corrs[k])
        for k in range(max_lag + 1)
    ]
    peak_ward = int(np.argmax(w_corrs))
    peak_dataset = int(np.argmax(dataset_corrs))
    return LagCorrelationResult(
        ward_id=ward_id,
        max_lag=max_lag,
        peak_lag_ward=peak_ward,
        peak_lag_dataset=peak_dataset,
        correlations=points,
    )
