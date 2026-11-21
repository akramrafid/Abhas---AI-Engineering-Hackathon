"""Tests for app/shared/features.py: AC-2 grouped lags, zero leakage, ISO week 53, lag correlations."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.core.config import get_settings
from app.shared.features import (
    FEATURE_COLUMNS,
    MAX_RAIN_LAG,
    build_features,
    build_serving_features,
    compute_lag_correlations,
    fit_rain_normals,
    iso_week_cyclical,
    normalize_observation_columns,
)


def _synthetic_two_ward_df(n_weeks: int = 20, start: date = date(2023, 1, 2)) -> pd.DataFrame:
    rows = []
    for i in range(n_weeks):
        wk = start + timedelta(weeks=i)
        rows.append(
            {
                "date": wk,
                "city": "Dhaka South",
                "ward_id": "DSCC_Ward_01",
                "population_density_sqkm": 50000.0,
                "water_logging_risk_index": 0.80,
                "sanitation_score": 0.40,
                "avg_temp_C": 25.0 + 0.2 * i,  # rubric uppercase C
                "max_temp_c": 29.0 + 0.2 * i,
                "min_temp_c": 21.0 + 0.2 * i,
                "rainfall_mm": 1000.0 + float(i),  # distinct magnitude for Ward A
                "relative_humidity_pct": 70.0 + 0.5 * i,
                "dengue_cases": i,
            }
        )
        rows.append(
            {
                "date": wk,
                "city": "Dhaka North",
                "ward_id": "DNCC_Ward_01",
                "population_density_sqkm": 30000.0,
                "water_logging_risk_index": 0.35,
                "sanitation_score": 0.75,
                "avg_temp_C": 20.0 + 0.1 * i,
                "max_temp_c": 24.0 + 0.1 * i,
                "min_temp_c": 16.0 + 0.1 * i,
                "rainfall_mm": 1.0 + float(i),  # small distinct magnitude for Ward B
                "relative_humidity_pct": 50.0 + 0.25 * i,
                "dengue_cases": 2 * i,
            }
        )
    df = pd.DataFrame(rows)
    # Intentionally shuffle rows to prove sorting + grouping is enforced internally
    return df.sample(frac=1.0, random_state=42).reset_index(drop=True)


def test_ac_2_lags_grouped_by_ward() -> None:
    """AC-2: avg_temp_C normalized, zero nulls, first k lag rows NaN per ward,
    zero cross-ward contamination, and zero future (> origin_week) leakage."""
    raw = _synthetic_two_ward_df(n_weeks=20)
    feats = build_features(raw, horizon=3)

    # Column normalization & non-null source weather
    for col in ("avg_temp_c", "rainfall_mm", "relative_humidity_pct"):
        assert col in feats.columns
        assert int(feats[col].isna().sum()) == 0

    for col in FEATURE_COLUMNS:
        assert col in feats.columns

    # First k rows of every lag-k feature MUST be NaN for EVERY ward
    for wid, g in feats.groupby("ward_id"):
        g = g.sort_values("week").reset_index(drop=True)
        assert len(g) == 20
        for k in range(MAX_RAIN_LAG + 1):
            col = f"rainfall_lag_{k}"
            assert g[col].iloc[:k].isna().all(), f"{wid} {col} first {k} rows must be NaN"
            assert g[col].iloc[k:].notna().all(), f"{wid} {col} rows from {k} onward must be non-null"
            if k > 0:
                np.testing.assert_allclose(
                    g[col].iloc[k:].to_numpy(),
                    g["rainfall_mm"].iloc[:-k].to_numpy(),
                )
        for k in range(4):
            for base, prefix in (("avg_temp_c", "temp_lag"), ("relative_humidity_pct", "humidity_lag")):
                col = f"{prefix}_{k}"
                assert g[col].iloc[:k].isna().all()
                assert g[col].iloc[k:].notna().all()
                if k > 0:
                    np.testing.assert_allclose(
                        g[col].iloc[k:].to_numpy(),
                        g[base].iloc[:-k].to_numpy(),
                    )
        assert g["rain_sum_0_3"].iloc[:3].isna().all()
        assert g["rain_sum_0_3"].iloc[3:].notna().all()
        assert g["rain_sum_4_7"].iloc[:7].isna().all()
        assert g["rain_sum_4_7"].iloc[7:].notna().all()
        assert g["temp_mean_4w"].iloc[:3].isna().all()
        assert g["humidity_mean_4w"].iloc[:3].isna().all()

    # Zero cross-ward contamination: DNCC_Ward_01 rainfall is in [1, 20], never >= 1000
    dncc = feats[feats["ward_id"] == "DNCC_Ward_01"]
    for k in range(MAX_RAIN_LAG + 1):
        vals = dncc[f"rainfall_lag_{k}"].dropna()
        assert (vals < 100.0).all(), f"Cross-ward leakage into DNCC rainfall_lag_{k}"
    assert (dncc["rain_sum_0_3"].dropna() < 100.0).all()
    assert (dncc["rain_sum_4_7"].dropna() < 100.0).all()

    # Zero future (> origin_week) leakage: mutating rows after origin_week must change NOTHING <= origin_week
    origin = date(2023, 3, 27)  # week index 12
    clean = build_features(raw, horizon=3, origin_week=origin)
    poisoned = raw.copy()
    future_mask = pd.to_datetime(poisoned["date"]).dt.date > origin
    assert future_mask.any()
    poisoned.loc[future_mask, "rainfall_mm"] = 99999.0
    poisoned.loc[future_mask, "avg_temp_C"] = 99.0
    poisoned.loc[future_mask, "relative_humidity_pct"] = 99.0
    from_poisoned = build_features(poisoned, horizon=3, origin_week=origin)

    assert (clean["week"] <= origin).all()
    pd.testing.assert_frame_equal(clean, from_poisoned)


def test_null_weather_column_rejected() -> None:
    raw = _synthetic_two_ward_df(n_weeks=10)
    raw.loc[0, "rainfall_mm"] = np.nan
    with pytest.raises(ValueError, match="rainfall_mm"):
        normalize_observation_columns(raw)

    raw2 = _synthetic_two_ward_df(n_weeks=10)
    raw2.loc[1, "avg_temp_C"] = np.nan
    with pytest.raises(ValueError, match="avg_temp_c"):
        build_features(raw2, horizon=1)


def test_rain_normals_train_years_only_and_iso_week_53() -> None:
    # Span across 2020-12-28 (ISO week 53!) and 2024 (test year)
    weeks_2020 = [date(2020, 12, 14) + timedelta(weeks=i) for i in range(6)]  # includes 2020-12-28 (W53)
    weeks_2024 = [date(2024, 12, 16) + timedelta(weeks=i) for i in range(4)]
    rows = []
    for wk in weeks_2020 + weeks_2024:
        rows.append(
            {
                "ward_id": "DSCC_Ward_07",
                "week": wk,
                "population_density_sqkm": 50000.0,
                "water_logging_risk_index": 0.8,
                "sanitation_score": 0.4,
                "avg_temp_c": 22.0,
                "rainfall_mm": 10.0 if wk.year <= 2023 else 400.0,
                "relative_humidity_pct": 65.0,
            }
        )
    df = pd.DataFrame(rows)
    normals = fit_rain_normals(df, max_year=2023)
    # 2024 values (400.0) must NEVER influence normals fit with max_year=2023
    assert all(v == pytest.approx(10.0) for v in normals.values())
    # ISO week 53 folded cleanly into 52
    assert date(2020, 12, 28).isocalendar().week == 53
    sin53, cos53 = iso_week_cyclical(date(2020, 12, 28))
    sin52, cos52 = iso_week_cyclical(date(2020, 12, 21))
    assert (sin53, cos53) == (sin52, cos52)
    assert -1.0 <= sin53 <= 1.0 and -1.0 <= cos53 <= 1.0

    df_2020 = df.loc[df["week"].isin(weeks_2020)].reset_index(drop=True)
    df_2024 = df.loc[df["week"].isin(weeks_2024)].reset_index(drop=True)
    for slice_df in (df_2020, df_2024):
        feats = build_features(slice_df, horizon=2, rain_normals=normals)
        assert feats["rain_anomaly"].notna().all()
        assert feats["iso_week_sin"].notna().all()
        assert feats["iso_week_cos"].notna().all()


def test_serving_features_weather_override_is_isolated() -> None:
    raw = _synthetic_two_ward_df(n_weeks=15)
    raw_copy = raw.copy(deep=True)
    origin = date(2023, 3, 27)
    base = build_serving_features(raw, origin_week=origin, horizon=3, ward_ids=["DSCC_Ward_01"])
    over = build_serving_features(
        raw,
        origin_week=origin,
        horizon=3,
        ward_ids=["DSCC_Ward_01"],
        weather_override={"rainfall_mm": 120.0},
    )
    assert len(base) == 1 and len(over) == 1
    assert float(over.loc[0, "rainfall_lag_0"]) == pytest.approx(120.0)
    assert float(over.loc[0, "rainfall_lag_1"]) == pytest.approx(float(base.loc[0, "rainfall_lag_1"]))
    assert float(over.loc[0, "rain_sum_4_7"]) == pytest.approx(float(base.loc[0, "rain_sum_4_7"]))
    # Original input frame not mutated
    pd.testing.assert_frame_equal(raw, raw_copy)


def test_real_dataset_lags_and_peak_at_lag_3() -> None:
    settings = get_settings()
    df = pd.read_excel(settings.raw_dataset_path, sheet_name=settings.raw_dataset_sheet)
    res = compute_lag_correlations(df, ward_id="DSCC_Ward_07", max_lag=8)
    assert len(res.correlations) == 9
    assert res.peak_lag_dataset == 3
    assert res.peak_lag_ward == 3
    assert res.correlations[3].dataset_corr == pytest.approx(0.4679, abs=0.01)

    # Also verify first k lag rows are NaN across all 60 real wards
    feats = build_features(df, horizon=3)
    assert len(feats) == 31_320
    assert int(feats["rainfall_lag_3"].isna().sum()) == 60 * 3
    assert int(feats["rainfall_lag_8"].isna().sum()) == 60 * 8


def test_build_features_with_separate_wards_df() -> None:
    raw = _synthetic_two_ward_df(n_weeks=12)
    static_cols = ["population_density_sqkm", "water_logging_risk_index", "sanitation_score"]
    wards_df = raw[["ward_id", *static_cols]].drop_duplicates(subset=["ward_id"])
    obs_only = raw.drop(columns=static_cols)
    feats = build_features(obs_only, wards_df=wards_df, horizon=2)
    assert len(feats) == 24
    for col in static_cols:
        assert int(feats[col].isna().sum()) == 0


def test_cr_7_non_consecutive_weeks_raises() -> None:
    """CR-7: Dropped week for any ward raises ValueError before positional lag shifts."""
    raw = _synthetic_two_ward_df(n_weeks=15)
    drop_week = date(2023, 1, 2) + timedelta(weeks=5)
    gapped = raw.loc[
        ~((raw["ward_id"] == "DSCC_Ward_01") & (pd.to_datetime(raw["date"]).dt.date == drop_week))
    ].reset_index(drop=True)

    with pytest.raises(ValueError, match="non-consecutive|Non-consecutive"):
        build_features(gapped, horizon=3)

    with pytest.raises(ValueError, match="non-consecutive|Non-consecutive"):
        compute_lag_correlations(gapped, ward_id="DSCC_Ward_01", max_lag=8)
