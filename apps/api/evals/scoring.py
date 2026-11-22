"""Shared dataset loading, metrics, baselines, and CORE model-hook utilities for evals."""

from __future__ import annotations

import hmac
import importlib
import json
import logging
import math
import random
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from scipy.stats import nbinom

from app.core.config import get_settings
from scripts.seed import EXPECTED_SHA256, compute_sha256

logger = logging.getLogger(__name__)

TIERS: tuple[str, ...] = ("Low", "Medium", "High", "Critical")
TIER_TO_IDX: dict[str, int] = {t: i for i, t in enumerate(TIERS)}
TIER_CUTOFFS: tuple[float, float, float] = (3.0, 8.0, 14.0)  # Medium >= 3, High >= 8, Critical >= 14
EPIDEMIC_FLOOR: float = 5.0


def tier_from_cases(cases: float, cutoffs: tuple[float, float, float] = TIER_CUTOFFS) -> str:
    """Map weekly case count (actual or expected) to risk tier using fixed cut-offs."""
    med, high, crit = cutoffs
    if cases < med:
        return "Low"
    if cases < high:
        return "Medium"
    if cases < crit:
        return "High"
    return "Critical"


def escalate_tier(tier: str, p90: float, epidemic_threshold: float) -> tuple[str, bool]:
    """Escalate by one tier (up to Critical) when P90 exceeds the ward's epidemic threshold."""
    if p90 > epidemic_threshold and tier != "Critical":
        return TIERS[TIER_TO_IDX[tier] + 1], True
    return tier, False


def iso_week_capped(d: date) -> int:
    """Return ISO week 1..52 (week 53 folded into 52 per ADR-0003)."""
    return min(52, int(d.isocalendar().week))


def load_raw_dataset(
    path: Path | None = None,
    sheet: str | None = None,
    *,
    verify_sha256: bool = True,
) -> pd.DataFrame:
    """Read hackathon_preli_dataset.xlsx strictly read-only, verifying SHA-256 (CR-4)."""
    settings = get_settings()
    src = path or settings.raw_dataset_path
    sheet_name = sheet or settings.raw_dataset_sheet
    if not src.exists():
        raise FileNotFoundError(f"Raw dataset not found: {src}")
    if verify_sha256:
        actual_sha = compute_sha256(src)
        if not hmac.compare_digest(actual_sha.lower(), EXPECTED_SHA256.lower()):
            raise ValueError(
                f"Raw dataset SHA-256 mismatch for {src.name}: got {actual_sha}, expected {EXPECTED_SHA256}"
            )
    df = pd.read_excel(src, sheet_name=sheet_name)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.sort_values(["ward_id", "date"]).reset_index(drop=True)
    df["year"] = df["date"].map(lambda d: d.year)
    df["iso_week"] = df["date"].map(iso_week_capped)
    return df


def mae(y_true: Sequence[float] | np.ndarray, y_pred: Sequence[float] | np.ndarray) -> float:
    yt = np.asarray(y_true, dtype=float)
    yp = np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs(yt - yp))) if len(yt) else 0.0


def rmse(y_true: Sequence[float] | np.ndarray, y_pred: Sequence[float] | np.ndarray) -> float:
    yt = np.asarray(y_true, dtype=float)
    yp = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((yt - yp) ** 2))) if len(yt) else 0.0


def poisson_deviance(y_true: Sequence[float] | np.ndarray, y_pred: Sequence[float] | np.ndarray) -> float:
    """Mean Poisson deviance: 2 * mean(y * log(y / mu) - (y - mu)), with 0 * log(0) = 0."""
    yt = np.asarray(y_true, dtype=float)
    mu = np.clip(np.asarray(y_pred, dtype=float), 1e-6, None)
    if len(yt) == 0:
        return 0.0
    pos = yt > 0
    term = np.zeros_like(yt)
    term[pos] = yt[pos] * np.log(yt[pos] / mu[pos])
    dev = 2.0 * (term - (yt - mu))
    return float(np.mean(np.maximum(0.0, dev)))


