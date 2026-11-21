"""Tests for GPU probe, purged chronological folds, artifact size, and metadata completeness."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pandas as pd

from app.adapters.lgbm_model import compute_file_sha256
from app.core.config import get_settings
from ml.gpu_probe import format_report, run_probe
from ml.train import purge_fold_split


def test_gpu_probe_runs_cleanly_and_formats_report() -> None:
    report = run_probe()
    text = format_report(report)
    assert "Abhas GPU Training Probe" in text
    assert "LightGBM GPU" in text
    assert "XGBoost CUDA" in text
    assert isinstance(report.lightgbm_gpu.usable, bool)
    assert isinstance(report.xgboost_cuda.usable, bool)


def test_purge_fold_split_drops_all_rows_on_or_after_first_test_week() -> None:
    """Purge guarantees zero target-week overlap between train and test folds (ADR-0004)."""
    start = date(2018, 12, 3)
    rows = []
    for i in range(12):
        tw = start + timedelta(weeks=i)
        rows.append(
            {
                "ward_id": "DSCC_Ward_01",
                "week": tw - timedelta(weeks=3),
                "target_week": tw,
                "target_year": tw.year,
                "y": float(i),
            }
        )
    sup = pd.DataFrame(rows)
    tr, te, first_test_week = purge_fold_split(sup, test_years=(2019,))
    assert first_test_week == date(2019, 1, 7)
    assert not tr.empty and not te.empty
    assert max(tr["target_week"].tolist()) < first_test_week
    assert min(te["target_week"].tolist()) == first_test_week


def test_committed_artifact_versioned_copy_size_and_metadata() -> None:
    """Committed joblib bundle is < 20 MB, matches versioned copy SHA-256, and logs full provenance."""
    settings = get_settings()
    model_path = settings.model_path
    meta_path = model_path.parent / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    assert model_path.stat().st_size < 20 * 1024 * 1024
    versioned_file = meta.get("versioned_artifact_file")
    assert versioned_file and versioned_file.startswith("abhas-")
    versioned_path = model_path.parent / versioned_file
    assert versioned_path.exists()
    assert compute_file_sha256(versioned_path) == compute_file_sha256(model_path) == meta["sha256"]

    for key in (
        "model_version",
        "sha256",
        "library_versions",
        "device",
        "train_seconds",
        "best_params",
        "fold_metrics",
        "rain_normals",
        "max_normal_year",
        "train_end_year",
        "feature_names",
    ):
        assert key in meta, f"metadata.json missing required key {key}"
    assert meta["max_normal_year"] == 2023
    assert meta["train_end_year"] == 2023
