"""Process-wide runtime singletons for CORE adapters (model loaded once, trace sinks, LLM, validation)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import RLock
from typing import Any

from app.adapters.db.factory import get_call_log, get_engine
from app.adapters.lgbm_model import LGBMForecastModel, load_model, verify_artifact_integrity
from app.adapters.llm import AnthropicLLM
from app.core.config import API_DIR, active_faults, get_settings
from app.core.errors import AppError
from app.observability.metrics import OpsMetrics, get_ops_metrics
from app.observability.traces import FanOutSink, MemorySink, SqlLlmTraceSink, StdoutSink, TraceSink
from app.ports.llm import LLM

logger = logging.getLogger("abhas.runtime")

VALIDATION_RESULTS_PATH = API_DIR / "evals" / "results" / "validation.json"

_lock = RLock()
_model_singleton: LGBMForecastModel | None = None
_model_path_loaded: Path | None = None
_llm_singleton: AnthropicLLM | None = None
_memory_sink = MemorySink()
_trace_sink: TraceSink | None = None
_validation_cache: tuple[float, dict[str, Any]] | None = None


def check_db_fault() -> None:
    """Simulate SQLite outage strictly when APP_ENV=test and FAULT_INJECT includes db_down."""
    if "db_down" in active_faults():
        raise AppError(
            status=503,
            slug="db-unavailable",
            title="Database unavailable",
            detail="Database connection is temporarily unavailable.",
        )


def get_forecast_model() -> LGBMForecastModel:
    """Load the committed LightGBM joblib artifact ONCE per process and verify its SHA-256."""
    global _model_singleton, _model_path_loaded
    settings = get_settings()
    target = settings.model_path
    with _lock:
        if _model_singleton is not None and _model_path_loaded == target:
            return _model_singleton
        model = load_model(target)
        _model_singleton = model
        _model_path_loaded = target
        get_ops_metrics().record_model_load(model.version)
        logger.info("model_loaded: %s", model.version, extra={"event": "model_loaded"})
        return model


def check_model_readiness() -> dict[str, Any]:
    """Verify artifact SHA-256 and ensure the model is loaded once for /readyz (CR-16).

    Raises ModelArtifactError (HTTP 503) if the artifact is missing, unreadable, or corrupt.
    """
    settings = get_settings()
    meta = verify_artifact_integrity(settings.model_path)
    model = get_forecast_model()
    return {
        "ok": True,
        "model_version": model.version,
        "sha256": str(meta.get("sha256", "")),
        "model_loads": get_ops_metrics().snapshot().model_loads,
    }


def get_memory_trace_sink() -> MemorySink:
    return _memory_sink


def get_trace_sink() -> TraceSink:
    global _trace_sink
    with _lock:
        if _trace_sink is not None:
            return _trace_sink
        settings = get_settings()
        db_sink = SqlLlmTraceSink(get_engine())
        if settings.app_env == "test":
            _trace_sink = FanOutSink(_memory_sink, db_sink)
        else:
            _trace_sink = FanOutSink(StdoutSink(), db_sink)
        return _trace_sink


def get_llm_adapter() -> LLM | None:
    """Return process-wide AnthropicLLM when ANTHROPIC_API_KEY is set, else None (template default)."""
    global _llm_singleton
    settings = get_settings()
    if not settings.llm_enabled:
        return None
    with _lock:
        if _llm_singleton is None:
            _llm_singleton = AnthropicLLM(
                call_log=get_call_log(),
                trace_sink=get_trace_sink(),
                ops_metrics=get_ops_metrics(),
                settings=settings,
            )
        return _llm_singleton


def get_validation_payload(path: Path | None = None) -> dict[str, Any]:
    """Load and cache apps/api/evals/results/validation.json; raise 503 if unavailable."""
    global _validation_cache
    target = path or VALIDATION_RESULTS_PATH
    if not target.exists():
        raise AppError(
            status=503,
            slug="validation-unavailable",
            title="Validation results unavailable",
            detail="Stored backtest results not found; run npm run backtest.",
        )
    mtime = target.stat().st_mtime
    with _lock:
        if path is None and _validation_cache is not None and _validation_cache[0] == mtime:
            return _validation_cache[1]
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise AppError(
                status=503,
                slug="validation-unavailable",
                title="Validation results unreadable",
                detail="Stored backtest results could not be parsed.",
            ) from exc
        if path is None:
            _validation_cache = (mtime, data)
        return dict(data)


def get_ops_registry() -> OpsMetrics:
    return get_ops_metrics()


def reset_runtime() -> None:
    """Reset process-wide singletons (primarily for tests)."""
    global _model_singleton, _model_path_loaded, _llm_singleton, _trace_sink, _validation_cache
    with _lock:
        if _llm_singleton is not None:
            _llm_singleton.close()
        _model_singleton = None
        _model_path_loaded = None
        _llm_singleton = None
        _trace_sink = None
        _validation_cache = None
        _memory_sink.clear()
        get_ops_metrics().reset()