def coverage_80(
    y_true: Sequence[float] | np.ndarray,
    p10: Sequence[float] | np.ndarray,
    p90: Sequence[float] | np.ndarray,
) -> float:
    yt = np.asarray(y_true, dtype=float)
    lo = np.asarray(p10, dtype=float)
    hi = np.asarray(p90, dtype=float)
    return float(np.mean((yt >= lo) & (yt <= hi))) if len(yt) else 0.0


def tier_metrics(y_true: Sequence[float], pred_tiers: Sequence[str]) -> dict[str, Any]:
    """Compute confusion matrix, within-one-tier, Critical->High|Critical recall, and macro-F1."""
    n = len(y_true)
    matrix = [[0 for _ in range(4)] for _ in range(4)]
    within_one = 0
    crit_total = 0
    crit_recalled = 0
    for y, pt in zip(y_true, pred_tiers, strict=True):
        at = tier_from_cases(float(y))
        ai = TIER_TO_IDX[at]
        pi = TIER_TO_IDX[pt]
        matrix[ai][pi] += 1
        if abs(ai - pi) <= 1:
            within_one += 1
        if at == "Critical":
            crit_total += 1
            if pt in ("High", "Critical"):
                crit_recalled += 1

    f1s: list[float] = []
    for i in range(4):
        tp = matrix[i][i]
        fp = sum(matrix[r][i] for r in range(4) if r != i)
        fn = sum(matrix[i][c] for c in range(4) if c != i)
        denom = 2 * tp + fp + fn
        f1s.append((2.0 * tp / denom) if denom > 0 else 0.0)

    return {
        "labels": list(TIERS),
        "matrix": matrix,
        "within_one_tier": round(within_one / max(n, 1), 4),
        "critical_recall": round(crit_recalled / max(crit_total, 1), 4),
        "critical_n": crit_total,
        "macro_f1": round(sum(f1s) / 4.0, 4),
    }


def percentile(values: Sequence[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(math.ceil(pct / 100.0 * len(s))) - 1))
    return float(s[idx])


@dataclass(frozen=True)
class EvalPrediction:
    expected_cases: float
    p10: float
    p90: float
    tier: str
    risk_score: int
    tier_escalated: bool = False
    used_fallback: bool = False


