"""Validation vertical slice tests (AC-14)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.runtime import get_validation_payload
from app.core.errors import AppError
from app.features.validation.service import ValidationService
from app.main import create_app


def test_ac_14_validation_endpoint_metrics_coverage_confusion() -> None:
    """AC-14: GET /api/v1/validation returns MAE/RMSE vs all baselines, 80% coverage, and confusion matrix."""
    with TestClient(create_app()) as c:
        r = c.get("/api/v1/validation")
        assert r.status_code == 200
        assert "etag" in r.headers
        assert "max-age=" in r.headers.get("cache-control", "")
        body = r.json()

        assert body["model_version"].startswith("abhas-lgbm-")
        models_present = {m["model"] for m in body["metrics"]}
        assert models_present == {
            "lightgbm",
            "lightgbm_no_weather",
            "negbin_glm",
            "climatology",
            "seasonal_naive",
            "persistence",
        }
        periods = {m["period"] for m in body["metrics"]}
        assert {"2019", "2020", "2021", "2022", "tune_2023", "holdout_2024_2025"}.issubset(periods)
        assert len(body["coverage"]) >= 4 * 6
        conf = body["confusion"]
        assert conf["labels"] == ["Low", "Medium", "High", "Critical"]
        assert len(conf["matrix"]) == 4 and all(len(row) == 4 for row in conf["matrix"])
        assert 0.0 <= conf["within_one_tier"] <= 1.0
        assert 0.0 <= conf["critical_recall"] <= 1.0
        assert body["holdout_locked_sha256"]

        # ETag 304 support
        r304 = c.get("/api/v1/validation", headers={"If-None-Match": r.headers["etag"]})
        assert r304.status_code == 304


def test_validation_missing_file_returns_503(tmp_path: Path) -> None:
    svc = ValidationService(loader=lambda: get_validation_payload(tmp_path / "missing_validation.json"))
    with pytest.raises(AppError) as exc:
        svc.get_validation()
    assert exc.value.status == 503
    assert exc.value.slug == "validation-unavailable"
