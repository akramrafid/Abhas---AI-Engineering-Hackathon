"""LightGBM Poisson multi-horizon ForecastModel adapter (loaded once, SHA-256 verified)."""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.core.errors import AppError
from app.ports.forecast_model import PointForecast
from app.shared.features import FEATURE_COLUMNS, VALID_HORIZONS
from app.shared.tiers import (
    DEFAULT_TIER_CUTOFFS,
    EPIDEMIC_FLOOR,
    HorizonCalibration,
    compute_bands_and_risk_vectorized,
    decode_iso_week,
    escalate_tier,
    tier_from_cases,
    ward_fingerprint,
)


class ModelArtifactError(AppError):
    """Raised when the committed model artifact is missing, unreadable, or fails SHA-256 verification."""

    def __init__(self, detail: str) -> None:
        super().__init__(
            status=503,
            slug="model-unavailable",
            title="Model artifact unavailable",
            detail=detail,
        )


def compute_file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_artifact_integrity(
    model_path: Path,
    metadata_path: Path | None = None,
) -> dict[str, Any]:
    """Verify the serialized joblib artifact exists and matches its SHA-256 in metadata.json."""
    meta_file = metadata_path or (model_path.parent / "metadata.json")
    if not model_path.exists():
        raise ModelArtifactError(
            f"Model artifact not found at {model_path.name}; run npm run setup or npm run train."
        )
    if not meta_file.exists():
        raise ModelArtifactError(
            f"Model metadata not found at {meta_file.name}; run npm run setup or npm run train."
        )
    try:
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ModelArtifactError("Model metadata.json is unreadable or invalid JSON.") from exc

    expected_sha = str(meta.get("sha256") or "").strip().lower()
    if len(expected_sha) != 64:
        raise ModelArtifactError("Model metadata.json is missing a valid SHA-256 digest.")

    actual_sha = compute_file_sha256(model_path).lower()
    if not hmac.compare_digest(actual_sha, expected_sha):
        raise ModelArtifactError("Model artifact SHA-256 mismatch; file may be corrupted. Run npm run setup.")
    return dict(meta)


def _deserialize_calibration(raw: Any) -> HorizonCalibration:
    if isinstance(raw, HorizonCalibration):
        return raw
    if isinstance(raw, Mapping):
        return HorizonCalibration(
            nb_r=float(raw.get("nb_r", 5.0)),
            conformal_scale=float(raw.get("conformal_scale", 1.0)),
            conformal_add=float(raw.get("conformal_add", 0.0)),
            q_low=float(raw.get("q_low", 0.10)),
            q_high=float(raw.get("q_high", 0.90)),
            use_cqr=bool(raw.get("use_cqr", False)),
            cqr_q=float(raw.get("cqr_q", 0.0)),
            use_sigma_conformal=bool(raw.get("use_sigma_conformal", False)),
            z_low=float(raw.get("z_low", 0.75)),
            z_high=float(raw.get("z_high", 2.15)),
        )
    return HorizonCalibration(nb_r=5.0)