class ClimatologyBaseline:
    """Ward x ISO-week climatology fit strictly on years <= train_end_year with NegBin conformal bands."""

    def __init__(
        self,
        means: dict[tuple[str, int], float],
        stds: dict[tuple[str, int], float],
        global_mean: float,
        nb_r: float,
        conformal_q: float,
        train_end_year: int,
    ) -> None:
        self.means = means
        self.stds = stds
        self.global_mean = global_mean
        self.nb_r = nb_r
        self.conformal_q = conformal_q
        self.train_end_year = train_end_year
        self.model_version = f"climatology-le{train_end_year}"

    @classmethod
    def fit(cls, df: pd.DataFrame, train_end_year: int = 2023) -> ClimatologyBaseline:
        train = df[df["year"] <= train_end_year]
        grp = train.groupby(["ward_id", "iso_week"])["dengue_cases"]
        means = {
            (str(k[0]), int(k[1])): float(v)
            for k, v in grp.mean().items()  # type: ignore[index]
        }
        stds = {
            (str(k[0]), int(k[1])): float(0.0 if pd.isna(v) else v)
            for k, v in grp.std(ddof=0).items()  # type: ignore[index]
        }
        global_mean = float(train["dengue_cases"].mean()) if len(train) else 1.0

        # Calibrate NegBin dispersion & conformal adjustment strictly on calibration year (train_end_year)
        # using climatology fit on < train_end_year to avoid in-sample optimism.
        cal_df = df[df["year"] == train_end_year]
        pre_df = df[df["year"] < train_end_year]
        if len(cal_df) > 0 and len(pre_df) > 0:
            pre_means = {
                (str(k[0]), int(k[1])): float(v)
                for k, v in pre_df.groupby(["ward_id", "iso_week"])["dengue_cases"].mean().items()  # type: ignore[index]
            }
            pre_global = float(pre_df["dengue_cases"].mean())
            mu_cal = np.array(
                [
                    max(1e-6, pre_means.get((str(w), int(iw)), pre_global))
                    for w, iw in zip(cal_df["ward_id"], cal_df["iso_week"], strict=True)
                ],
                dtype=float,
            )
            y_cal = cal_df["dengue_cases"].to_numpy(dtype=float)
            num = float(np.sum((y_cal - mu_cal) ** 2 - mu_cal))
            den = float(np.sum(mu_cal**2))
            alpha = max(1e-3, num / max(den, 1e-6))
            nb_r = 1.0 / alpha
            p_prob = nb_r / (nb_r + mu_cal)
            p10_cal = np.asarray(nbinom.ppf(0.10, nb_r, p_prob), dtype=float)
            p90_cal = np.maximum(np.asarray(nbinom.ppf(0.90, nb_r, p_prob), dtype=float), mu_cal)
            scores = np.maximum(p10_cal - y_cal, y_cal - p90_cal)
            conformal_q = max(0.0, float(np.quantile(scores, 0.80)))
        else:
            nb_r = 5.0
            conformal_q = 0.0

        return cls(
            means=means,
            stds=stds,
            global_mean=global_mean,
            nb_r=nb_r,
            conformal_q=conformal_q,
            train_end_year=train_end_year,
        )

    def predict_one(self, ward_id: str, target_week: date) -> EvalPrediction:
        iw = iso_week_capped(target_week)
        mu = max(0.0, self.means.get((ward_id, iw), self.global_mean))
        std = self.stds.get((ward_id, iw), 0.0)
        mu_pos = max(1e-6, mu)
        p_prob = self.nb_r / (self.nb_r + mu_pos)
        raw_p10 = float(nbinom.ppf(0.10, self.nb_r, p_prob))
        raw_p90 = float(nbinom.ppf(0.90, self.nb_r, p_prob))
        p10 = max(0.0, raw_p10 - self.conformal_q)
        p90 = max(raw_p90 + self.conformal_q, mu)
        p10 = min(p10, mu)
        epi_thresh = max(EPIDEMIC_FLOOR, mu + 2.0 * std)
        base_tier = tier_from_cases(mu)
        tier, escalated = escalate_tier(base_tier, p90, epi_thresh)
        # P(cases >= 8) under NB
        prob_high = float(1.0 - nbinom.cdf(int(TIER_CUTOFFS[1]) - 1, self.nb_r, p_prob))
        risk_score = max(0, min(100, int(round(prob_high * 100))))
        return EvalPrediction(
            expected_cases=round(mu, 4),
            p10=round(p10, 4),
            p90=round(p90, 4),
            tier=tier,
            risk_score=risk_score,
            tier_escalated=escalated,
        )

    def predict_batch(
        self,
        pairs: Sequence[tuple[str, date, int]],
    ) -> tuple[list[EvalPrediction], list[float]]:
        preds: list[EvalPrediction] = []
        latencies_ms: list[float] = []
        for ward_id, origin_week, horizon in pairs:
            t0 = time.perf_counter()
            target_week = origin_week + timedelta(weeks=horizon)
            preds.append(self.predict_one(ward_id, target_week))
            latencies_ms.append((time.perf_counter() - t0) * 1000.0)
        return preds, latencies_ms


