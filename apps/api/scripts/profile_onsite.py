"""Read-only profiler for the Phase 2 onsite dataset vs the Phase 1 dataset.

Usage:
    node scripts/py.mjs -m scripts.profile_onsite
    node scripts/py.mjs -m scripts.profile_onsite -- --json

Reads data/raw/bangladesh_dengue_large_dataset_onsite.xlsx and
data/raw/hackathon_preli_dataset.xlsx strictly read-only, verifies SHA-256,
compares schemas/keys/values, fits supply-to-case relationships (overall,
2016-2022 training years, 2024-2025 hold-out, and per city), checks for
capacity/crew/stock columns, repeats deseasonalized rain-case lag correlations,
and emits a retraining recommendation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import openpyxl
import pandas as pd

from app.core.config import REPO_ROOT
from app.shared.features import (
    STATIC_WARD_COLUMNS,
    canonical_iso_week,
    compute_all_lag_correlations,
)

DEFAULT_ONSITE_PATH = REPO_ROOT / "data" / "raw" / "bangladesh_dengue_large_dataset_onsite.xlsx"
DEFAULT_PHASE1_PATH = REPO_ROOT / "data" / "raw" / "hackathon_preli_dataset.xlsx"

CAPACITY_TOKEN_KEYWORDS: frozenset[str] = frozenset(
    {
        "capacity",
        "cap",
        "beds_capacity",
        "bed_capacity",
        "health_centre",
        "health_center",
        "centre",
        "center",
        "clinic",
        "facility",
        "facilities",
        "crew",
        "crews",
        "team",
        "teams",
        "spray",
        "spraying",
        "stock",
        "inventory",
        "budget",
        "available",
        "lat",
        "lon",
        "lng",
        "latitude",
        "longitude",
        "coord",
        "coords",
    }
)

EXPECTED_SUPPLY_COLUMNS: tuple[str, ...] = (
    "saline_bags_needed",
    "diagnostic_kits_needed",
    "hospital_beds_required",
)


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_workbook(path: Path) -> tuple[list[str], str, pd.DataFrame]:
    """Read workbook metadata and primary sheet strictly read-only."""
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheets = list(wb.sheetnames)
    finally:
        wb.close()
    if not sheets:
        raise ValueError(f"Workbook has no sheets: {path}")
    sheet_name = sheets[0]
    df = pd.read_excel(path, sheet_name=sheet_name)
    return sheets, sheet_name, df


def _to_date_series(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="raise").dt.date


def _ols_metrics(x: np.ndarray, y: np.ndarray) -> dict[str, Any]:
    """Return both OLS-with-intercept and OLS-through-origin fits for y ~ x."""
    x_f = np.asarray(x, dtype=np.float64)
    y_f = np.asarray(y, dtype=np.float64)
    ss_tot = float(np.sum((y_f - float(np.mean(y_f))) ** 2))

    # OLS with intercept: y = a + b*x
    x_mean = float(np.mean(x_f))
    y_mean = float(np.mean(y_f))
    denom = float(np.sum((x_f - x_mean) ** 2))
    slope = float(np.sum((x_f - x_mean) * (y_f - y_mean)) / denom) if denom > 0 else 0.0
    intercept = y_mean - slope * x_mean
    resid = y_f - (intercept + slope * x_f)
    ss_res = float(np.sum(resid**2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0

    # OLS through origin: y = b0 * x
    denom0 = float(np.sum(x_f**2))
    slope0 = float(np.sum(x_f * y_f) / denom0) if denom0 > 0 else 0.0
    resid0 = y_f - slope0 * x_f
    ss_res0 = float(np.sum(resid0**2))
    r2_origin = 1.0 - ss_res0 / ss_tot if ss_tot > 0 else 1.0

    # Deterministic rounding check against origin slope
    round_exact_share = float(np.mean(np.rint(slope0 * x_f) == y_f))
    ceil_exact_share = float(np.mean(np.ceil(slope0 * x_f) == y_f))
    floor_exact_share = float(np.mean(np.floor(slope0 * x_f) == y_f))
    within_1_share = float(np.mean(np.abs(y_f - slope0 * x_f) <= 1.0))

    return {
        "n": int(len(x_f)),
        "ols": {
            "slope": round(slope, 6),
            "intercept": round(intercept, 6),
            "r2": round(r2, 6),
            "residual_sd": round(float(np.std(resid, ddof=1)), 6) if len(resid) > 1 else 0.0,
            "residual_mae": round(float(np.mean(np.abs(resid))), 6),
            "residual_iqr": round(
                float(np.percentile(resid, 75) - np.percentile(resid, 25)),
                6,
            ),
            "residual_min": round(float(np.min(resid)), 4),
            "residual_max": round(float(np.max(resid)), 4),
        },
        "ols_through_origin": {
            "slope": round(slope0, 6),
            "r2": round(r2_origin, 6),
            "residual_sd": round(float(np.std(resid0, ddof=1)), 6) if len(resid0) > 1 else 0.0,
            "residual_mae": round(float(np.mean(np.abs(resid0))), 6),
            "residual_iqr": round(
                float(np.percentile(resid0, 75) - np.percentile(resid0, 25)),
                6,
            ),
            "residual_min": round(float(np.min(resid0)), 4),
            "residual_max": round(float(np.max(resid0)), 4),
            "exact_round_match_pct": round(round_exact_share * 100.0, 2),
            "exact_ceil_match_pct": round(ceil_exact_share * 100.0, 2),
            "exact_floor_match_pct": round(floor_exact_share * 100.0, 2),
            "within_1_unit_pct": round(within_1_share * 100.0, 2),
        },
    }


def _profile_supply_column(df: pd.DataFrame, col: str) -> dict[str, Any]:
    y = df[col].to_numpy(dtype=np.float64)
    x = df["dengue_cases"].to_numpy(dtype=np.float64)
    years = np.array([d.year for d in df["_week_date"].tolist()], dtype=int)

    is_integer = bool(np.all(np.equal(np.mod(y, 1.0), 0.0)))
    zero_case_mask = x == 0
    pos_case_mask = x > 0
    nonzero_when_cases_zero = int(np.sum(y[zero_case_mask] != 0))
    ratios_pos = y[pos_case_mask] / x[pos_case_mask]

    # Check conditional spread of y for identical dengue_cases counts to test determinism vs noise
    cond_spread: dict[str, dict[str, Any]] = {}
    for k in (1, 2, 5, 10, 15, 20):
        vals = y[x == k]
        if len(vals) > 0:
            unique_vals = sorted({int(v) if is_integer else round(float(v), 4) for v in vals})
            cond_spread[str(k)] = {
                "count": int(len(vals)),
                "unique_values": unique_vals,
                "min": float(np.min(vals)),
                "max": float(np.max(vals)),
                "mean": round(float(np.mean(vals)), 4),
                "std": round(float(np.std(vals, ddof=1)), 4) if len(vals) > 1 else 0.0,
            }

    # Check residual correlation with candidate covariates on positive-case rows
    slope0 = float(np.sum(x * y) / np.sum(x**2))
    resid0 = y - slope0 * x
    resid_corrs: dict[str, float] = {}
    for cov in (
        "population_density_sqkm",
        "water_logging_risk_index",
        "sanitation_score",
        "avg_temp_c",
        "rainfall_mm",
        "relative_humidity_pct",
    ):
        if cov in df.columns:
            c_arr = df[cov].to_numpy(dtype=np.float64)
            if float(np.std(c_arr)) > 1e-12 and float(np.std(resid0)) > 1e-12:
                resid_corrs[cov] = round(float(np.corrcoef(c_arr, resid0)[0, 1]), 4)

    train_mask = (years >= 2016) & (years <= 2022)
    holdout_mask = (years >= 2024) & (years <= 2025)

    per_city_all: dict[str, Any] = {}
    per_city_train: dict[str, Any] = {}
    for city, sub in df.groupby("city", sort=True):
        city_name = str(city)
        per_city_all[city_name] = _ols_metrics(
            sub["dengue_cases"].to_numpy(dtype=np.float64),
            sub[col].to_numpy(dtype=np.float64),
        )
        sub_years = np.array([d.year for d in sub["_week_date"].tolist()], dtype=int)
        sub_tr = sub.loc[(sub_years >= 2016) & (sub_years <= 2022)]
        per_city_train[city_name] = _ols_metrics(
            sub_tr["dengue_cases"].to_numpy(dtype=np.float64),
            sub_tr[col].to_numpy(dtype=np.float64),
        )

    # Check determinism across ALL unique dengue_cases counts and solve exact round(c * x) interval
    grouped_unique = df.groupby("dengue_cases")[col].unique()
    max_unique_y_per_x = int(max(len(v) for v in grouped_unique))
    is_exact_deterministic_fn = max_unique_y_per_x == 1
    round_lo, round_hi = 0.0, float("inf")
    exact_round_midpoint: float | None = None
    exact_round_100pct = False
    if is_exact_deterministic_fn and is_integer:
        for case_val, ys in grouped_unique.items():
            x_int = int(case_val)  # type: ignore[arg-type]
            if x_int <= 0:
                continue
            y_int = int(ys[0])
            round_lo = max(round_lo, (y_int - 0.5) / x_int)
            round_hi = min(round_hi, (y_int + 0.5) / x_int)
        if round_lo < round_hi:
            exact_round_midpoint = round((round_lo + round_hi) / 2.0, 6)
            exact_round_100pct = bool(
                np.all(np.rint(exact_round_midpoint * x) == y)
                and all(round(exact_round_midpoint * int(k)) == int(v[0]) for k, v in grouped_unique.items())  # type: ignore[arg-type]
            )

    return {
        "column": col,
        "dtype": str(df[col].dtype),
        "integer_only": is_integer,
        "nulls": int(df[col].isna().sum()),
        "zero_pct": round(float(np.mean(y == 0) * 100.0), 2),
        "nonzero_when_cases_zero": nonzero_when_cases_zero,
        "distribution": {
            "min": float(np.min(y)),
            "p10": float(np.percentile(y, 10)),
            "median": float(np.median(y)),
            "mean": round(float(np.mean(y)), 4),
            "std": round(float(np.std(y, ddof=1)), 4),
            "p90": float(np.percentile(y, 90)),
            "p95": float(np.percentile(y, 95)),
            "p99": float(np.percentile(y, 99)),
            "max": float(np.max(y)),
        },
        "per_case_ratio_pos_cases": {
            "n_pos_rows": int(np.sum(pos_case_mask)),
            "min": round(float(np.min(ratios_pos)), 4),
            "p10": round(float(np.percentile(ratios_pos, 10)), 4),
            "median": round(float(np.median(ratios_pos)), 4),
            "mean": round(float(np.mean(ratios_pos)), 4),
            "std": round(float(np.std(ratios_pos, ddof=1)), 4),
            "p90": round(float(np.percentile(ratios_pos, 90)), 4),
            "max": round(float(np.max(ratios_pos)), 4),
            "sum_y_over_sum_x": round(float(np.sum(y) / np.sum(x)), 6),
        },
        "fit_all_2016_2025": _ols_metrics(x, y),
        "fit_train_2016_2022": _ols_metrics(x[train_mask], y[train_mask]),
        "fit_holdout_2024_2025": _ols_metrics(x[holdout_mask], y[holdout_mask]),
        "per_city_all_2016_2025": per_city_all,
        "per_city_train_2016_2022": per_city_train,
        "conditional_y_given_cases": cond_spread,
        "max_unique_y_per_x": max_unique_y_per_x,
        "exact_deterministic_function_of_cases": is_exact_deterministic_fn,
        "exact_round_multiplier_interval": [round(round_lo, 6), round(round_hi, 6)]
        if exact_round_midpoint is not None
        else None,
        "exact_round_midpoint": exact_round_midpoint,
        "exact_round_100pct_all_rows": exact_round_100pct,
        "residual_correlations": resid_corrs,
    }


def _compare_with_phase1(df_onsite: pd.DataFrame, df_p1: pd.DataFrame) -> dict[str, Any]:
    raw_cols_onsite = list(df_onsite.columns)
    raw_cols_p1 = list(df_p1.columns)
    norm_onsite = {str(c).strip().lower(): str(c) for c in raw_cols_onsite}
    norm_p1 = {str(c).strip().lower(): str(c) for c in raw_cols_p1}

    shared_norm = [c for c in norm_p1 if c in norm_onsite]
    added_cols = [norm_onsite[c] for c in norm_onsite if c not in norm_p1]
    removed_cols = [norm_p1[c] for c in norm_p1 if c not in norm_onsite]

    o = df_onsite.copy()
    p = df_p1.copy()
    o.columns = [str(c).strip().lower() for c in o.columns]
    p.columns = [str(c).strip().lower() for c in p.columns]
    o["_week_date"] = _to_date_series(o["date"])
    p["_week_date"] = _to_date_series(p["date"])

    o_keys = set(zip(o["ward_id"].astype(str), o["_week_date"], strict=True))
    p_keys = set(zip(p["ward_id"].astype(str), p["_week_date"], strict=True))

    o_wards = set(o["ward_id"].astype(str).unique())
    p_wards = set(p["ward_id"].astype(str).unique())
    o_weeks = set(o["_week_date"].unique())
    p_weeks = set(p["_week_date"].unique())

    merged = p.merge(
        o,
        on=["ward_id", "_week_date"],
        how="inner",
        suffixes=("_p1", "_onsite"),
    )

    col_diffs: dict[str, dict[str, Any]] = {}
    total_diff_cells = 0
    for c in shared_norm:
        if c in ("ward_id", "date"):
            continue
        s_p1 = merged[f"{c}_p1"]
        s_on = merged[f"{c}_onsite"]
        if pd.api.types.is_numeric_dtype(s_p1) and pd.api.types.is_numeric_dtype(s_on):
            diff = np.abs(s_p1.to_numpy(dtype=np.float64) - s_on.to_numpy(dtype=np.float64))
            exact_neq = int(np.sum(s_p1.to_numpy() != s_on.to_numpy()))
            max_abs_diff = float(np.max(diff)) if len(diff) > 0 else 0.0
            col_diffs[c] = {"differing_rows": exact_neq, "max_abs_diff": max_abs_diff}
            total_diff_cells += exact_neq
        else:
            neq = int(np.sum(s_p1.astype(str).to_numpy() != s_on.astype(str).to_numpy()))
            col_diffs[c] = {"differing_rows": neq}
            total_diff_cells += neq

    # Check exact row order parity on shared columns
    o_shared_ordered = o[shared_norm].copy()
    p_shared_ordered = p[shared_norm].copy()
    o_shared_ordered["date"] = o["_week_date"]
    p_shared_ordered["date"] = p["_week_date"]
    same_row_order = bool(len(o) == len(p) and o_shared_ordered.equals(p_shared_ordered))

    return {
        "phase1_shape": [int(df_p1.shape[0]), int(df_p1.shape[1])],
        "onsite_shape": [int(df_onsite.shape[0]), int(df_onsite.shape[1])],
        "shared_columns_normalized": shared_norm,
        "added_columns": added_cols,
        "removed_columns": removed_cols,
        "added_wards": sorted(o_wards - p_wards),
        "removed_wards": sorted(p_wards - o_wards),
        "added_weeks": [d.isoformat() for d in sorted(o_weeks - p_weeks)],
        "removed_weeks": [d.isoformat() for d in sorted(p_weeks - o_weeks)],
        "added_keys_count": len(o_keys - p_keys),
        "removed_keys_count": len(p_keys - o_keys),
        "overlapping_keys_count": len(o_keys & p_keys),
        "same_row_order_on_shared_cols": same_row_order,
        "total_differing_cells_on_shared_cols": total_diff_cells,
        "per_column_diff": col_diffs,
    }


def profile_onsite(
    onsite_path: Path = DEFAULT_ONSITE_PATH,
    phase1_path: Path = DEFAULT_PHASE1_PATH,
) -> dict[str, Any]:
    """Run full read-only profile of the Phase 2 onsite workbook against Phase 1."""
    onsite_sha = compute_sha256(onsite_path)
    p1_sha = compute_sha256(phase1_path)

    onsite_sheets, onsite_sheet, df_raw = inspect_workbook(onsite_path)
    p1_sheets, p1_sheet, df_p1_raw = inspect_workbook(phase1_path)

    df = df_raw.copy()
    raw_columns = list(df.columns)
    raw_dtypes = {str(c): str(df[c].dtype) for c in raw_columns}
    raw_nulls = {str(c): int(df[c].isna().sum()) for c in raw_columns}

    df.columns = [str(c).strip().lower() for c in df.columns]
    df["_week_date"] = _to_date_series(df["date"])
    dates = df["_week_date"].tolist()
    min_date: date = min(dates)
    max_date: date = max(dates)
    non_mondays = int(sum(1 for d in dates if d.weekday() != 0))
    iso_week_53_rows = int(sum(1 for d in dates if d.isocalendar().week == 53))
    iso_week_53_dates = sorted({d.isoformat() for d in dates if d.isocalendar().week == 53})

    dup_keys = int(df.duplicated(subset=["ward_id", "_week_date"]).sum())
    dup_full_rows = int(df_raw.duplicated().sum())

    weeks_per_ward_series = df.groupby("ward_id")["_week_date"].nunique()
    # Check consecutive 7-day steps within every ward
    df_sorted = df.sort_values(["ward_id", "_week_date"], kind="mergesort").reset_index(drop=True)
    steps = pd.to_datetime(df_sorted["_week_date"]).groupby(df_sorted["ward_id"], sort=False).diff().dropna()
    non_consecutive_gaps = int((steps != pd.Timedelta(weeks=1)).sum())

    city_breakdown: list[dict[str, Any]] = []
    for city, sub in df.groupby("city", sort=True):
        w_counts = sub.groupby("ward_id")["_week_date"].nunique()
        city_breakdown.append(
            {
                "city": str(city),
                "wards": int(sub["ward_id"].nunique()),
                "weeks_per_ward_min": int(w_counts.min()),
                "weeks_per_ward_max": int(w_counts.max()),
                "rows": int(len(sub)),
            }
        )

    # Phase 1 comparison
    comparison = _compare_with_phase1(df_raw, df_p1_raw)

    # Supply columns discovery & profiling
    supply_cols = [c for c in EXPECTED_SUPPLY_COLUMNS if c in df.columns]
    extra_added = [
        str(c).strip().lower()
        for c in comparison["added_columns"]
        if str(c).strip().lower() not in supply_cols
    ]
    supply_profiles = {col: _profile_supply_column(df, col) for col in [*supply_cols, *extra_added]}

    # Derived bed capacity preview (ceil(1.10 * P95 weekly hospital_beds_required, 2016-2022))
    capacity_derivation_preview: dict[str, Any] = {}
    if "hospital_beds_required" in df.columns:
        years_arr = np.array([d.year for d in df["_week_date"].tolist()], dtype=int)
        tr = df.loc[(years_arr >= 2016) & (years_arr <= 2022)]
        p95_by_ward = tr.groupby("ward_id")["hospital_beds_required"].quantile(0.95)
        caps = {str(w): max(1, int(math.ceil(1.10 * float(v)))) for w, v in p95_by_ward.items()}
        cap_vals = list(caps.values())
        capacity_derivation_preview = {
            "training_years": [2016, 2022],
            "ward_p95_min": round(float(p95_by_ward.min()), 2),
            "ward_p95_median": round(float(p95_by_ward.median()), 2),
            "ward_p95_max": round(float(p95_by_ward.max()), 2),
            "derived_cap_min": int(min(cap_vals)),
            "derived_cap_median": float(np.median(cap_vals)),
            "derived_cap_max": int(max(cap_vals)),
            "total_beds_across_60_wards": int(sum(cap_vals)),
        }

    # Capacity / crew / stock / coordinate column scan (token-level match so e.g. 'lat' does not match 'population')
    capacity_matches: list[str] = []
    for raw_c in raw_columns:
        low = str(raw_c).strip().lower()
        tokens = set(low.split("_"))
        if low in CAPACITY_TOKEN_KEYWORDS or bool(tokens & CAPACITY_TOKEN_KEYWORDS):
            capacity_matches.append(str(raw_c))

    # Static ward vulnerability check
    static_checks: dict[str, Any] = {}
    ward_means = df.groupby("ward_id")["dengue_cases"].mean()
    for col in STATIC_WARD_COLUMNS:
        nunique_per_ward = df.groupby("ward_id")[col].nunique()
        w_vals = df.groupby("ward_id")[col].first()
        corr = float(np.corrcoef(w_vals.to_numpy(dtype=float), ward_means.to_numpy(dtype=float))[0, 1])
        static_checks[col] = {
            "constant_within_every_ward": bool((nunique_per_ward == 1).all()),
            "min": round(float(w_vals.min()), 4),
            "max": round(float(w_vals.max()), 4),
            "ward_mean_case_corr": round(corr, 4),
        }

    # Deseasonalized rain-case lag correlation (identical methodology to Phase 1 AC-1)
    lag_frame = df[
        [
            "ward_id",
            "city",
            "_week_date",
            "avg_temp_c",
            "max_temp_c",
            "min_temp_c",
            "rainfall_mm",
            "relative_humidity_pct",
            "dengue_cases",
        ]
    ].rename(columns={"_week_date": "week"})
    dataset_corrs, ward_corrs = compute_all_lag_correlations(lag_frame, max_lag=8)
    peak_counts: dict[int, int] = {}
    for _wid, vals in ward_corrs.items():
        pk = int(np.argmax(vals))
        peak_counts[pk] = peak_counts.get(pk, 0) + 1

    # Retraining recommendation
    phase1_identical = (
        comparison["added_keys_count"] == 0
        and comparison["removed_keys_count"] == 0
        and comparison["total_differing_cells_on_shared_cols"] == 0
    )
    recommendation = "KEEP_PHASE1_MODEL_AS_IS" if phase1_identical else "RETRAIN_REQUIRED"

    return {
        "onsite_file": {
            "path": str(onsite_path.relative_to(REPO_ROOT).as_posix()),
            "bytes": int(onsite_path.stat().st_size),
            "sha256": onsite_sha,
            "sheetnames": onsite_sheets,
            "active_sheet": onsite_sheet,
            "shape": [int(df_raw.shape[0]), int(df_raw.shape[1])],
            "columns": raw_columns,
            "dtypes": raw_dtypes,
            "nulls": raw_nulls,
            "total_nulls": int(sum(raw_nulls.values())),
            "duplicate_ward_week_keys": dup_keys,
            "duplicate_full_rows": dup_full_rows,
            "date_min": min_date.isoformat(),
            "date_max": max_date.isoformat(),
            "non_monday_rows": non_mondays,
            "non_consecutive_gaps": non_consecutive_gaps,
            "iso_week_53_rows": iso_week_53_rows,
            "iso_week_53_dates": iso_week_53_dates,
            "total_wards": int(df["ward_id"].nunique()),
            "total_cities": int(df["city"].nunique()),
            "weeks_per_ward_min": int(weeks_per_ward_series.min()),
            "weeks_per_ward_max": int(weeks_per_ward_series.max()),
            "city_breakdown": city_breakdown,
            "canonical_iso_week_check": int(canonical_iso_week(date(2020, 12, 28))),
        },
        "phase1_file": {
            "path": str(phase1_path.relative_to(REPO_ROOT).as_posix()),
            "bytes": int(phase1_path.stat().st_size),
            "sha256": p1_sha,
            "sheetnames": p1_sheets,
            "active_sheet": p1_sheet,
        },
        "phase1_comparison": comparison,
        "supply_profiles": supply_profiles,
        "capacity_column_scan": {
            "keywords_checked": sorted(CAPACITY_TOKEN_KEYWORDS),
            "matching_columns": capacity_matches,
            "status": "present" if capacity_matches else "absent",
            "derived_p95_x_1_10_preview": capacity_derivation_preview,
        },
        "phase1_assumptions_check": {
            "static_ward_factors": static_checks,
            "deseasonalized_rain_case_lags": {
                "pooled_60_ward": {str(k): dataset_corrs[k] for k in range(len(dataset_corrs))},
                "pooled_peak_lag": int(np.argmax(dataset_corrs)),
                "dscc_ward_07": {
                    str(k): ward_corrs["DSCC_Ward_07"][k] for k in range(len(ward_corrs["DSCC_Ward_07"]))
                }
                if "DSCC_Ward_07" in ward_corrs
                else {},
                "per_ward_peak_lag_counts": {str(k): v for k, v in sorted(peak_counts.items())},
            },
        },
        "recommendation": {
            "decision": recommendation,
            "phase1_features_and_target_byte_identical": phase1_identical,
            "reason": (
                "All 31,320 rows, 60 wards, 522 ISO weeks (2016-01-04..2025-12-29), weather, static "
                "ward vulnerability factors, and dengue_cases are 100% identical to Phase 1; only the "
                "3 supply columns were appended. Keep the Phase 1 LightGBM artifact as-is and fit "
                "supply ratios / bed capacity from 2016-2022 only."
                if phase1_identical
                else "Differences detected against Phase 1 observations; retrain with npm run train."
            ),
        },
    }


def _print_human_summary(report: dict[str, Any]) -> None:
    o = report["onsite_file"]
    cmp = report["phase1_comparison"]
    sys.stdout.write(
        f"Onsite dataset: {o['path']} (SHA-256: {o['sha256']})\n"
        f"Shape: {o['shape'][0]:,} rows x {o['shape'][1]} cols | "
        f"Dates: {o['date_min']}..{o['date_max']} | "
        f"Wards: {o['total_wards']} across {o['total_cities']} cities | "
        f"Weeks/ward: {o['weeks_per_ward_min']}..{o['weeks_per_ward_max']}\n"
        f"Nulls: {o['total_nulls']} | Dup (ward,week): {o['duplicate_ward_week_keys']} | "
        f"Non-Mondays: {o['non_monday_rows']} | Gaps: {o['non_consecutive_gaps']}\n"
        f"Phase 1 diff: added_cols={cmp['added_columns']} removed_cols={cmp['removed_columns']} | "
        f"added_keys={cmp['added_keys_count']} removed_keys={cmp['removed_keys_count']} | "
        f"differing_cells_on_shared_cols={cmp['total_differing_cells_on_shared_cols']}\n"
        f"Capacity/crew/stock columns: {report['capacity_column_scan']['status']} "
        f"({report['capacity_column_scan']['matching_columns']})\n"
        f"Pooled lag peak: k={report['phase1_assumptions_check']['deseasonalized_rain_case_lags']['pooled_peak_lag']} "
        f"(r={report['phase1_assumptions_check']['deseasonalized_rain_case_lags']['pooled_60_ward'][str(report['phase1_assumptions_check']['deseasonalized_rain_case_lags']['pooled_peak_lag'])]})\n"
        f"Recommendation: {report['recommendation']['decision']}\n"
    )
    for col, sp in report["supply_profiles"].items():
        fit_all = sp["fit_all_2016_2025"]
        fit_tr = sp["fit_train_2016_2022"]
        sys.stdout.write(
            f"  {col}: mean={sp['distribution']['mean']} max={sp['distribution']['max']} | "
            f"all OLS y={fit_all['ols']['slope']:.4f}x + {fit_all['ols']['intercept']:.4f} (R2={fit_all['ols']['r2']:.6f}, resid_sd={fit_all['ols']['residual_sd']:.4f}) | "
            f"2016-2022 origin slope={fit_tr['ols_through_origin']['slope']:.4f} (R2={fit_tr['ols_through_origin']['r2']:.6f}) | "
            f"exact_round={fit_all['ols_through_origin']['exact_round_match_pct']}%\n"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only profile of the Phase 2 onsite dataset.")
    parser.add_argument("--onsite", type=Path, default=DEFAULT_ONSITE_PATH)
    parser.add_argument("--phase1", type=Path, default=DEFAULT_PHASE1_PATH)
    parser.add_argument("--json", action="store_true", help="Print full JSON report to stdout")
    args = parser.parse_args(argv)

    report = profile_onsite(onsite_path=args.onsite, phase1_path=args.phase1)
    if args.json:
        sys.stdout.write(json.dumps(report, indent=2) + "\n")
    else:
        _print_human_summary(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
