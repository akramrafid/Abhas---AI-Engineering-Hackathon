"""App factory. LEAD mounts every feature router here; feature folders never edit this file."""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import PROBLEM_RESPONSES, AppError, install_error_handlers
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.ratelimit import BodySizeLimitMiddleware, RateLimitMiddleware
from app.features.advisory.router import router as advisory_router
from app.features.forecast.router import router as forecast_router
from app.features.heatmap.router import router as heatmap_router
from app.features.lags.router import router as lags_router
from app.features.ops.router import router as ops_router
from app.features.validation.router import router as validation_router
from app.features.wards.router import router as wards_router
from app.features.weather.router import router as weather_router

API_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    # CORE wires startup here via app.state (model loaded once, caches warmed); LEAD reviews the change.
    app.state.ready = True
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(
        title="Abhas API",
        version=API_VERSION,
        description="Ward-level dengue early warning: lag features, LightGBM forecasts, tiers and drivers.",
        lifespan=lifespan,
    )
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
        if not bool(getattr(app.state, "ready", False)):
            raise AppError(503, "not-ready", "Service not ready", "Model or database is not ready")
        return {"status": "ready", "version": API_VERSION}

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