def _parse_rain_normals(raw: Any) -> dict[tuple[str, int], float] | None:
    if not isinstance(raw, Mapping) or not raw:
        return None
    parsed: dict[tuple[str, int], float] = {}
    for k, v in raw.items():
        if isinstance(k, tuple) and len(k) == 2:
            parsed[(str(k[0]), int(k[1]))] = float(v)
        elif isinstance(k, str) and "|" in k:
            wid, iw = k.rsplit("|", 1)
            parsed[(wid, int(iw))] = float(v)
    return parsed or None


class ForecasterHook:
    """Unified scoring interface: uses CORE's trained model artifact when present, else climatology."""

    def __init__(
        self,
        model_version: str,
        is_baseline_fallback: bool,
        climatology: ClimatologyBaseline,
        core_model: Any | None = None,
        feature_builder: Any | None = None,
        no_weather_meta: Mapping[str, Any] | None = None,
        artifact_meta: Mapping[str, Any] | None = None,
        rain_normals: Mapping[tuple[str, int], float] | None = None,
        train_end_year: int | None = None,
        max_normal_year: int | None = None,
    ) -> None:
        self.model_version = model_version
        self.is_baseline_fallback = is_baseline_fallback
        self.climatology = climatology
        self._core_model = core_model
        self._feature_builder = feature_builder
        self._artifact_meta = dict(artifact_meta) if artifact_meta else {}

        if no_weather_meta is not None:
            self._no_weather_meta: dict[str, Any] | None = dict(no_weather_meta)
        else:
            raw_nw = self._artifact_meta.get("no_weather_mae") or self._artifact_meta.get(
                "ablation_no_weather_mae"
            )
            self._no_weather_meta = dict(raw_nw) if isinstance(raw_nw, Mapping) else None

        # CR-5: resolve artifact's stored rain_normals, train_end_year, and max_normal_year.
        resolved_normals = _parse_rain_normals(rain_normals)
        if resolved_normals is None and core_model is not None:
            resolved_normals = _parse_rain_normals(getattr(core_model, "rain_normals", None))
        if resolved_normals is None:
            resolved_normals = _parse_rain_normals(self._artifact_meta.get("rain_normals"))
        self.rain_normals: dict[tuple[str, int], float] | None = resolved_normals

        resolved_train_end = train_end_year
        if resolved_train_end is None and core_model is not None:
            raw_te = getattr(core_model, "train_end_year", None)
            if raw_te is not None:
                resolved_train_end = int(raw_te)
        if resolved_train_end is None:
            meta_te = self._artifact_meta.get("train_end_year") or self._artifact_meta.get("train_max_year")
            if meta_te is not None:
                resolved_train_end = int(meta_te)
        self.train_end_year: int = (
            int(resolved_train_end) if resolved_train_end is not None else int(climatology.train_end_year)
        )

        resolved_max_norm = max_normal_year
        if resolved_max_norm is None and core_model is not None:
            raw_mn = getattr(core_model, "max_normal_year", None)
            if raw_mn is not None:
                resolved_max_norm = int(raw_mn)
        if resolved_max_norm is None and self._artifact_meta.get("max_normal_year") is not None:
            resolved_max_norm = int(self._artifact_meta["max_normal_year"])
        self.max_normal_year: int = (
            int(resolved_max_norm) if resolved_max_norm is not None else self.train_end_year
        )

        self._feature_cache: dict[int, dict[tuple[str, date], dict[str, float]]] = {}

    def _invoke_feature_builder(
        self,
        frame: pd.DataFrame,
        horizon: int,
        *,
        origin_week: date | None = None,
    ) -> pd.DataFrame | None:
        if self._feature_builder is None:
            return None
        kwargs: dict[str, Any] = {
            "horizon": horizon,
            "max_normal_year": self.max_normal_year,
        }
        if self.rain_normals is not None:
            kwargs["rain_normals"] = self.rain_normals
        if origin_week is not None:
            kwargs["origin_week"] = origin_week
        try:
            feat_df = self._feature_builder(frame, **kwargs)
        except TypeError:
            # Support minimal custom/mock feature builders in unit tests that accept fewer kwargs.
            fallback_kwargs = {k: v for k, v in kwargs.items() if k != "origin_week"}
            try:
                feat_df = self._feature_builder(frame, **fallback_kwargs)
            except TypeError:
                try:
                    feat_df = self._feature_builder(frame, horizon=horizon)
                except TypeError:
                    feat_df = self._feature_builder(frame)
        return feat_df if isinstance(feat_df, pd.DataFrame) else None

    def _build_feature_lookup(
        self, df: pd.DataFrame, horizon: int
    ) -> dict[tuple[str, date], dict[str, float]]:
        if horizon in self._feature_cache:
            return self._feature_cache[horizon]
        feat_df = self._invoke_feature_builder(df, horizon)
        if feat_df is None or feat_df.empty:
            return {}
        feature_names: Sequence[str] = getattr(self._core_model, "feature_names", [])
        if not feature_names:
            exclude = {"date", "week", "ward_id", "city", "dengue_cases", "year", "iso_week"}
            feature_names = [c for c in feat_df.columns if c not in exclude]
        date_col = "date" if "date" in feat_df.columns else "week"
        dates = pd.to_datetime(feat_df[date_col]).dt.date
        lookup: dict[tuple[str, date], dict[str, float]] = {}
        cols = [c for c in feature_names if c in feat_df.columns]
        records = feat_df[cols].to_dict(orient="records")
        for wid, dt, rec in zip(feat_df["ward_id"], dates, records, strict=True):
            lookup[(str(wid), dt)] = {str(k): float(v) for k, v in rec.items()}
        self._feature_cache[horizon] = lookup
        return lookup

    def benchmark_single_row_latencies(
        self,
        df: pd.DataFrame,
        pairs: Sequence[tuple[str, date, int]],
        *,
        sample_size: int = 200,
        seed: int = 42,
    ) -> list[float]:
        """Time `sample_size` single-ward end-to-end calls (feature build + predict) for NFR-1 (CR-6)."""
        if not pairs:
            return []
        k = min(sample_size, len(pairs))
        rng = random.Random(seed)
        sampled = rng.sample(list(pairs), k) if k < len(pairs) else list(pairs)

        if self._core_model is None or self._feature_builder is None:
            latencies: list[float] = []
            for wid, ow, h in sampled:
                t0 = time.perf_counter()
                self.climatology.predict_one(wid, ow + timedelta(weeks=h))
                latencies.append((time.perf_counter() - t0) * 1000.0)
            return latencies

        date_col = "date" if "date" in df.columns else "week"
        ward_frames: dict[str, pd.DataFrame] = {
            str(wid): grp.reset_index(drop=True) for wid, grp in df.groupby("ward_id", sort=False)
        }
        feature_names: Sequence[str] = getattr(self._core_model, "feature_names", ())
        exclude = {"date", "week", "ward_id", "city", "dengue_cases", "year", "iso_week"}

        latencies = []
        for wid, ow, h in sampled:
            wdf = ward_frames.get(wid)
            if wdf is None:
                t0 = time.perf_counter()
                self.climatology.predict_one(wid, ow + timedelta(weeks=h))
                latencies.append((time.perf_counter() - t0) * 1000.0)
                continue

            start_dt = ow - timedelta(weeks=8)
            dates_series = wdf[date_col]
            window_df = wdf.loc[(dates_series >= start_dt) & (dates_series <= ow)]

            t0 = time.perf_counter()
            feat_df = self._invoke_feature_builder(window_df, h, origin_week=ow)
            if feat_df is not None and not feat_df.empty:
                f_date_col = "date" if "date" in feat_df.columns else "week"
                f_dates = pd.to_datetime(feat_df[f_date_col]).dt.date
                match = feat_df.loc[(feat_df["ward_id"] == wid) & (f_dates == ow)]
                if not match.empty:
                    cols = (
                        [c for c in feature_names if c in match.columns]
                        if feature_names
                        else [c for c in match.columns if c not in exclude]
                    )
                    row_vals = match.iloc[-1][cols].to_dict()
                    row_dict = {str(k_col): float(v) for k_col, v in row_vals.items()}
                    self._core_model.predict([row_dict], horizon=h)
                else:
                    self.climatology.predict_one(wid, ow + timedelta(weeks=h))
            else:
                self.climatology.predict_one(wid, ow + timedelta(weeks=h))
            latencies.append((time.perf_counter() - t0) * 1000.0)
        return latencies

    def predict_batch(
        self,
        df: pd.DataFrame,
        pairs: Sequence[tuple[str, date, int]],
    ) -> tuple[list[EvalPrediction], list[float]]:
        if self._core_model is None or self._feature_builder is None:
            return self.climatology.predict_batch(pairs)

        # Group by horizon so we call model.predict(rows, horizon=h) per ForecastModel port.
        by_h: dict[int, list[tuple[int, str, date]]] = {}
        for idx, (wid, ow, h) in enumerate(pairs):
            by_h.setdefault(h, []).append((idx, wid, ow))

        results: list[EvalPrediction | None] = [None] * len(pairs)
        latencies_ms: list[float] = [0.0] * len(pairs)
        for h, items in by_h.items():
            lookup = self._build_feature_lookup(df, h)
            rows: list[dict[str, float]] = []
            valid_indices: list[int] = []
            fallback_items: list[tuple[int, str, date]] = []
            for idx, wid, ow in items:
                row = lookup.get((wid, ow))
                if row is not None:
                    rows.append(row)
                    valid_indices.append(idx)
                else:
                    fallback_items.append((idx, wid, ow))

            if rows:
                if len(rows) <= 200:
                    for idx, row in zip(valid_indices, rows, strict=True):
                        t0 = time.perf_counter()
                        pf = self._core_model.predict([row], horizon=h)[0]
                        latencies_ms[idx] = (time.perf_counter() - t0) * 1000.0
                        results[idx] = EvalPrediction(
                            expected_cases=float(pf.expected_cases),
                            p10=float(pf.p10),
                            p90=float(pf.p90),
                            tier=str(pf.tier),
                            risk_score=int(pf.risk_score),
                            tier_escalated=bool(pf.tier_escalated),
                            used_fallback=False,
                        )
                else:
                    t0 = time.perf_counter()
                    pfs = self._core_model.predict(rows, horizon=h)
                    per_ward_ms = ((time.perf_counter() - t0) * 1000.0) / max(len(rows), 1)
                    for idx, pf in zip(valid_indices, pfs, strict=True):
                        latencies_ms[idx] = per_ward_ms
                        results[idx] = EvalPrediction(
                            expected_cases=float(pf.expected_cases),
                            p10=float(pf.p10),
                            p90=float(pf.p90),
                            tier=str(pf.tier),
                            risk_score=int(pf.risk_score),
                            tier_escalated=bool(pf.tier_escalated),
                            used_fallback=False,
                        )

            if fallback_items:
                logger.warning(
                    "Horizon h=%d had %d missing feature row(s); fell back to climatology (counted as skipped)",
                    h,
                    len(fallback_items),
                )
            for idx, wid, ow in fallback_items:
                t0 = time.perf_counter()
                cp = self.climatology.predict_one(wid, ow + timedelta(weeks=h))
                results[idx] = EvalPrediction(
                    expected_cases=cp.expected_cases,
                    p10=cp.p10,
                    p90=cp.p90,
                    tier=cp.tier,
                    risk_score=cp.risk_score,
                    tier_escalated=cp.tier_escalated,
                    used_fallback=True,
                )
                latencies_ms[idx] = (time.perf_counter() - t0) * 1000.0

        return [r for r in results if r is not None], latencies_ms

    def no_weather_mae_by_horizon(self) -> dict[int, float | None]:
        """Return no-weather ablation MAE per horizon h=1..4 if recorded in artifact metadata."""
        out: dict[int, float | None] = {1: None, 2: None, 3: None, 4: None}
        if not self._no_weather_meta:
            return out
        for h in (1, 2, 3, 4):
            val = self._no_weather_meta.get(str(h))
            if val is None:
                val = self._no_weather_meta.get(f"h{h}")
            if isinstance(val, (int, float)):
                out[h] = float(val)
        return out


