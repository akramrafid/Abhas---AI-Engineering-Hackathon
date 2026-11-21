"""Model artifact, monotonicity, calibration, driver, tier, and NFR-1 latency tests."""

from __future__ import annotations

import json
import shutil
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

from app.adapters.lgbm_model import ModelArtifactError, compute_file_sha256, load_model
from app.adapters.runtime import check_model_readiness, reset_runtime
from app.core.config import get_settings
from app.shared.drivers import contributions_to_drivers
from app.shared.features import (
    FEATURE_COLUMNS,
    build_serving_features,
    canonical_iso_week,
    normalize_observation_columns,
)
from app.shared.tiers import (
    DEFAULT_TIER_CUTOFFS,
    HorizonCalibration,
    compute_bands_and_risk_vectorized,
    escalate_tier,
    peak_tier,
    tier_from_cases,
)


def _load_dataset_df():
    import pandas as pd

    settings = get_settings()
    raw = pd.read_excel(settings.raw_dataset_path, sheet_name=settings.raw_dataset_sheet)
    return normalize_observation_columns(raw).sort_values(["ward_id", "week"]).reset_index(drop=True)


def test_ac_3_model_artifact_sha256_and_invariants() -> None:
    """AC-3: Committed joblib artifact passes SHA-256 verification and returns valid deterministic forecasts."""
    settings = get_settings()
    model = load_model(settings.model_path)
    assert tuple(model.feature_names) == FEATURE_COLUMNS
    assert model.version.startswith("abhas-lgbm-")

    sample_row = {name: 10.0 for name in FEATURE_COLUMNS}
    for h in (1, 2, 3, 4):
        out1 = model.predict([sample_row], horizon=h)[0]
        out2 = model.predict([sample_row], horizon=h)[0]
        assert out1 == out2
        assert 0.0 <= out1.p10 <= out1.expected_cases <= out1.p90
        assert 0 <= out1.risk_score <= 100
        assert out1.tier in ("Low", "Medium", "High", "Critical")
        assert len(out1.contributions) == len(FEATURE_COLUMNS)


def test_cr_5_cr_13_artifact_metadata_stores_normals_and_train_end_year() -> None:
    """CR-5 / CR-13: metadata.json stores train_end_year, max_normal_year, rain_normals, and no_weather_mae."""
    settings = get_settings()
    meta_path = settings.model_path.parent / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    assert meta["train_end_year"] == 2023
    assert meta["max_normal_year"] == 2023
    assert len(meta["sha256"]) == 64
    assert meta["sha256"] == compute_file_sha256(settings.model_path)
    assert set(meta["no_weather_mae"].keys()) == {"1", "2", "3", "4"}
    assert isinstance(meta["rain_normals"], dict)
    assert len(meta["rain_normals"]) >= 60 * 52

    model = load_model(settings.model_path)
    assert model.train_end_year == 2023
    assert model.max_normal_year == 2023
    assert len(model.rain_normals) >= 60 * 52


def test_cr_16_model_readiness_check_passes_and_rejects_corrupt_or_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """CR-16: check_model_readiness verifies SHA-256 and loads once; missing/corrupt fails fast (503)."""
    reset_runtime()
    try:
        status = check_model_readiness()
        assert status["ok"] is True
        assert status["model_loads"] == 1
        assert len(status["sha256"]) == 64
        # Second call reuses the singleton (model_loads remains 1)
        status2 = check_model_readiness()
        assert status2["model_loads"] == 1

        # Missing artifact fails with 503 ModelArtifactError
        missing_path = tmp_path / "missing.joblib"
        monkeypatch.setenv("MODEL_PATH", str(missing_path))
        get_settings.cache_clear()
        reset_runtime()
        with pytest.raises(ModelArtifactError) as exc_missing:
            check_model_readiness()
        assert exc_missing.value.status == 503

        # Corrupted artifact SHA-256 fails with 503 ModelArtifactError
        orig_model = Path(__file__).resolve().parents[1] / "ml" / "artifacts" / "current.joblib"
        orig_meta = orig_model.parent / "metadata.json"
        bad_model = tmp_path / "current.joblib"
        shutil.copy2(orig_meta, tmp_path / "metadata.json")
        bad_model.write_bytes(b"corrupted-joblib-bytes")
        monkeypatch.setenv("MODEL_PATH", str(bad_model))
        get_settings.cache_clear()
        reset_runtime()
        with pytest.raises(ModelArtifactError) as exc_corrupt:
            check_model_readiness()
        assert exc_corrupt.value.status == 503
        assert "SHA-256" in (exc_corrupt.value.detail or "")
    finally:
        monkeypatch.delenv("MODEL_PATH", raising=False)
        get_settings.cache_clear()
        reset_runtime()


