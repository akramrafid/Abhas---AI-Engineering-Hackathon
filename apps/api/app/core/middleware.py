"""Request-id + access-log middleware (latency per request)."""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import log_event, request_id_var

log = logging.getLogger("app.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        incoming = request.headers.get("x-request-id", "")
        rid = incoming if 0 < len(incoming) <= 64 and incoming.isascii() else uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = rid
            log_event(
                log,
                "http_request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                latency_ms=round((time.perf_counter() - start) * 1000, 1),
            )
            return response
        finally:
            request_id_var.reset(token)
