"""Business logic for the ops slice (framework-free, AC-10, NFR-7)."""

from __future__ import annotations

from collections.abc import Callable

from app.observability.metrics import OpsMetrics
from app.ports.repositories import CallLog

from .schemas import CallStats, LLMStats, OpsResponse, PredictionStats

# Baseline monthly cost estimate for one city health office when Haiku advisory is enabled
# (20 wards x 2 languages x 4 weeks x 2 ad-hoc/mo = 320 calls @ ~$0.00215/call, docs/system-design.md §6b).
OFFICE_LLM_BASELINE_MONTHLY_USD = 0.69


class OpsService:
    """Assembles measured cost, cache hit rate, inference latency, and call counters."""

    def __init__(
        self,
        ops_metrics: OpsMetrics,
        call_log: CallLog,
        *,
        ensure_model_loaded: Callable[[], str],
        llm_enabled: bool,
        llm_daily_budget_usd: float,
    ) -> None:
        self._ops = ops_metrics
        self._call_log = call_log
        self._ensure_model_loaded = ensure_model_loaded
        self._llm_enabled = llm_enabled
        self._llm_daily_budget_usd = float(llm_daily_budget_usd)

    def snapshot(self) -> OpsResponse:
        # Ensure the artifact is loaded once so model_loads == 1 and model_version is accurate (AC-10).
        model_version = self._ensure_model_loaded()
        snap = self._ops.snapshot()

        try:
            weather_today, _ = self._call_log.today("weather")
            llm_today, llm_spend_today = self._call_log.today("llm")
        except Exception:  # noqa: BLE001
            weather_today = 0
            llm_today = 0
            llm_spend_today = 0.0

        weather_total = max(snap.weather_calls_total, weather_today)
        llm_total = max(snap.llm_calls_total, llm_today)

        if self._llm_enabled:
            est_monthly = round(
                min(self._llm_daily_budget_usd * 30.0, max(OFFICE_LLM_BASELINE_MONTHLY_USD, llm_spend_today * 30.0)),
                2,
            )
        else:
            est_monthly = round(llm_spend_today * 30.0, 2)

        return OpsResponse(
            model_version=model_version,
            model_loads=snap.model_loads,
            uptime_s=snap.uptime_s,
            predictions=PredictionStats(
                requests=snap.pred_requests,
                cache_hits=snap.pred_cache_hits,
                cache_hit_rate=snap.pred_cache_hit_rate,
                p50_ms=snap.pred_p50_ms,
                p95_ms=snap.pred_p95_ms,
            ),
            weather=CallStats(
                calls_today=weather_today,
                calls_total=weather_total,
                cache_hits=snap.weather_cache_hits,
                errors=snap.weather_errors,
            ),
            llm=LLMStats(
                calls_today=llm_today,
                calls_total=llm_total,
                cache_hits=snap.llm_cache_hits,
                errors=snap.llm_errors,
                spend_usd_today=round(max(0.0, llm_spend_today), 6),
                budget_usd_per_day=self._llm_daily_budget_usd,
                enabled=self._llm_enabled,
            ),
            est_monthly_cost_usd=est_monthly,
        )