def test_ac_7_monotone_rainfall_all_60_wards() -> None:
    """AC-7: Setting rainfall_mm=120 on a non-Critical <20 mm week strictly increases h=3 cases across all 60 wards."""
    settings = get_settings()
    model = load_model(settings.model_path)
    df = _load_dataset_df()
    # Pick a dry-to-early-monsoon week in 2025 where wards have low rainfall (<20 mm)
    origin_week = date(2025, 5, 5)
    target_iso = canonical_iso_week(origin_week + timedelta(weeks=3))
    wards = sorted(df["ward_id"].unique().tolist())
    assert len(wards) == 60

    # Ensure baseline origin rainfall is <= 15 mm for this monotonicity check across all 60 wards
    base_df = build_serving_features(
        df,
        origin_week=origin_week,
        horizon=3,
        ward_ids=wards,
        rain_normals=model.rain_normals,
        weather_override={"rainfall_mm": 10.0},
    )
    scen_df = build_serving_features(
        df,
        origin_week=origin_week,
        horizon=3,
        ward_ids=wards,
        rain_normals=model.rain_normals,
        weather_override={"rainfall_mm": 120.0},
    )
    feat_cols = list(FEATURE_COLUMNS)
    base_rows = [
        {c: float(v) for c, v in zip(feat_cols, row, strict=True)}
        for row in base_df[feat_cols].to_numpy(dtype=float)
    ]
    scen_rows = [
        {c: float(v) for c, v in zip(feat_cols, row, strict=True)}
        for row in scen_df[feat_cols].to_numpy(dtype=float)
    ]
    wids = [str(w) for w in base_df["ward_id"].tolist()]
    base_preds = model.predict(base_rows, 3, ward_ids=wids, target_iso_weeks=[target_iso] * len(wids))
    scen_preds = model.predict(scen_rows, 3, ward_ids=wids, target_iso_weeks=[target_iso] * len(wids))

    for wid, bp, sp in zip(wids, base_preds, scen_preds, strict=True):
        assert sp.expected_cases > bp.expected_cases, (
            f"AC-7 monotonicity failed for {wid}: base={bp.expected_cases}, scen={sp.expected_cases}"
        )


def test_nfr_1_single_ward_inference_under_50ms() -> None:
    """NFR-1: In-process single-ward inference across all 4 horizons meets p95 < 50 ms."""
    settings = get_settings()
    model = load_model(settings.model_path)
    row = {name: 15.0 for name in FEATURE_COLUMNS}
    # Warm-up
    for h in (1, 2, 3, 4):
        model.predict([row], horizon=h)

    timings_ms: list[float] = []
    for _ in range(30):
        t0 = time.perf_counter()
        for h in (1, 2, 3, 4):
            model.predict([row], horizon=h)
        timings_ms.append((time.perf_counter() - t0) * 1000.0)
    p95 = float(np.percentile(timings_ms, 95))
    assert p95 < 50.0, f"Single-ward 4-horizon p95={p95:.2f} ms exceeded 50 ms NFR-1 budget"


def test_drivers_grouping_and_multiplicative_pct() -> None:
    contribs = {
        "rainfall_lag_0": 0.40,  # for h=3 -> lag_before_target=3 -> rain_2_4w
        "rainfall_lag_1": 0.10,  # for h=3 -> lag_before_target=4 -> rain_2_4w (total 0.50 -> +64.9%)
        "water_logging_risk_index": 0.30,  # +35.0%
        "sanitation_score": -0.20,  # -18.1%
        "temp_lag_0": 0.05,
        "humidity_lag_0": 0.02,
    }
    drivers = contributions_to_drivers(contribs, horizon=3, top_k=4)
    assert len(drivers) == 4
    assert drivers[0].key == "rain_2_4w"
    assert drivers[0].direction == "up"
    assert drivers[0].effect_pct == pytest.approx(64.9, abs=0.2)
    assert any(d.key == "sanitation" and d.direction == "down" for d in drivers)


def test_tiers_bands_and_escalation() -> None:
    cal = HorizonCalibration(nb_r=4.0, conformal_scale=1.5)
    p10, p90, risk = compute_bands_and_risk_vectorized(np.array([0.0, 2.0, 9.0, 18.0]), cal)
    assert np.all(p10 >= 0.0)
    assert np.all(p10 <= np.array([0.0, 2.0, 9.0, 18.0]))
    assert np.all(p90 >= np.array([0.0, 2.0, 9.0, 18.0]))
    assert np.all((risk >= 0) & (risk <= 100))

    assert tier_from_cases(1.0, DEFAULT_TIER_CUTOFFS) == "Low"
    assert tier_from_cases(15.0, DEFAULT_TIER_CUTOFFS) == "Critical"
    tier, esc = escalate_tier("Medium", p90=10.0, epidemic_threshold=6.0)
    assert tier == "High" and esc is True
    tier_c, esc_c = escalate_tier("Critical", p90=30.0, epidemic_threshold=10.0)
    assert tier_c == "Critical" and esc_c is False
    assert peak_tier(["Low", "High", "Medium"]) == "High"
