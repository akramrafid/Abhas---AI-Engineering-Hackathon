"""Shared, framework-free forecasting engine used by forecast, heatmap, and advisory slices.

Zero imports of FastAPI, Starlette, SQLAlchemy, httpx, anthropic, or feature schemas (ADR-0001).
"""

from __future__ import annotations

import hashlib
import inspect
import json
import logging
import sys
import threading
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.errors import AppError
from app.core.types import DATA_END, DATA_START, WeatherMode, WeatherSourceUsed
from app.observability.metrics import OpsMetrics
from app.ports.forecast_model import ForecastModel, PointForecast
from app.ports.repositories import Observation, ObservationRepository, PredictionCache, WardRecord
from app.ports.weather import WeatherSource
from app.shared.drivers import DriverContribution, contributions_to_drivers
from app.shared.features import (
    FEATURE_COLUMNS,
    MAX_RAIN_LAG,
    VALID_HORIZONS,
    build_serving_features,
    canonical_iso_week,
    fit_rain_normals,
    observations_to_dataframe,
)
from app.shared.intervention import apply_reduction
from app.shared.tiers import peak_tier

logger = logging.getLogger("abhas.forecast")

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
FIRST_FORECAST_ORIGIN = DATA_START + timedelta(weeks=MAX_RAIN_LAG)  # 2016-02-29
LIVE_MAX_ORIGIN = date(2030, 12, 30)


class _SingleFlightRegistry:
    """Reference-counted per-key threading.Lock registry coalescing concurrent cold-origin computes."""

    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._locks: dict[tuple[Any, ...], list[Any]] = {}

    @contextmanager
    def acquire(self, key: tuple[Any, ...]) -> Iterator[None]:
        with self._guard:
            entry = self._locks.get(key)
            if entry is None:
                entry = [threading.Lock(), 0]
                self._locks[key] = entry
            lock: threading.Lock = entry[0]
            entry[1] += 1
        lock.acquire()
        try:
            yield
        finally:
            lock.release()
            with self._guard:
                entry[1] -= 1
                if entry[1] <= 0 and self._locks.get(key) is entry:
                    del self._locks[key]


_SINGLE_FLIGHT = _SingleFlightRegistry()


def current_week_monday_dhaka(now: datetime | None = None) -> date:
    """Return the ISO Monday of the current week in Asia/Dhaka."""
    ref = now if now is not None else datetime.now(UTC)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=UTC)
    today = ref.astimezone(DHAKA_TZ).date()
    return today - timedelta(days=today.weekday())


def last_completed_week_monday_dhaka(now: datetime | None = None) -> date:
    """Return the ISO Monday of the last completed Mon-Sun week in Asia/Dhaka."""
    return current_week_monday_dhaka(now) - timedelta(weeks=1)


def live_allowed_origin_weeks(now: datetime | None = None) -> tuple[date, date]:
    """Return (last_completed_monday, current_week_monday) valid in Asia/Dhaka live mode."""
    curr = current_week_monday_dhaka(now)
    return (curr - timedelta(weeks=1), curr)


@dataclass(frozen=True)
class EngineHorizonForecast:
    horizon: int
    target_week: date
    expected_cases: float
    p10: float
    p90: float
    risk_score: int
    tier: str
    tier_escalated: bool
    drivers: tuple[DriverContribution, ...]


@dataclass(frozen=True)
class EngineWardForecast:
    ward_id: str
    city: str
    peak_tier: str
    horizons: tuple[EngineHorizonForecast, ...]


@dataclass(frozen=True)
class EngineForecastBatch:
    origin_week: date
    source: WeatherMode
    weather_source: WeatherSourceUsed
    model_version: str
    generated_at: datetime
    cached: bool
    forecasts: tuple[EngineWardForecast, ...]


@dataclass(frozen=True)
class EngineScenarioResult:
    ward_id: str
    origin_week: date
    model_version: str
    baseline: tuple[EngineHorizonForecast, ...]
    scenario: tuple[EngineHorizonForecast, ...]


