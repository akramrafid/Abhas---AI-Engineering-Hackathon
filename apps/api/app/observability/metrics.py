"""In-process thread-safe operational counters for GET /api/v1/ops (AC-10, NFR-1, NFR-7)."""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass
from threading import RLock


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(math.ceil(pct / 100.0 * len(s))) - 1))
    return round(float(s[idx]), 3)


@dataclass(frozen=True)
class OpsSnapshot:
    model_version: str
    model_loads: int
    uptime_s: float
    pred_requests: int
    pred_cache_hits: int
    pred_cache_hit_rate: float
    pred_p50_ms: float
    pred_p95_ms: float
    weather_calls_total: int
    weather_cache_hits: int
    weather_errors: int
    llm_calls_total: int
    llm_cache_hits: int
    llm_errors: int


class OpsMetrics:
    """In-process hot counters (zero SQLite write contention under 20 VUs)."""

    def __init__(self, max_latency_samples: int = 2048) -> None:
        self._lock = RLock()
        self._started_at = time.monotonic()
        self._model_version = "unloaded"
        self._model_loads = 0
        self._pred_requests = 0
        self._pred_cache_hits = 0
        self._ward_latencies_ms: deque[float] = deque(maxlen=max_latency_samples)
        self._weather_calls_total = 0
        self._weather_cache_hits = 0
        self._weather_errors = 0
        self._llm_calls_total = 0
        self._llm_cache_hits = 0
        self._llm_errors = 0

    def record_model_load(self, version: str) -> None:
        with self._lock:
            self._model_version = version
            self._model_loads += 1

    def record_prediction(
        self,
        *,
        ward_count: int = 1,
        cache_hits: int = 0,
        per_ward_inference_ms: float | None = None,
    ) -> None:
        with self._lock:
            self._pred_requests += max(0, int(ward_count))
            self._pred_cache_hits += max(0, int(cache_hits))
            if per_ward_inference_ms is not None and per_ward_inference_ms >= 0.0:
                self._ward_latencies_ms.append(float(per_ward_inference_ms))

    def record_weather_event(
        self, *, call: bool = False, cache_hit: bool = False, error: bool = False
    ) -> None:
        with self._lock:
            if call:
                self._weather_calls_total += 1
            if cache_hit:
                self._weather_cache_hits += 1
            if error:
                self._weather_errors += 1

    def record_llm_event(self, *, call: bool = False, cache_hit: bool = False, error: bool = False) -> None:
        with self._lock:
            if call:
                self._llm_calls_total += 1
            if cache_hit:
                self._llm_cache_hits += 1
            if error:
                self._llm_errors += 1

    def snapshot(self) -> OpsSnapshot:
        with self._lock:
            lats = list(self._ward_latencies_ms)
            reqs = self._pred_requests
            hits = self._pred_cache_hits
            hit_rate = round(min(1.0, hits / reqs), 4) if reqs > 0 else 0.0
            return OpsSnapshot(
                model_version=self._model_version,
                model_loads=self._model_loads,
                uptime_s=round(max(0.0, time.monotonic() - self._started_at), 2),
                pred_requests=reqs,
                pred_cache_hits=hits,
                pred_cache_hit_rate=hit_rate,
                pred_p50_ms=_percentile(lats, 50.0),
                pred_p95_ms=_percentile(lats, 95.0),
                weather_calls_total=self._weather_calls_total,
                weather_cache_hits=self._weather_cache_hits,
                weather_errors=self._weather_errors,
                llm_calls_total=self._llm_calls_total,
                llm_cache_hits=self._llm_cache_hits,
                llm_errors=self._llm_errors,
            )

    def reset(self) -> None:
        with self._lock:
            self._started_at = time.monotonic()
            self._model_version = "unloaded"
            self._model_loads = 0
            self._pred_requests = 0
            self._pred_cache_hits = 0
            self._ward_latencies_ms.clear()
            self._weather_calls_total = 0
            self._weather_cache_hits = 0
            self._weather_errors = 0
            self._llm_calls_total = 0
            self._llm_cache_hits = 0
            self._llm_errors = 0


_global_ops_metrics = OpsMetrics()


def get_ops_metrics() -> OpsMetrics:
    return _global_ops_metrics
