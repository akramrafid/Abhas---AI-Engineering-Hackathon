"""FastAPI app factory."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ask, health, kb, triage
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging, log_event
from app.core.middleware import RequestContextMiddleware

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    log_event(log, "startup", llm="configured" if s.llm_enabled else "mock", model=s.llm_model)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level)
    app = FastAPI(
        title="LumaDesk API",
        version="0.1.0",
        lifespan=lifespan,
        description="AI copilot for LumaNet Fiber support agents: grounded KB answers + ticket triage.",
    )
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type", "x-request-id"],
        expose_headers=["x-request-id"],
    )
    install_error_handlers(app)
    for r in (health.router, kb.router, ask.router, triage.router):
        app.include_router(r)
    return app


app = create_app()