def validate_origin_week(
    origin_week: date,
    source: WeatherMode = "dataset",
    *,
    strict_live_origin: bool = False,
    now: datetime | None = None,
) -> None:
    """Enforce Monday + valid date bounds BEFORE touching DB or PredictionCache (AC-4)."""
    if origin_week.weekday() != 0:
        raise AppError(
            status=422,
            slug="validation-error",
            title="Invalid origin_week",
            detail=f"origin_week ({origin_week.isoformat()}) must be a Monday (ISO week start).",
        )
    if source == "dataset":
        if origin_week < FIRST_FORECAST_ORIGIN or origin_week > DATA_END:
            raise AppError(
                status=422,
                slug="validation-error",
                title="origin_week out of range",
                detail=(
                    f"origin_week ({origin_week.isoformat()}) must be between "
                    f"{FIRST_FORECAST_ORIGIN.isoformat()} and {DATA_END.isoformat()} in dataset mode."
                ),
            )
    else:
        if strict_live_origin:
            last_completed, curr_monday = live_allowed_origin_weeks(now)
            if origin_week not in (last_completed, curr_monday):
                raise AppError(
                    status=422,
                    slug="validation-error",
                    title="origin_week out of range",
                    detail=(
                        f"origin_week ({origin_week.isoformat()}) in live mode must be the current "
                        f"completed Asia/Dhaka Mon-Sun week ({last_completed.isoformat()} or "
                        f"{curr_monday.isoformat()})."
                    ),
                )
        elif origin_week < FIRST_FORECAST_ORIGIN or origin_week > LIVE_MAX_ORIGIN:
            raise AppError(
                status=422,
                slug="validation-error",
                title="origin_week out of range",
                detail=(
                    f"origin_week ({origin_week.isoformat()}) must be between "
                    f"{FIRST_FORECAST_ORIGIN.isoformat()} and {LIVE_MAX_ORIGIN.isoformat()}."
                ),
            )


def _forecast_cache_key(
    ward_id: str,
    origin_week: date,
    horizon: int,
    model_version: str,
    weather_hash: str,
) -> str:
    raw = f"fc|{ward_id}|{origin_week.isoformat()}|h{horizon}|{model_version}|{weather_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _serialize_horizon(hf: EngineHorizonForecast) -> str:
    payload = {
        "horizon": hf.horizon,
        "target_week": hf.target_week.isoformat(),
        "expected_cases": hf.expected_cases,
        "p10": hf.p10,
        "p90": hf.p90,
        "risk_score": hf.risk_score,
        "tier": hf.tier,
        "tier_escalated": hf.tier_escalated,
        "drivers": [asdict(d) for d in hf.drivers],
    }
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def _deserialize_horizon(raw: str) -> EngineHorizonForecast:
    d = json.loads(raw)
    drivers = tuple(
        DriverContribution(
            key=item["key"],
            label=item["label"],
            effect_pct=float(item["effect_pct"]),
            direction=item["direction"],
        )
        for item in d.get("drivers", [])
    )
    return EngineHorizonForecast(
        horizon=int(d["horizon"]),
        target_week=date.fromisoformat(str(d["target_week"])),
        expected_cases=float(d["expected_cases"]),
        p10=float(d["p10"]),
        p90=float(d["p90"]),
        risk_score=int(d["risk_score"]),
        tier=str(d["tier"]),
        tier_escalated=bool(d["tier_escalated"]),
        drivers=drivers,
    )


def _combine_weather_source(sources: Sequence[str]) -> WeatherSourceUsed:
    """Resolve effective weather_source label across fetched city-weeks."""
    if not sources:
        return "dataset"
    uniq = set(sources)
    if "climatology" in uniq and not ({"live", "cache", "dataset"} & uniq):
        return "climatology"
    if "climatology" in uniq:
        return "climatology"
    if "cache" in uniq and "live" not in uniq:
        return "cache"
    if "live" in uniq:
        return "live"
    if "cache" in uniq:
        return "cache"
    return "dataset"


