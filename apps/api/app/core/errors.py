"""Error envelope + handlers. Never leak internals to clients."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import request_id_var

log = logging.getLogger("app.errors")


class AppError(Exception):
    """Expected, user-facing failure."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class UpstreamError(AppError):
    def __init__(self, message: str = "The AI provider is unavailable. Please try again.") -> None:
        super().__init__("upstream_unavailable", message, 503)


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id_var.get()}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        log.warning("app_error", extra={"data": {"code": exc.code}})
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = f"{loc}: {first.get('msg', 'invalid input')}" if loc else "Invalid input"
        return JSONResponse(_body("validation_error", msg), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error")
        return JSONResponse(_body("internal_error", "Something went wrong. Please try again."), 500)
