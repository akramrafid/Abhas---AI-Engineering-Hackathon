"""RFC 9457 problem+json errors. Every route documents PROBLEM_RESPONSES so contract tests check statuses."""

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    status: int, slug: str, title: str, detail: str | None, request: Request, **extra: Any
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
    return JSONResponse(body.model_dump(exclude_none=True), status_code=status, media_type=PROBLEM_MEDIA)


def _p(desc: str) -> dict[str, Any]:
    return {
        "model": Problem,
        "description": desc,
        "content": {PROBLEM_MEDIA: {"schema": {"$ref": "#/components/schemas/Problem"}}},
    }


PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: _p("Missing or invalid X-Ops-Token"),
    404: _p("Unknown ward, city or resource"),
    413: _p("Request body exceeds the 64 KB size limit"),
    422: _p("Request failed validation; `errors` names each field"),
    429: _p("Rate limit exceeded; retry after the Retry-After header"),
    500: _p("Unexpected server error"),
    503: _p("Model or data not ready (run npm run setup)"),
}


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

    @app.exception_handler(HTTPException)
    async def _http(request: Request, exc: HTTPException) -> JSONResponse:
        slug = {404: "not-found", 405: "method-not-allowed", 429: "rate-limited"}.get(
            exc.status_code, "http-error"
        )
        return _problem(exc.status_code, slug, str(exc.detail), None, request)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:  # never leak internals
        import logging

        logging.getLogger("abhas").exception("unhandled error on %s", request.url.path)
        return _problem(500, "internal-error", "Internal server error", None, request)
