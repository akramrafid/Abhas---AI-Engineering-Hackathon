"""Dependency wiring for the ops vertical slice."""

from __future__ import annotations

from app.adapters.db.factory import get_call_log
from app.adapters.runtime import get_forecast_model, get_ops_registry
from app.core.config import get_settings

from .service import OpsService


def _ensure_model_version() -> str:
    return get_forecast_model().version


def get_ops_service() -> OpsService:
    settings = get_settings()
    return OpsService(
        ops_metrics=get_ops_registry(),
        call_log=get_call_log(),
        ensure_model_loaded=_ensure_model_version,
        llm_enabled=settings.llm_enabled,
        llm_daily_budget_usd=settings.llm_daily_budget_usd,
    )