class LGBMForecastModel:
    """Implements app.ports.forecast_model.ForecastModel over a joblib LightGBM Poisson bundle."""

    def __init__(self, bundle: Mapping[str, Any], metadata: Mapping[str, Any] | None = None) -> None:
        self.version: str = str(bundle.get("model_version") or "abhas-lgbm-1.0.0")
        raw_features = bundle.get("feature_names") or FEATURE_COLUMNS
        self.feature_names: Sequence[str] = tuple(str(c) for c in raw_features)
        self._feature_index: dict[str, int] = {name: idx for idx, name in enumerate(self.feature_names)}
        self.metadata: dict[str, Any] = dict(metadata or {})
        self.train_end_year: int = int(
            bundle.get("train_end_year")
            or self.metadata.get("train_end_year")
            or self.metadata.get("train_max_year")
            or 2023
        )
        self.max_normal_year: int = int(
            bundle.get("max_normal_year") or self.metadata.get("max_normal_year") or self.train_end_year
        )

        raw_boosters = bundle.get("boosters") or {}
        self._boosters: dict[int, Any] = {int(h): b for h, b in raw_boosters.items()}
        for h in VALID_HORIZONS:
            if h not in self._boosters:
                raise ModelArtifactError(f"Model bundle is missing booster for horizon h={h}.")

        raw_cals = bundle.get("calibrations") or {}
        self.calibrations: dict[int, HorizonCalibration] = {
            int(h): _deserialize_calibration(raw_cals.get(h, raw_cals.get(str(h)))) for h in VALID_HORIZONS
        }

        raw_cqr_lo = bundle.get("cqr_low_boosters") or {}
        raw_cqr_hi = bundle.get("cqr_high_boosters") or {}
        self._cqr_low: dict[int, Any] = {int(h): b for h, b in raw_cqr_lo.items()}
        self._cqr_high: dict[int, Any] = {int(h): b for h, b in raw_cqr_hi.items()}

        cutoffs_raw = bundle.get("tier_cutoffs") or DEFAULT_TIER_CUTOFFS
        self.tier_cutoffs: tuple[float, float, float] = (
            float(cutoffs_raw[0]),
            float(cutoffs_raw[1]),
            float(cutoffs_raw[2]),
        )

        raw_normals = bundle.get("rain_normals") or {}
        if raw_normals:
            self.rain_normals: dict[tuple[str, int], float] = {
                (str(k[0]), int(k[1])): float(v) for k, v in raw_normals.items()
            }
        else:
            meta_normals = self.metadata.get("rain_normals") or {}
            parsed_normals: dict[tuple[str, int], float] = {}
            for k, v in meta_normals.items():
                if isinstance(k, str) and "|" in k:
                    wid, iw = k.rsplit("|", 1)
                    parsed_normals[(wid, int(iw))] = float(v)
            self.rain_normals = parsed_normals
        self.endemic_thresholds: dict[tuple[str, int], float] = {
            (str(k[0]), int(k[1])): float(v) for k, v in (bundle.get("endemic_thresholds") or {}).items()
        }
        self.ward_fingerprints: dict[tuple[float, float, float], str] = {
            (round(float(k[0]), 2), round(float(k[1]), 4), round(float(k[2]), 4)): str(v)
            for k, v in (bundle.get("ward_fingerprints") or {}).items()
        }
        self.ward_climatology: dict[tuple[str, int], dict[str, float]] = {
            (str(k[0]), int(k[1])): {str(ck): float(cv) for ck, cv in v.items()}
            for k, v in (bundle.get("ward_climatology") or {}).items()
        }

    def _rows_to_matrix(self, rows: Sequence[Mapping[str, float]]) -> np.ndarray:
        n_rows = len(rows)
        n_cols = len(self.feature_names)
        mat = np.empty((n_rows, n_cols), dtype=np.float64)
        fnames = self.feature_names
        for i, row in enumerate(rows):
            for j, fname in enumerate(fnames):
                val = row.get(fname, np.nan)
                mat[i, j] = float(val) if val is not None else np.nan
        return mat

    def _resolve_epidemic_threshold(
        self,
        row: Mapping[str, float],
        *,
        ward_id: str | None = None,
        iso_week: int | None = None,
    ) -> float:
        wid = ward_id
        if wid is None:
            fp = ward_fingerprint(
                row.get("population_density_sqkm", 0.0),
                row.get("water_logging_risk_index", 0.0),
                row.get("sanitation_score", 0.0),
            )
            wid = self.ward_fingerprints.get(fp)
        iw = iso_week
        if iw is None:
            iw = decode_iso_week(row.get("iso_week_sin", 0.0), row.get("iso_week_cos", 1.0))
        if wid is not None:
            return float(self.endemic_thresholds.get((wid, iw), EPIDEMIC_FLOOR))
        return EPIDEMIC_FLOOR

    def predict(
        self,
        rows: Sequence[Mapping[str, float]],
        horizon: int,
        *,
        ward_ids: Sequence[str] | None = None,
        target_iso_weeks: Sequence[int] | None = None,
        include_contributions: bool = True,
    ) -> list[PointForecast]:
        """Predict one horizon (1–4) for feature rows built by app/shared/features.py.

        Runs single-threaded (`num_threads=1`). Computes native TreeSHAP (`pred_contrib=True`)
        when `include_contributions=True`, or fast log-margin inference (`raw_score=True`) for
        batch counterfactual evaluation.
        """
        if horizon not in VALID_HORIZONS:
            raise ValueError(f"horizon must be in {VALID_HORIZONS}, got {horizon}")
        if not rows:
            return []

        X = self._rows_to_matrix(rows)
        booster = self._boosters[horizon]
        raw_contribs: np.ndarray | None = None
        if include_contributions:
            # Single-threaded native TreeSHAP returns (N, F + 1) in log-margin space; sum(row) == raw margin.
            raw_contribs = np.asarray(booster.predict(X, pred_contrib=True, num_threads=1), dtype=np.float64)
            if raw_contribs.ndim == 1:
                raw_contribs = raw_contribs.reshape(1, -1)
            raw_margin = np.sum(raw_contribs, axis=1)
        else:
            raw_margin = np.asarray(booster.predict(X, raw_score=True, num_threads=1), dtype=np.float64)
            if raw_margin.ndim == 0:
                raw_margin = raw_margin.reshape(1)
        expected_arr = np.maximum(0.0, np.exp(np.clip(raw_margin, -20.0, 10.0)))

        cal = self.calibrations[horizon]
        cqr_lo_arr: np.ndarray | None = None
        cqr_hi_arr: np.ndarray | None = None
        if cal.use_cqr and horizon in self._cqr_low and horizon in self._cqr_high:
            cqr_lo_arr = np.asarray(self._cqr_low[horizon].predict(X, num_threads=1), dtype=np.float64)
            cqr_hi_arr = np.asarray(self._cqr_high[horizon].predict(X, num_threads=1), dtype=np.float64)

        p10_arr, p90_arr, risk_arr = compute_bands_and_risk_vectorized(
            expected_arr,
            cal,
            high_cutoff=self.tier_cutoffs[1],
            cqr_p10=cqr_lo_arr,
            cqr_p90=cqr_hi_arr,
        )

        fnames = self.feature_names
        n_feats = len(fnames)
        results: list[PointForecast] = []
        for idx, row in enumerate(rows):
            mu = round(float(expected_arr[idx]), 4)
            p10 = round(float(p10_arr[idx]), 4)
            p90 = round(float(p90_arr[idx]), 4)
            # Re-enforce invariant after rounding so 0 <= p10 <= expected_cases <= p90 always holds.
            p10 = max(0.0, min(p10, mu))
            p90 = max(p90, mu)

            wid = ward_ids[idx] if ward_ids is not None else None
            iw = target_iso_weeks[idx] if target_iso_weeks is not None else None
            epi_thresh = self._resolve_epidemic_threshold(row, ward_id=wid, iso_week=iw)
            base_tier = tier_from_cases(mu, self.tier_cutoffs)
            tier, escalated = escalate_tier(base_tier, p90, epi_thresh)

            if raw_contribs is not None:
                shap_row = raw_contribs[idx, :n_feats]
                contribs = {fnames[j]: float(shap_row[j]) for j in range(n_feats)}
            else:
                contribs = {}
            results.append(
                PointForecast(
                    expected_cases=mu,
                    p10=p10,
                    p90=p90,
                    risk_score=int(risk_arr[idx]),
                    tier=tier,
                    tier_escalated=escalated,
                    contributions=contribs,
                )
            )
        return results

    def predict_shap_decomposition(
        self,
        rows: Sequence[Mapping[str, float]],
        horizon: int,
    ) -> list[tuple[float, float, dict[str, float]]]:
        """Return `(expected_cases, base_log_margin, feature_contributions)` per row.

        Exposes the TreeSHAP base value (`raw_contribs[:, -1]`) without altering `PointForecast`'s
        contract so tests can assert the multiplicative SHAP product invariant directly.
        """
        if horizon not in VALID_HORIZONS:
            raise ValueError(f"horizon must be in {VALID_HORIZONS}, got {horizon}")
        if not rows:
            return []
        X = self._rows_to_matrix(rows)
        booster = self._boosters[horizon]
        raw_contribs = np.asarray(booster.predict(X, pred_contrib=True, num_threads=1), dtype=np.float64)
        if raw_contribs.ndim == 1:
            raw_contribs = raw_contribs.reshape(1, -1)
        raw_margin = np.sum(raw_contribs, axis=1)
        expected_arr = np.maximum(0.0, np.exp(np.clip(raw_margin, -20.0, 10.0)))
        fnames = self.feature_names
        n_feats = len(fnames)
        out: list[tuple[float, float, dict[str, float]]] = []
        for idx in range(len(rows)):
            base_margin = float(raw_contribs[idx, n_feats])
            contribs = {fnames[j]: float(raw_contribs[idx, j]) for j in range(n_feats)}
            out.append((float(expected_arr[idx]), base_margin, contribs))
        return out


def load_model(model_path: Path) -> LGBMForecastModel:
    """Load and SHA-256-verify the committed LightGBM joblib artifact (used by API and evals)."""
    meta = verify_artifact_integrity(model_path)
    try:
        bundle = joblib.load(model_path)
    except Exception as exc:  # noqa: BLE001
        raise ModelArtifactError(f"Failed to deserialize model artifact {model_path.name}.") from exc
    if not isinstance(bundle, Mapping):
        raise ModelArtifactError("Deserialized model artifact has unexpected format.")
    return LGBMForecastModel(bundle, metadata=meta)
