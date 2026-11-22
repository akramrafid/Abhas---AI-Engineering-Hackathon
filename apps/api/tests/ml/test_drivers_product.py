"""Verify SHAP grouped multiplicative driver product invariant within 1% across wards & horizons."""

from __future__ import annotations

import math
from datetime import date

import pandas as pd

from app.adapters.lgbm_model import load_model
from app.core.config import get_settings
from app.shared.drivers import (
    ALL_DRIVER_KEYS,
    contributions_to_drivers_with_other,
    group_driver_log_sums,
    group_driver_multipliers,
)
from app.shared.features import (
    FEATURE_COLUMNS,
    VALID_HORIZONS,
    build_serving_features,
    normalize_observation_columns,
)

# Sampled across all 5 cities and across monsoon peak + dry pre-monsoon weeks
SAMPLED_WARDS: tuple[str, ...] = (
    "DNCC_Ward_01",
    "DNCC_Ward_09",
    "DNCC_Ward_19",
    "DSCC_Ward_04",
    "DSCC_Ward_08",
    "DSCC_Ward_12",
    "CCC_Ward_01",
    "CCC_Ward_05",
    "GCC_Ward_02",
    "GCC_Ward_03",
    "NCC_Ward_01",
    "NCC_Ward_05",
)
SAMPLED_ORIGINS: tuple[date, ...] = (
    date(2024, 2, 12),  # dry off-season
    date(2024, 5, 27),  # pre-monsoon scenario baseline
    date(2024, 7, 29),  # peak monsoon surge
    date(2025, 8, 11),  # peak monsoon surge (year 2)
)


def _load_obs_df() -> pd.DataFrame:
    settings = get_settings()
    raw = pd.read_excel(settings.raw_dataset_path, sheet_name=settings.raw_dataset_sheet)
    return normalize_observation_columns(raw).sort_values(["ward_id", "week"]).reset_index(drop=True)


def test_shap_grouped_drivers_multiply_back_to_prediction_within_1pct() -> None:
    """Base * prod(8 grouped multipliers) and Base * prod(top-4) * other match expected_cases within 1%."""
    settings = get_settings()
    model = load_model(settings.model_path)
    df = _load_obs_df()
    feat_cols = list(FEATURE_COLUMNS)

    checked = 0
    for origin_week in SAMPLED_ORIGINS:
        for h in VALID_HORIZONS:
            feat_df = build_serving_features(
                df,
                origin_week=origin_week,
                horizon=h,
                ward_ids=SAMPLED_WARDS,
                rain_normals=model.rain_normals,
            )
            rows = [
                {col: float(v) for col, v in zip(feat_cols, vals, strict=True)}
                for vals in feat_df[feat_cols].to_numpy(dtype=float)
            ]
            decomps = model.predict_shap_decomposition(rows, horizon=h)
            preds = model.predict(rows, horizon=h)

            for wid, (expected_raw, base_margin, contribs), pf in zip(
                feat_df["ward_id"].tolist(), decomps, preds, strict=True
            ):
                base_cases = math.exp(base_margin)

                # 1) All 8 canonical driver groups
                all_mults = group_driver_multipliers(contribs, horizon=h)
                assert set(all_mults.keys()) == set(ALL_DRIVER_KEYS)
                reconstructed_all = base_cases * math.prod(all_mults.values())
                rel_err_all = abs(reconstructed_all - expected_raw) / max(expected_raw, 1e-9)
                assert rel_err_all < 0.01, (
                    f"8-group SHAP product error {rel_err_all:.4%} >= 1% for {wid} {origin_week} h={h} "
                    f"(reconstructed={reconstructed_all:.6f}, expected={expected_raw:.6f})"
                )

                # 2) Top-4 displayed drivers + "other" bucket
                log_sums = group_driver_log_sums(contribs, horizon=h)
                top4, other_mult = contributions_to_drivers_with_other(contribs, horizon=h, top_k=4)
                assert len(top4) <= 4
                top4_mult = math.prod(math.exp(log_sums[d.key]) for d in top4)
                reconstructed_top4_other = base_cases * top4_mult * other_mult
                rel_err_top4 = abs(reconstructed_top4_other - expected_raw) / max(expected_raw, 1e-9)
                assert rel_err_top4 < 0.01, (
                    f"top4+other SHAP product error {rel_err_top4:.4%} >= 1% for {wid} {origin_week} h={h}"
                )

                # 3) Rounded UI percentages on active predictions (>= 1 case) also stay within 1%
                if expected_raw >= 1.0:
                    ui_top4_mult = math.prod(1.0 + d.effect_pct / 100.0 for d in top4)
                    reconstructed_ui = base_cases * ui_top4_mult * other_mult
                    rel_err_ui = abs(reconstructed_ui - pf.expected_cases) / max(pf.expected_cases, 1e-9)
                    assert rel_err_ui < 0.01, (
                        f"UI rounded top4+other error {rel_err_ui:.4%} >= 1% for {wid} {origin_week} h={h}"
                    )

                checked += 1

    assert checked == len(SAMPLED_WARDS) * len(SAMPLED_ORIGINS) * len(VALID_HORIZONS)