def _try_load_feature_builder() -> Any | None:
    try:
        mod = importlib.import_module("app.shared.features")
    except ModuleNotFoundError:
        return None
    for attr in ("build_feature_frame", "build_features", "build_forecast_features"):
        fn = getattr(mod, attr, None)
        if callable(fn):
            return fn
    return None


def _try_load_core_model(model_path: Path) -> tuple[Any | None, dict[str, Any] | None]:
    if not model_path.exists():
        return None, None

    raw_meta: dict[str, Any] | None = None
    meta_path = model_path.parent / "metadata.json"
    if meta_path.exists():
        try:
            loaded = json.loads(meta_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                raw_meta = loaded
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not parse artifact metadata at %s: %s", meta_path, exc)

    try:
        mod = importlib.import_module("app.adapters.lgbm_model")
        for factory_name in ("load_model", "load_forecast_model"):
            factory = getattr(mod, factory_name, None)
            if callable(factory):
                return factory(model_path), raw_meta
        cls = getattr(mod, "LGBMForecastModel", None)
        if cls is not None:
            if hasattr(cls, "load") and callable(cls.load):
                return cls.load(model_path), raw_meta
            return cls(model_path), raw_meta
    except ModuleNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load CORE adapter from %s: %s", model_path, exc)

    # Fallback: check if the joblib object itself satisfies ForecastModel protocol.
    try:
        obj = joblib.load(model_path)
        if hasattr(obj, "predict") and callable(obj.predict):
            return obj, raw_meta
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load joblib artifact at %s: %s", model_path, exc)
    return None, raw_meta


def load_forecaster(df: pd.DataFrame, train_end_year: int = 2023) -> ForecasterHook:
    """Load CORE's trained model artifact if present, otherwise fall back cleanly to climatology."""
    settings = get_settings()
    climatology = ClimatologyBaseline.fit(df, train_end_year=train_end_year)
    core_model, artifact_meta = _try_load_core_model(settings.model_path)
    feature_builder = _try_load_feature_builder() if core_model is not None else None
    if core_model is not None and feature_builder is not None:
        version = str(getattr(core_model, "version", "lightgbm-artifact"))
        return ForecasterHook(
            model_version=version,
            is_baseline_fallback=False,
            climatology=climatology,
            core_model=core_model,
            feature_builder=feature_builder,
            artifact_meta=artifact_meta,
        )
    return ForecasterHook(
        model_version=climatology.model_version,
        is_baseline_fallback=True,
        climatology=climatology,
        artifact_meta=artifact_meta,
    )


def build_case_lookup(df: pd.DataFrame) -> dict[tuple[str, date], int]:
    """Map (ward_id, monday_date) -> actual dengue_cases."""
    return {
        (str(w), d): int(c) for w, d, c in zip(df["ward_id"], df["date"], df["dengue_cases"], strict=True)
    }


def seasonal_naive_prediction(
    lookup: Mapping[tuple[str, date], int], ward_id: str, target_week: date
) -> float | None:
    """Same ward, 52 weeks prior to target_week (strictly <= origin_week for h=1..4)."""
    val = lookup.get((ward_id, target_week - timedelta(weeks=52)))
    return float(val) if val is not None else None


def persistence_prediction(
    lookup: Mapping[tuple[str, date], int], ward_id: str, origin_week: date
) -> float | None:
    """Observed dengue_cases at origin_week (strictly <= origin_week)."""
    val = lookup.get((ward_id, origin_week))
    return float(val) if val is not None else None
