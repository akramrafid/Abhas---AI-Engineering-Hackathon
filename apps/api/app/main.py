"""App factory. LEAD mounts every feature router here; feature folders never edit this file."""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select

from app.adapters.db.factory import ensure_database_ready, get_engine
from app.adapters.db.models import WardRow
from app.core.config import get_settings
from app.core.errors import PROBLEM_RESPONSES, AppError, install_error_handlers
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.ratelimit import BodySizeLimitMiddleware, RateLimitMiddleware
from app.core.readiness import evaluate_readiness_checks, get_readiness_checks
from app.features.advisory.router import router as advisory_router
from app.features.forecast.router import router as forecast_router
from app.features.heatmap.router import router as heatmap_router
from app.features.lags.router import router as lags_router
from app.features.ops.router import router as ops_router
from app.features.validation.router import router as validation_router
from app.features.wards.router import router as wards_router
from app.features.weather.router import router as weather_router

API_VERSION = "0.1.0"
logger = logging.getLogger("abhas.main")


def _database_is_seeded() -> bool:
    engine = get_engine()
    if not inspect(engine).has_table("wards"):
        return False
    with engine.connect() as conn:
        ward_count = int(conn.execute(select(func.count()).select_from(WardRow.__table__)).scalar_one())
    return ward_count > 0


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    # Ensure DB is ready (dev/test auto-migrates/seeds; production requires pre-seeded DB).
    # CORE extends readiness via app.state.checks or app.core.readiness.register_readiness_check("model", ...).
    try:
        ensure_database_ready()
    except Exception:
        logger.exception("database bootstrap failed during startup")

    checks: dict[str, Any] = {"database": _database_is_seeded}
    checks.update(get_readiness_checks())
    checks.update(getattr(app.state, "checks", {}))
    app.state.checks = checks
    results = evaluate_readiness_checks(app.state.checks)
    app.state.started = True
    app.state.ready = bool(results) and all(results.values())
    yield
    app.state.started = False
    app.state.ready = False


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(
        title="Abhas API",
        version=API_VERSION,
        description="Ward-level dengue early warning: lag features, LightGBM forecasts, tiers and drivers.",
        lifespan=lifespan,
    )
    app.state.checks = {}
    app.state.started = False
    app.state.ready = False
    install_error_handlers(app)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        per_minute=settings.rate_limit_per_minute,
        advisory_per_minute=20 if settings.llm_enabled else settings.rate_limit_per_minute,
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID", "X-Ops-Token"],
    )

    @app.get("/healthz", tags=["health"], summary="Liveness")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(
        "/readyz",
        tags=["health"],
        summary="Readiness: model loaded and data seeded",
        responses={503: PROBLEM_RESPONSES[503]},
    )
    def readyz() -> dict[str, Any]:
        if not bool(getattr(app.state, "started", False)):
            raise AppError(503, "not-ready", "Service not ready", "Startup checks have not completed")
        checks: dict[str, Any] = getattr(app.state, "checks", {})
        results = evaluate_readiness_checks(checks)
        failed = [name for name, ok in results.items() if not ok]
        app.state.ready = bool(results) and not failed
        if not app.state.ready:
            detail = (
                f"Failed readiness checks: {', '.join(failed)}"
                if failed
                else "No readiness checks registered"
            )
            raise AppError(503, "not-ready", "Service not ready", detail)
        return {"status": "ready", "version": API_VERSION, "checks": results}

    for r in (
        wards_router,
        lags_router,
        forecast_router,
        heatmap_router,
        validation_router,
        weather_router,
        advisory_router,
        ops_router,
    ):
        app.include_router(r)
    return app


app = create_app()
