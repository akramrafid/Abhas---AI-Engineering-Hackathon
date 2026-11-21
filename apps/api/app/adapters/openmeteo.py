"""Open-Meteo WeatherSource adapter (ADR-0005).

- Versioned 5-city centroids from `apps/api/config/city_centroids.json`.
- ONE multi-location `httpx.Client` request (`past_days=92&forecast_days=16`, Asia/Dhaka)
  covering all 5 Bangladesh cities at once, aggregated to ISO weeks (Mon-Sun).
- 6 h TTL in `weather_cache`, 5 s connect / 10 s read timeout, 2 retries with jitter on 429/5xx,
  simple circuit breaker, fallback chain `live -> last cache -> ward climatology`.
- `FAULT_INJECT` support (`openmeteo_timeout`, `openmeteo_5xx`) honoured ONLY when `APP_ENV=test`.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import time
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any

import httpx

from app.adapters.db.repositories import SqlWeatherCache, WeatherCacheEntry
from app.core.config import API_DIR, get_settings
from app.core.types import CITIES, WeatherMode, WeatherSourceUsed
from app.ports.repositories import CallLog, ObservationRepository
from app.ports.weather import WeekWeather
from app.shared.features import DEFAULT_TRAIN_MAX_YEAR, canonical_iso_week

logger = logging.getLogger("abhas.weather")

DEFAULT_CENTROIDS_PATH = API_DIR / "config" / "city_centroids.json"
RETRYABLE_STATUS_CODES: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def load_city_centroids(path: Path | None = None) -> dict[str, Any]:
    target = path or DEFAULT_CENTROIDS_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def aggregate_daily_to_iso_weeks(
    daily: Mapping[str, Sequence[Any]],
    *,
    bias_correction: Mapping[str, float] | None = None,
) -> dict[date, dict[str, float]]:
    """Aggregate Open-Meteo daily arrays into ISO weeks (Monday start, Asia/Dhaka) in dataset units."""
    times = daily.get("time") or []
    t_mean = daily.get("temperature_2m_mean") or []
    t_max = daily.get("temperature_2m_max") or []
    t_min = daily.get("temperature_2m_min") or []
    precip = daily.get("precipitation_sum") or []
    rh = daily.get("relative_humidity_2m_mean") or []

    buckets: dict[date, dict[str, list[float]]] = defaultdict(
        lambda: {"tavg": [], "tmax": [], "tmin": [], "rain": [], "rh": []}
    )

    for idx, day_str in enumerate(times):
        d = date.fromisoformat(str(day_str)[:10])
        monday = d - timedelta(days=d.weekday())
        b = buckets[monday]
        if idx < len(t_mean) and t_mean[idx] is not None:
            b["tavg"].append(float(t_mean[idx]))
        if idx < len(t_max) and t_max[idx] is not None:
            b["tmax"].append(float(t_max[idx]))
        if idx < len(t_min) and t_min[idx] is not None:
            b["tmin"].append(float(t_min[idx]))
        if idx < len(precip) and precip[idx] is not None:
            b["rain"].append(max(0.0, float(precip[idx])))
        if idx < len(rh) and rh[idx] is not None:
            b["rh"].append(min(100.0, max(0.0, float(rh[idx]))))

    corr = bias_correction or {}
    temp_offset = float(corr.get("temp_offset_c", 0.0))
    rain_scale = float(corr.get("rain_scale", 1.0))
    rh_offset = float(corr.get("humidity_offset_pct", 0.0))

    weekly: dict[date, dict[str, float]] = {}
    for monday, b in sorted(buckets.items()):
        if not b["tavg"] and not b["rain"]:
            continue
        avg_t = (sum(b["tavg"]) / len(b["tavg"]) if b["tavg"] else 27.0) + temp_offset
        max_t = (max(b["tmax"]) if b["tmax"] else avg_t + 3.0) + temp_offset
        min_t = (min(b["tmin"]) if b["tmin"] else avg_t - 3.0) + temp_offset
        rain_sum = max(0.0, sum(b["rain"]) * rain_scale)
        rh_avg = min(100.0, max(0.0, (sum(b["rh"]) / len(b["rh"]) if b["rh"] else 75.0) + rh_offset))
        weekly[monday] = {
            "avg_temp_c": round(avg_t, 2),
            "max_temp_c": round(max_t, 2),
            "min_temp_c": round(min_t, 2),
            "rainfall_mm": round(rain_sum, 2),
            "relative_humidity_pct": round(rh_avg, 2),
        }
    return weekly


@dataclass(frozen=True)
class CityStatusSnapshot:
    city: str
    latitude: float
    longitude: float
    source: WeatherSourceUsed
    last_fetched_at: datetime | None
    cache_age_hours: float | None


@dataclass(frozen=True)
class WeatherStatusSnapshot:
    mode: WeatherMode
    provider: str
    attribution: str
    ttl_hours: float
    bias_check_passed: bool | None
    cities: list[CityStatusSnapshot]


class OpenMeteoWeatherSource:
    """Implements app.ports.weather.WeatherSource with multi-city batching, caching, and fallback."""

    name: str = "open-meteo"

    def __init__(
        self,
        repo: ObservationRepository,
        *,
        weather_cache: SqlWeatherCache | None = None,
        call_log: CallLog | None = None,
        mode: WeatherMode | None = None,
        base_url: str | None = None,
        ttl_hours: float | None = None,
        connect_timeout_s: float | None = None,
        read_timeout_s: float | None = None,
        app_env: str | None = None,
        client: httpx.Client | None = None,
        clock: Callable[[], datetime] | None = None,
        retry_base_s: float = 0.25,
        breaker_threshold: int = 3,
        breaker_cooldown_s: float = 300.0,
        centroids_path: Path | None = None,
        max_normal_year: int = DEFAULT_TRAIN_MAX_YEAR,
    ) -> None:
        settings = get_settings()
        self._repo = repo
        self._weather_cache = weather_cache
        self._call_log = call_log
        self._mode: WeatherMode = mode or settings.weather_mode
        self._base_url = base_url or settings.open_meteo_base_url
        self._ttl_hours = float(ttl_hours if ttl_hours is not None else settings.weather_cache_ttl_hours)
        self._app_env = app_env or settings.app_env
        self._clock = clock or (lambda: datetime.now(UTC))
        self._retry_base_s = retry_base_s
        self._breaker_threshold = breaker_threshold
        self._breaker_cooldown_s = breaker_cooldown_s
        self._max_normal_year = int(max_normal_year)

        cfg = load_city_centroids(centroids_path)
        self._provider: str = str(cfg.get("provider", "Open-Meteo (CC BY 4.0)"))
        self._attribution: str = str(cfg.get("attribution", "Weather data by Open-Meteo.com (CC BY 4.0)"))
        bias_cfg = cfg.get("bias_check") or {}
        raw_passed = bias_cfg.get("passed")
        self._bias_check_passed: bool | None = bool(raw_passed) if isinstance(raw_passed, bool) else None
        self._centroids: list[dict[str, Any]] = list(cfg["cities"])
        self._centroid_by_city: dict[str, dict[str, Any]] = {c["city"]: c for c in self._centroids}

        conn_to = float(
            connect_timeout_s if connect_timeout_s is not None else settings.weather_connect_timeout_s
        )
        read_to = float(read_timeout_s if read_timeout_s is not None else settings.weather_read_timeout_s)
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(connect=conn_to, read=read_to, write=5.0, pool=5.0)
        )

        self._lock = RLock()
        self._mem_cache: dict[str, dict[date, WeatherCacheEntry]] = defaultdict(dict)
        self._consecutive_failures = 0
        self._circuit_open_until: datetime | None = None
        self._climatology_cache: dict[str, dict[int, tuple[float, float, float, float, float]]] = {}

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def _now(self) -> datetime:
        now = self._clock()
        return now.replace(tzinfo=UTC) if now.tzinfo is None else now.astimezone(UTC)

    def _city_climatology(self, city: str) -> dict[int, tuple[float, float, float, float, float]]:
        with self._lock:
            cached = self._climatology_cache.get(city)
            if cached is not None:
                return cached

        wards = self._repo.wards(city=city)
        buckets: dict[int, list[tuple[float, float, float, float, float]]] = defaultdict(list)
        for ward in wards:
            for obs in self._repo.history(ward.ward_id):
                if obs.week.year <= self._max_normal_year:
                    iso_w = canonical_iso_week(obs.week)
                    buckets[iso_w].append(
                        (
                            obs.avg_temp_c,
                            obs.max_temp_c,
                            obs.min_temp_c,
                            obs.rainfall_mm,
                            obs.relative_humidity_pct,
                        )
                    )

        normals: dict[int, tuple[float, float, float, float, float]] = {}
        for iso_w, rows in buckets.items():
            n = float(len(rows))
            normals[iso_w] = (
                round(sum(r[0] for r in rows) / n, 2),
                round(sum(r[1] for r in rows) / n, 2),
                round(sum(r[2] for r in rows) / n, 2),
                round(sum(r[3] for r in rows) / n, 2),
                round(sum(r[4] for r in rows) / n, 2),
            )
        with self._lock:
            self._climatology_cache[city] = normals
        return normals

    def _climatology_week(self, city: str, week: date) -> WeekWeather:
        normals = self._city_climatology(city)
        iso_w = canonical_iso_week(week)
        vals = normals.get(iso_w)
        if vals is None and normals:
            all_vals = list(normals.values())
            n = float(len(all_vals))
            vals = (
                round(sum(v[0] for v in all_vals) / n, 2),
                round(sum(v[1] for v in all_vals) / n, 2),
                round(sum(v[2] for v in all_vals) / n, 2),
                round(sum(v[3] for v in all_vals) / n, 2),
                round(sum(v[4] for v in all_vals) / n, 2),
            )
        if vals is None:
            vals = (27.0, 31.0, 23.0, 35.0, 72.0)
        return WeekWeather(
            week=week,
            avg_temp_c=vals[0],
            max_temp_c=vals[1],
            min_temp_c=vals[2],
            rainfall_mm=vals[3],
            relative_humidity_pct=vals[4],
            source="climatology",
        )

    def _dataset_weekly(self, city: str, weeks: Sequence[date]) -> list[WeekWeather]:
        if not weeks:
            return []
        wards = self._repo.wards(city=city)
        start_w, end_w = min(weeks), max(weeks)
        wanted = set(weeks)
        by_week: dict[date, list[tuple[float, float, float, float, float]]] = defaultdict(list)
        for ward in wards:
            for obs in self._repo.history(ward.ward_id, start=start_w, end=end_w):
                if obs.week in wanted:
                    by_week[obs.week].append(
                        (
                            obs.avg_temp_c,
                            obs.max_temp_c,
                            obs.min_temp_c,
                            obs.rainfall_mm,
                            obs.relative_humidity_pct,
                        )
                    )

        out: list[WeekWeather] = []
        for wk in weeks:
            rows = by_week.get(wk)
            if rows:
                n = float(len(rows))
                out.append(
                    WeekWeather(
                        week=wk,
                        avg_temp_c=round(sum(r[0] for r in rows) / n, 2),
                        max_temp_c=round(sum(r[1] for r in rows) / n, 2),
                        min_temp_c=round(sum(r[2] for r in rows) / n, 2),
                        rainfall_mm=round(sum(r[3] for r in rows) / n, 2),
                        relative_humidity_pct=round(sum(r[4] for r in rows) / n, 2),
                        source="dataset",
                    )
                )
            else:
                out.append(self._climatology_week(city, wk))
        return out

    def _latest_fetches(self) -> dict[str, tuple[datetime, datetime]]:
        fetches: dict[str, tuple[datetime, datetime]] = {}
        if self._weather_cache is not None:
            fetches.update(self._weather_cache.latest_city_fetches())
        for city, wk_map in self._mem_cache.items():
            if not wk_map:
                continue
            max_f = max(e.fetched_at for e in wk_map.values())
            max_e = max(e.expires_at for e in wk_map.values())
            prev = fetches.get(city)
            if prev is None or max_f > prev[0]:
                fetches[city] = (max_f, max_e)
        return fetches

    def _cache_is_fresh(self, city: str, now: datetime) -> bool:
        fetches = self._latest_fetches()
        city_fetch = fetches.get(city)
        return city_fetch is not None and city_fetch[1] > now

    def _read_cached_weeks(self, city: str, weeks: Sequence[date]) -> dict[date, WeatherCacheEntry]:
        out: dict[date, WeatherCacheEntry] = {}
        if self._weather_cache is not None:
            out.update(self._weather_cache.get_city_weeks(city, weeks))
        mem_city = self._mem_cache.get(city, {})
        for wk in weeks:
            mem_entry = mem_city.get(wk)
            if mem_entry is not None:
                prev = out.get(wk)
                if prev is None or mem_entry.fetched_at >= prev.fetched_at:
                    out[wk] = mem_entry
        return out

    def _sleep_backoff(self, attempt: int, retry_after_header: str | None = None) -> None:
        if self._retry_base_s <= 0:
            return
        delay = self._retry_base_s * (2**attempt)
        jitter = (secrets.randbelow(1000) / 1000.0) * self._retry_base_s
        if retry_after_header is not None:
            try:
                delay = min(2.0, max(delay, float(retry_after_header)))
            except ValueError:
                pass
        time.sleep(min(2.0, delay + jitter))

    def _check_fault_inject(self) -> None:
        if self._app_env != "test":
            return
        fault = os.getenv("FAULT_INJECT", "").strip().lower()
        if fault == "openmeteo_timeout":
            raise httpx.ReadTimeout("Injected fault: openmeteo_timeout")
        if fault == "openmeteo_5xx":
            req = httpx.Request("GET", self._base_url)
            resp = httpx.Response(503, request=req, text="Injected fault: openmeteo_5xx")
            raise httpx.HTTPStatusError("Injected fault: openmeteo_5xx", request=req, response=resp)

    def _fetch_all_cities_live(self, now: datetime) -> bool:
        """Execute ONE multi-location Open-Meteo GET for all 5 cities and cache results."""
        if self._circuit_open_until is not None and now < self._circuit_open_until:
            logger.warning("openmeteo_circuit_open", extra={"event": "openmeteo_circuit_open"})
            return False

        lat_str = ",".join(str(c["latitude"]) for c in self._centroids)
        lon_str = ",".join(str(c["longitude"]) for c in self._centroids)
        params = {
            "latitude": lat_str,
            "longitude": lon_str,
            "daily": ",".join(
                [
                    "temperature_2m_mean",
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "relative_humidity_2m_mean",
                ]
            ),
            "timezone": "Asia/Dhaka",
            "past_days": "92",
            "forecast_days": "16",
        }

        t0 = time.perf_counter()
        last_err = ""
        payload: Any = None

        for attempt in range(3):  # initial attempt + up to 2 retries
            try:
                self._check_fault_inject()
                resp = self._client.get(self._base_url, params=params)
                if resp.status_code in RETRYABLE_STATUS_CODES:
                    last_err = f"HTTP {resp.status_code}"
                    if attempt < 2:
                        self._sleep_backoff(attempt, resp.headers.get("Retry-After"))
                        continue
                    resp.raise_for_status()
                resp.raise_for_status()
                payload = resp.json()
                break
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code if exc.response is not None else 0
                last_err = f"HTTPStatusError({status})"
                if status in RETRYABLE_STATUS_CODES and attempt < 2:
                    retry_after = (
                        exc.response.headers.get("Retry-After") if exc.response is not None else None
                    )
                    self._sleep_backoff(attempt, retry_after)
                    continue
                break
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_err = type(exc).__name__
                if attempt < 2:
                    self._sleep_backoff(attempt)
                    continue
                break
            except ValueError as exc:
                last_err = f"InvalidJSON({type(exc).__name__})"
                break

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        if payload is None:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._breaker_threshold:
                self._circuit_open_until = now + timedelta(seconds=self._breaker_cooldown_s)
            if self._call_log is not None:
                self._call_log.record("weather", ok=False, latency_ms=latency_ms, detail=last_err)
            logger.error(
                "openmeteo_fetch_failed: %s",
                last_err,
                extra={"duration_ms": latency_ms, "event": "openmeteo_fetch_failed"},
            )
            return False

        items = payload if isinstance(payload, list) else [payload]
        if len(items) != len(self._centroids):
            self._consecutive_failures += 1
            if self._call_log is not None:
                self._call_log.record(
                    "weather",
                    ok=False,
                    latency_ms=latency_ms,
                    detail=f"Unexpected location count: {len(items)}",
                )
            return False

        expires_at = now + timedelta(hours=self._ttl_hours)
        entries: list[WeatherCacheEntry] = []
        for city_cfg, loc_payload in zip(self._centroids, items, strict=True):
            city_name = str(city_cfg["city"])
            weekly = aggregate_daily_to_iso_weeks(
                loc_payload.get("daily", {}),
                bias_correction=city_cfg.get("bias_correction"),
            )
            for monday, vals in weekly.items():
                entry = WeatherCacheEntry(
                    city=city_name,
                    week=monday,
                    avg_temp_c=vals["avg_temp_c"],
                    max_temp_c=vals["max_temp_c"],
                    min_temp_c=vals["min_temp_c"],
                    rainfall_mm=vals["rainfall_mm"],
                    relative_humidity_pct=vals["relative_humidity_pct"],
                    source="live",
                    fetched_at=now,
                    expires_at=expires_at,
                )
                entries.append(entry)
                self._mem_cache[city_name][monday] = entry

        if self._weather_cache is not None:
            self._weather_cache.upsert_entries(entries)

        self._consecutive_failures = 0
        self._circuit_open_until = None
        if self._call_log is not None:
            self._call_log.record(
                "weather",
                ok=True,
                latency_ms=latency_ms,
                detail=f"cities={len(self._centroids)} weeks={len(entries)}",
            )
        logger.info(
            "openmeteo_fetch_ok",
            extra={"duration_ms": latency_ms, "event": "openmeteo_fetch_ok"},
        )
        return True

    def weekly(self, city: str, weeks: list[date]) -> list[WeekWeather]:
        """Weather for each requested week. Never raises for a missing week; falls back and labels source."""
        if not weeks:
            return []
        if self._mode == "dataset":
            return self._dataset_weekly(city, weeks)

        with self._lock:
            now = self._now()
            fetched_now = False
            if not self._cache_is_fresh(city, now):
                fetched_now = self._fetch_all_cities_live(now)

            cached_map = self._read_cached_weeks(city, weeks)

        out: list[WeekWeather] = []
        for wk in weeks:
            entry = cached_map.get(wk)
            if entry is not None:
                source: WeatherSourceUsed = "live" if fetched_now else "cache"
                out.append(
                    WeekWeather(
                        week=wk,
                        avg_temp_c=entry.avg_temp_c,
                        max_temp_c=entry.max_temp_c,
                        min_temp_c=entry.min_temp_c,
                        rainfall_mm=entry.rainfall_mm,
                        relative_humidity_pct=entry.relative_humidity_pct,
                        source=source,
                    )
                )
            else:
                out.append(self._climatology_week(city, wk))
        return out

    def status_snapshot(self) -> WeatherStatusSnapshot:
        """Build status overview for GET /api/v1/weather/status without triggering a network call."""
        now = self._now()
        fetches = self._latest_fetches()
        cities_out: list[CityStatusSnapshot] = []
        for city_name in CITIES:
            cfg = self._centroid_by_city[city_name]
            lat = float(cfg["latitude"])
            lon = float(cfg["longitude"])
            if self._mode == "dataset":
                cities_out.append(
                    CityStatusSnapshot(
                        city=city_name,
                        latitude=lat,
                        longitude=lon,
                        source="dataset",
                        last_fetched_at=None,
                        cache_age_hours=None,
                    )
                )
                continue

            fetch_info = fetches.get(city_name)
            if fetch_info is not None:
                fetched_at, expires_at = fetch_info
                age_hours = max(0.0, round((now - fetched_at).total_seconds() / 3600.0, 2))
                src: WeatherSourceUsed = "live" if expires_at > now else "cache"
                cities_out.append(
                    CityStatusSnapshot(
                        city=city_name,
                        latitude=lat,
                        longitude=lon,
                        source=src,
                        last_fetched_at=fetched_at,
                        cache_age_hours=age_hours,
                    )
                )
            else:
                cities_out.append(
                    CityStatusSnapshot(
                        city=city_name,
                        latitude=lat,
                        longitude=lon,
                        source="climatology",
                        last_fetched_at=None,
                        cache_age_hours=None,
                    )
                )

        return WeatherStatusSnapshot(
            mode=self._mode,
            provider=self._provider,
            attribution=self._attribution,
            ttl_hours=self._ttl_hours,
            bias_check_passed=self._bias_check_passed,
            cities=cities_out,
        )


_weather_lock = RLock()
_weather_singleton: OpenMeteoWeatherSource | None = None


def get_weather_source() -> OpenMeteoWeatherSource:
    """Return process-wide OpenMeteoWeatherSource singleton backed by SQLite adapters."""
    global _weather_singleton
    with _weather_lock:
        if _weather_singleton is None:
            from app.adapters.db.factory import (
                get_call_log,
                get_observation_repository,
                get_weather_cache,
            )

            _weather_singleton = OpenMeteoWeatherSource(
                repo=get_observation_repository(),
                weather_cache=get_weather_cache(),
                call_log=get_call_log(),
            )
        return _weather_singleton


def reset_weather_source() -> None:
    """Close and clear the cached singleton (for tests)."""
    global _weather_singleton
    with _weather_lock:
        if _weather_singleton is not None:
            _weather_singleton.close()
            _weather_singleton = None
