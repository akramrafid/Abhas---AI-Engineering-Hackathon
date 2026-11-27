"""RFC 9457 problem+json errors. Every route documents PROBLEM_RESPONSES so contract tests check statuses."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_var

PROBLEM_BASE = "https://abhas.dev/problems/"
PROBLEM_MEDIA = "application/problem+json"


class FieldError(BaseModel):
    field: str = Field(description="Dotted path of the offending field, e.g. body.ward_ids.0")
    message: str


class Problem(BaseModel):
    type: str = Field(
        description="URI identifying the problem type", examples=[PROBLEM_BASE + "unknown-ward"]
    )
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None
    errors: list[FieldError] | None = None


class AppError(Exception):
    """Raised by services; mapped to problem+json by the handler below."""

    def __init__(self, status: int, slug: str, title: str, detail: str | None = None) -> None:
        super().__init__(detail or title)
        self.status, self.slug, self.title, self.detail = status, slug, title, detail


def _problem(
    status: int,
    slug: str,
    title: str,
    detail: str | None,
    request: Request,
    headers: dict[str, str] | None = None,
    **extra: Any,
) -> JSONResponse:
    rid = request_id_var.get()
    body = Problem(
        type=PROBLEM_BASE + slug,
        title=title,
        status=status,
        detail=detail,
        instance=request.url.path,
        request_id=None if rid == "-" else rid,
        **extra,
    )
    return JSONResponse(
        body.model_dump(exclude_none=True),
        status_code=status,
        media_type=PROBLEM_MEDIA,
        headers=headers,
    )


def _p(desc: str) -> dict[str, Any]:
    return {
        "model": Problem,
        "description": desc,
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    }


PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: _p("Malformed request body or syntax error"),
    401: _p("Missing or invalid X-Ops-Token"),
    404: _p("Unknown ward, city or resource"),
    413: _p("Request body exceeds the 64 KB size limit"),
    422: _p("Request failed validation; `errors` names each field"),
    429: _p("Rate limit exceeded; retry after the Retry-After header"),
    500: _p("Unexpected server error"),
    503: _p("Model or data not ready (run npm run setup)"),
}


class UnhandledExceptionMiddleware:
    """Catch unhandled exceptions INSIDE CORS/RequestId so 500s keep X-Request-ID and CORS headers (SEC-7)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracked_send)
        except Exception:
            path = str(scope.get("path", ""))
            logging.getLogger("abhas").exception("unhandled error on %s", path)
            if response_started:
                raise
            rid = request_id_var.get()
            body = Problem(
                type=PROBLEM_BASE + "internal-error",
                title="Internal server error",
                status=500,
                instance=path,
                request_id=None if rid == "-" else rid,
            )
            response = JSONResponse(
                body.model_dump(exclude_none=True),
                status_code=500,
                media_type=PROBLEM_MEDIA,
            )
            await response(scope, receive, send)


def _collect_allowed_methods(routes: Sequence[Any], scope: Scope) -> set[str]:
    allowed: set[str] = set()
    for route in routes:
        original = getattr(route, "original_router", None)
        if original is not None and hasattr(original, "routes"):
            allowed.update(_collect_allowed_methods(original.routes, scope))
            continue
        subroutes = getattr(route, "routes", None)
        if subroutes is not None:
            allowed.update(_collect_allowed_methods(subroutes, scope))
            continue
        match, _ = route.matches(scope)
        if match in (Match.FULL, Match.PARTIAL):
            methods = getattr(route, "methods", None)
            if methods:
                allowed.update(m for m in methods if m != "HEAD")
    return allowed


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return _problem(exc.status, exc.slug, exc.title, exc.detail, request)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            FieldError(field=".".join(str(p) for p in e.get("loc", ())), message=str(e.get("msg", "invalid")))
            for e in exc.errors()
        ]
        return _problem(422, "validation-error", "Request validation failed", None, request, errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        slug = {
            400: "bad-request",
            404: "not-found",
            405: "method-not-allowed",
            429: "rate-limited",
        }.get(exc.status_code, "http-error")
        headers = {str(k): str(v) for k, v in exc.headers.items()} if exc.headers else None
        if exc.status_code == 405:
            allowed = _collect_allowed_methods(request.app.routes, request.scope)
            if allowed:
                headers = {k: v for k, v in (headers or {}).items() if k.lower() != "allow"}
                headers["Allow"] = ", ".join(sorted(allowed))
        return _problem(exc.status_code, slug, str(exc.detail), None, request, headers=headers)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:  # defense in depth
        logging.getLogger("abhas").exception("unhandled error on %s", request.url.path)
        return _problem(500, "internal-error", "Internal server error", None, request)