class ForecastEngine:
    """Shared domain orchestrator for multi-ward forecasts, scenarios, heatmaps, and advisory inputs."""

    def __init__(
        self,
        repo: ObservationRepository,
        model: ForecastModel,
        cache: PredictionCache,
        weather_source: WeatherSource | None = None,
        ops_metrics: OpsMetrics | None = None,
        db_fault_hook: Callable[[], None] | None = None,
        *,
        strict_live_origin: bool = False,
        now_fn: Callable[[], datetime] | None = None,
    ) -> None:
        self._repo = repo
        self._model = model
        self._cache = cache
        self._weather_source = weather_source
        self._ops = ops_metrics
        self._db_fault_hook = db_fault_hook
        self._strict_live_origin = strict_live_origin
        self._now_fn = now_fn

    def validate_origin(self, origin_week: date, source: WeatherMode = "dataset") -> None:
        validate_origin_week(
            origin_week,
            source=source,
            strict_live_origin=self._strict_live_origin,
            now=self._now_fn() if self._now_fn is not None else None,
        )

    def _rain_normals(self, obs_df: pd.DataFrame) -> Mapping[tuple[str, int], float]:
        normals = getattr(self._model, "rain_normals", None)
        if isinstance(normals, Mapping) and len(normals) > 0:
            return normals
        # Fallback only for minimal test doubles that lack stored artifact normals (CR-5/CR-13).
        return fit_rain_normals(obs_df)

    def _resolve_wards(self, ward_ids: Sequence[str]) -> list[WardRecord]:
        if self._db_fault_hook is not None:
            self._db_fault_hook()
        resolved: list[WardRecord] = []
        for wid in ward_ids:
            try:
                rec = self._repo.ward(wid)
            except Exception as exc:  # noqa: BLE001
                raise AppError(
                    status=503,
                    slug="db-unavailable",
                    title="Database unavailable",
                    detail="Could not query ward directory.",
                ) from exc
            if rec is None:
                raise AppError(
                    status=404,
                    slug="unknown-ward",
                    title="Unknown ward",
                    detail=f"Unknown ward_id: {wid}",
                )
            resolved.append(rec)
        return resolved

    def _load_window_dataframe(
        self,
        wards: Sequence[WardRecord],
        origin_week: date,
        source: WeatherMode,
    ) -> tuple[pd.DataFrame, WeatherSourceUsed, str]:
        """Build 9-week observation frame (strictly <= origin_week) and weather cache hash."""
        window_weeks = [origin_week - timedelta(weeks=k) for k in range(MAX_RAIN_LAG, -1, -1)]
        start_w = window_weeks[0]

        if source == "live" and self._weather_source is not None:
            cities = sorted({w.city for w in wards})
            city_weather: dict[str, list[Any]] = {}
            sources_seen: list[str] = []
            hash_parts: list[str] = ["live"]
            allow_live_fetch = "pytest" not in sys.modules
            weekly_fn = self._weather_source.weekly
            supports_force_live = "force_live" in inspect.signature(weekly_fn).parameters
            for city in cities:
                if allow_live_fetch and supports_force_live:
                    wk_list = cast(Any, weekly_fn)(city, window_weeks, force_live=True)
                else:
                    wk_list = weekly_fn(city, window_weeks)
                city_weather[city] = wk_list
                for ww in wk_list:
                    sources_seen.append(ww.source)
                    hash_parts.append(
                        f"{city}:{ww.week.isoformat()}:{ww.rainfall_mm:.2f}:{ww.avg_temp_c:.2f}:{ww.relative_humidity_pct:.2f}"
                    )
            effective_source = _combine_weather_source(sources_seen)
            if self._ops is not None:
                self._ops.record_weather_event(
                    call=(effective_source == "live"),
                    cache_hit=(effective_source == "cache"),
                    error=(effective_source == "climatology"),
                )
            obs_rows: list[Observation] = []
            for ward in wards:
                for ww in city_weather[ward.city]:
                    obs_rows.append(
                        Observation(
                            ward_id=ward.ward_id,
                            week=ww.week,
                            avg_temp_c=ww.avg_temp_c,
                            max_temp_c=ww.max_temp_c,
                            min_temp_c=ww.min_temp_c,
                            rainfall_mm=ww.rainfall_mm,
                            relative_humidity_pct=ww.relative_humidity_pct,
                            dengue_cases=0,
                        )
                    )
            weather_hash = hashlib.sha256("|".join(hash_parts).encode("utf-8")).hexdigest()[:16]
            return observations_to_dataframe(obs_rows, wards), effective_source, weather_hash

        # Dataset mode: ward-specific observed weather strictly <= origin_week
        obs_rows = []
        try:
            for ward in wards:
                hist = self._repo.history(ward.ward_id, start=start_w, end=origin_week)
                obs_rows.extend(hist)
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                status=503,
                slug="db-unavailable",
                title="Database unavailable",
                detail="Could not load weekly observations.",
            ) from exc

        if not obs_rows:
            raise AppError(
                status=422,
                slug="validation-error",
                title="Insufficient observations",
                detail=f"No observations available on or before origin_week {origin_week.isoformat()}.",
            )
        return observations_to_dataframe(obs_rows, wards), "dataset", "dataset"

    def _predict_horizons_for_df(
        self,
        obs_df: pd.DataFrame,
        wards: Sequence[WardRecord],
        origin_week: date,
        horizons: Sequence[int],
        *,
        weather_override: Mapping[str, float] | None = None,
    ) -> tuple[dict[tuple[str, int], EngineHorizonForecast], float]:
        """Vectorized batch inference across wards for each requested horizon."""
        ward_ids = [w.ward_id for w in wards]
        normals = self._rain_normals(obs_df)
        out: dict[tuple[str, int], EngineHorizonForecast] = {}

        t0 = time.perf_counter()
        for h in horizons:
            feat_df = build_serving_features(
                obs_df,
                origin_week=origin_week,
                horizon=h,
                ward_ids=ward_ids,
                rain_normals=normals,
                weather_override=weather_override,
            )
            if feat_df.empty:
                raise AppError(
                    status=422,
                    slug="validation-error",
                    title="Insufficient observations",
                    detail=f"Missing feature row at origin_week {origin_week.isoformat()}.",
                )
            # Align output order cleanly to ward_ids present in feat_df
            row_by_ward: dict[str, dict[str, float]] = {}
            feat_cols = list(FEATURE_COLUMNS)
            feat_values = feat_df[feat_cols].to_numpy(dtype=float)
            for wid, vals in zip(feat_df["ward_id"].tolist(), feat_values, strict=True):
                row_by_ward[str(wid)] = {col: float(v) for col, v in zip(feat_cols, vals, strict=True)}

            ordered_wids = [wid for wid in ward_ids if wid in row_by_ward]
            if len(ordered_wids) != len(ward_ids):
                missing = sorted(set(ward_ids) - set(ordered_wids))
                raise AppError(
                    status=422,
                    slug="validation-error",
                    title="Insufficient observations",
                    detail=f"Missing origin_week {origin_week.isoformat()} data for wards: {', '.join(missing[:3])}",
                )

            feature_rows = [row_by_ward[wid] for wid in ordered_wids]
            target_week = origin_week + timedelta(weeks=h)
            target_iso = canonical_iso_week(target_week)

            # Call model.predict (pass explicit context when adapter supports it)
            if hasattr(self._model, "endemic_thresholds"):
                pfs = cast(Any, self._model).predict(
                    feature_rows,
                    h,
                    ward_ids=ordered_wids,
                    target_iso_weeks=[target_iso] * len(ordered_wids),
                )
            else:
                pfs = self._model.predict(feature_rows, h)

            for wid, pf in zip(ordered_wids, pfs, strict=True):
                drivers = tuple(contributions_to_drivers(pf.contributions, horizon=h, top_k=4))
                out[(wid, h)] = EngineHorizonForecast(
                    horizon=h,
                    target_week=target_week,
                    expected_cases=pf.expected_cases,
                    p10=pf.p10,
                    p90=pf.p90,
                    risk_score=pf.risk_score,
                    tier=pf.tier,
                    tier_escalated=pf.tier_escalated,
                    drivers=drivers,
                )

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        per_ward_ms = elapsed_ms / max(len(ward_ids), 1)
        return out, per_ward_ms

    def forecast(
        self,
        *,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int] = VALID_HORIZONS,
        source: WeatherMode = "dataset",
    ) -> EngineForecastBatch:
        """Compute or retrieve cached multi-ward, multi-horizon forecasts."""
        self.validate_origin(origin_week, source=source)
        sorted_horizons = sorted(int(h) for h in horizons)
        wards = self._resolve_wards(ward_ids)

        obs_df: pd.DataFrame | None = None
        if source == "dataset":
            weather_source_used: WeatherSourceUsed = "dataset"
            weather_hash = "dataset"
        else:
            obs_df, weather_source_used, weather_hash = self._load_window_dataframe(
                wards, origin_week, source
            )

        # Fast path (lock-free): L1 LRU + SQLite predictions_cache lookup for each (ward_id, horizon)
        cached_results: dict[tuple[str, int], EngineHorizonForecast] = {}
        missed_wards_by_h: dict[int, list[WardRecord]] = {}
        ward_by_id = {w.ward_id: w for w in wards}
        total_pairs = len(wards) * len(sorted_horizons)
        cache_hits = 0

        for w in wards:
            for h in sorted_horizons:
                key = _forecast_cache_key(w.ward_id, origin_week, h, self._model.version, weather_hash)
                raw: str | None = None
                try:
                    raw = self._cache.get(key)
                except Exception:  # noqa: BLE001
                    raw = None
                if raw is not None:
                    try:
                        cached_results[(w.ward_id, h)] = _deserialize_horizon(raw)
                        cache_hits += 1
                        continue
                    except (ValueError, KeyError, TypeError):
                        pass
                missed_wards_by_h.setdefault(h, []).append(w)

        per_ward_ms: float | None = None
        if missed_wards_by_h:
            flight_key = (id(self._cache), origin_week, source, weather_hash)
            with _SINGLE_FLIGHT.acquire(flight_key):
                # Re-check cache after acquiring single-flight lock so concurrent followers
                # reuse the leader's freshly cached result instead of duplicating inference.
                remaining_by_h: dict[int, list[WardRecord]] = {}
                for h, ws in missed_wards_by_h.items():
                    for w in ws:
                        key = _forecast_cache_key(
                            w.ward_id, origin_week, h, self._model.version, weather_hash
                        )
                        raw = None
                        try:
                            raw = self._cache.get(key)
                        except Exception:  # noqa: BLE001
                            raw = None
                        if raw is not None:
                            try:
                                cached_results[(w.ward_id, h)] = _deserialize_horizon(raw)
                                cache_hits += 1
                                continue
                            except (ValueError, KeyError, TypeError):
                                pass
                        remaining_by_h.setdefault(h, []).append(w)

                if remaining_by_h:
                    missed_ward_ids = sorted({w.ward_id for ws in remaining_by_h.values() for w in ws})
                    missed_wards = [ward_by_id[wid] for wid in missed_ward_ids]
                    if obs_df is None:
                        obs_df, weather_source_used, weather_hash = self._load_window_dataframe(
                            missed_wards, origin_week, source
                        )
                    computed, per_ward_ms = self._predict_horizons_for_df(
                        obs_df,
                        missed_wards,
                        origin_week,
                        sorted(remaining_by_h.keys()),
                    )
                    for (wid, h), hf in computed.items():
                        cached_results[(wid, h)] = hf
                        key = _forecast_cache_key(wid, origin_week, h, self._model.version, weather_hash)
                        try:
                            self._cache.put(key, _serialize_horizon(hf))
                        except Exception as exc:  # noqa: BLE001
                            logger.warning(
                                "prediction_cache_write_failed: %s",
                                type(exc).__name__,
                                extra={"event": "prediction_cache_write_failed"},
                            )

        all_cached = total_pairs > 0 and cache_hits == total_pairs
        if self._ops is not None:
            ward_hits = len(wards) if all_cached else (cache_hits // max(len(sorted_horizons), 1))
            self._ops.record_prediction(
                ward_count=len(wards),
                cache_hits=ward_hits,
                per_ward_inference_ms=per_ward_ms,
            )

        ward_forecasts: list[EngineWardForecast] = []
        for w in wards:
            h_list = tuple(cached_results[(w.ward_id, h)] for h in sorted_horizons)
            ward_forecasts.append(
                EngineWardForecast(
                    ward_id=w.ward_id,
                    city=w.city,
                    peak_tier=peak_tier([hf.tier for hf in h_list]),
                    horizons=h_list,
                )
            )

        return EngineForecastBatch(
            origin_week=origin_week,
            source=source,
            weather_source=weather_source_used,
            model_version=self._model.version,
            generated_at=datetime.now(UTC),
            cached=all_cached,
            forecasts=tuple(ward_forecasts),
        )

    def scenario(
        self,
        *,
        ward_id: str,
        origin_week: date,
        horizons: Sequence[int] = VALID_HORIZONS,
        weather_override: Mapping[str, float],
    ) -> EngineScenarioResult:
        """Compute baseline vs weather-override scenario (never writes to predictions_cache)."""
        validate_origin_week(origin_week, source="dataset")
        sorted_horizons = sorted(int(h) for h in horizons)
        wards = self._resolve_wards([ward_id])

        obs_df, _, _ = self._load_window_dataframe(wards, origin_week, source="dataset")
        baseline_map: dict[tuple[str, int], EngineHorizonForecast] = {}
        missing_base_h: list[int] = []
        for h in sorted_horizons:
            key = _forecast_cache_key(ward_id, origin_week, h, self._model.version, "dataset")
            raw_cached: str | None = None
            try:
                raw_cached = self._cache.get(key)
            except Exception:  # noqa: BLE001
                raw_cached = None
            if raw_cached is not None:
                try:
                    baseline_map[(ward_id, h)] = _deserialize_horizon(raw_cached)
                    continue
                except (ValueError, KeyError, TypeError):
                    pass
            missing_base_h.append(h)

        if missing_base_h:
            computed_base, base_ms = self._predict_horizons_for_df(obs_df, wards, origin_week, missing_base_h)
            baseline_map.update(computed_base)
        else:
            base_ms = 0.0

        scenario_map, scen_ms = self._predict_horizons_for_df(
            obs_df,
            wards,
            origin_week,
            sorted_horizons,
            weather_override=weather_override,
        )

        if self._ops is not None:
            self._ops.record_prediction(
                ward_count=1,
                cache_hits=0,
                per_ward_inference_ms=(base_ms + scen_ms) / 2.0,
            )

        return EngineScenarioResult(
            ward_id=ward_id,
            origin_week=origin_week,
            model_version=self._model.version,
            baseline=tuple(baseline_map[(ward_id, h)] for h in sorted_horizons),
            scenario=tuple(scenario_map[(ward_id, h)] for h in sorted_horizons),
        )

    # --- CounterfactualForecaster protocol methods (contracts §5; ADR-0013) ---

    def nb_size(self, horizon: int) -> float:
        """Return calibrated negative-binomial dispersion size parameter r_h for ``horizon``."""
        cals = getattr(self._model, "calibrations", None)
        if isinstance(cals, Mapping) and horizon in cals:
            return float(cals[horizon].nb_r)
        return 5.0

    def _build_feature_rows_by_horizon(
        self,
        wards: Sequence[WardRecord],
        origin_week: date,
        horizons: Sequence[int],
    ) -> dict[int, list[dict[str, float]]]:
        """Build baseline serving feature rows aligned to ``wards`` without caching or mutating weather."""
        ward_ids = [w.ward_id for w in wards]
        obs_df, _, _ = self._load_window_dataframe(wards, origin_week, source="dataset")
        normals = self._rain_normals(obs_df)
        feat_cols = list(FEATURE_COLUMNS)
        rows_by_h: dict[int, list[dict[str, float]]] = {}

        for h in horizons:
            feat_df = build_serving_features(
                obs_df,
                origin_week=origin_week,
                horizon=h,
                ward_ids=ward_ids,
                rain_normals=normals,
            )
            if feat_df.empty:
                raise AppError(
                    status=422,
                    slug="validation-error",
                    title="Insufficient observations",
                    detail=f"Missing feature row at origin_week {origin_week.isoformat()}.",
                )
            row_by_ward: dict[str, dict[str, float]] = {}
            feat_values = feat_df[feat_cols].to_numpy(dtype=float)
            for wid, vals in zip(feat_df["ward_id"].tolist(), feat_values, strict=True):
                row_by_ward[str(wid)] = {col: float(v) for col, v in zip(feat_cols, vals, strict=True)}

            missing = sorted(set(ward_ids) - set(row_by_ward.keys()))
            if missing:
                raise AppError(
                    status=422,
                    slug="validation-error",
                    title="Insufficient observations",
                    detail=f"Missing origin_week {origin_week.isoformat()} data for wards: {', '.join(missing[:3])}",
                )
            rows_by_h[h] = [row_by_ward[wid] for wid in ward_ids]

        return rows_by_h

    def _predict_feature_rows(
        self,
        feature_rows: Sequence[Mapping[str, float]],
        ordered_wids: Sequence[str],
        horizon: int,
        origin_week: date,
    ) -> list[PointForecast]:
        target_week = origin_week + timedelta(weeks=horizon)
        target_iso = canonical_iso_week(target_week)
        if hasattr(self._model, "endemic_thresholds"):
            return list(
                cast(Any, self._model).predict(
                    feature_rows,
                    horizon,
                    ward_ids=ordered_wids,
                    target_iso_weeks=[target_iso] * len(ordered_wids),
                    include_contributions=False,
                )
            )
        return list(self._model.predict(feature_rows, horizon))

    def counterfactual_grid(
        self,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int],
        scenarios: Sequence[Mapping[str, float]],
    ) -> list[dict[tuple[str, int], PointForecast]]:
        """Evaluate multiple per-ward reduction-fraction scenarios in one LightGBM batch per horizon.

        Never mutates raw weather and never writes counterfactuals to ``predictions_cache``.
        """
        validate_origin_week(origin_week, source="dataset")
        sorted_horizons = sorted(int(h) for h in horizons)
        if not ward_ids or not scenarios:
            return [{} for _ in scenarios]

        wards = self._resolve_wards(ward_ids)
        ordered_wids = [w.ward_id for w in wards]
        base_rows_by_h = self._build_feature_rows_by_horizon(wards, origin_week, sorted_horizons)
        n_wards = len(ordered_wids)
        n_scen = len(scenarios)
        results: list[dict[tuple[str, int], PointForecast]] = [{} for _ in range(n_scen)]

        for h in sorted_horizons:
            base_rows = base_rows_by_h[h]
            stacked_rows: list[Mapping[str, float]] = []
            stacked_wids: list[str] = []
            for scen in scenarios:
                for wid, row in zip(ordered_wids, base_rows, strict=True):
                    frac = float(scen.get(wid, 0.0))
                    if frac > 0.0:
                        rain_total = max(0.0, float(row.get("rainfall_lag_0", 0.0)))
                        stacked_rows.append(apply_reduction(row, h, frac, rain_total))
                    else:
                        stacked_rows.append(row)
                    stacked_wids.append(wid)

            preds = self._predict_feature_rows(stacked_rows, stacked_wids, h, origin_week)
            for s_idx in range(n_scen):
                offset = s_idx * n_wards
                for w_idx, wid in enumerate(ordered_wids):
                    results[s_idx][(wid, h)] = preds[offset + w_idx]

        return results

    def window(
        self,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int],
    ) -> Mapping[tuple[str, int], PointForecast]:
        """Return baseline PointForecasts keyed by (ward_id, horizon) without mutating cache."""
        return self.counterfactual_grid(ward_ids, origin_week, horizons, [{}])[0]

    def counterfactual(
        self,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int],
        fractions: Mapping[str, float],
    ) -> Mapping[tuple[str, int], PointForecast]:
        """Return counterfactual PointForecasts with per-ward reductions applied strictly at feature level."""
        return self.counterfactual_grid(ward_ids, origin_week, horizons, [fractions])[0]


def cast_weather_source(val: str) -> WeatherSourceUsed:
    if val in ("dataset", "live", "cache", "climatology"):
        return cast(WeatherSourceUsed, val)
    return "dataset"
