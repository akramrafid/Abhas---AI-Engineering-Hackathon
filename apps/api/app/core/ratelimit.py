"""In-process sliding-window rate limit per client IP + request body size guard."""

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.errors import PROBLEM_BASE, PROBLEM_MEDIA
from app.core.logging import request_id_var

EXEMPT = ("/healthz", "/readyz", "/docs", "/openapi.json", "/redoc")
WINDOW_S = 60.0
MAX_TRACKED_KEYS = 1000
MAX_BODY_BYTES = 65_536


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        cl = request.headers.get("content-length")
        too_large = False
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            too_large = True
        elif request.method in ("POST", "PUT", "PATCH"):
            body = await request.body()
            if len(body) > self.max_bytes:
                too_large = True
        if too_large:
            rid = request_id_var.get()
            payload: dict[str, object] = {
                "type": PROBLEM_BASE + "payload-too-large",
                "title": "Payload too large",
                "status": 413,
                "detail": f"Request body exceeds {self.max_bytes} bytes",
                "instance": request.url.path,
            }
            if rid != "-":
                payload["request_id"] = rid
            return JSONResponse(payload, status_code=413, media_type=PROBLEM_MEDIA)
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int, advisory_per_minute: int | None = None) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.per_minute = per_minute
        self.advisory_per_minute = advisory_per_minute or per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def _evict_stale(self, now: float) -> None:
        if len(self.hits) <= MAX_TRACKED_KEYS:
            return
        stale = [k for k, q in self.hits.items() if not q or now - q[-1] > WINDOW_S]
        for k in stale:
            del self.hits[k]
        while len(self.hits) > MAX_TRACKED_KEYS:
            self.hits.pop(next(iter(self.hits)))

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith(EXEMPT):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        is_adv = request.url.path == "/api/v1/advisory" and self.advisory_per_minute < self.per_minute
        limit = self.advisory_per_minute if is_adv else self.per_minute
        key = f"adv:{ip}" if is_adv else ip
        now = time.monotonic()
        self._evict_stale(now)
        q = self.hits[key]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= limit:
            retry = max(1, int(WINDOW_S - (now - q[0])))
            rid = request_id_var.get()
            payload: dict[str, object] = {
                "type": PROBLEM_BASE + "rate-limited",
                "title": "Too many requests",
                "status": 429,
                "detail": f"Limit is {limit} requests per minute",
                "instance": request.url.path,
            }
            if rid != "-":
                payload["request_id"] = rid
            return JSONResponse(
                payload,
                status_code=429,
                media_type=PROBLEM_MEDIA,
                headers={"Retry-After": str(retry)},
            )
        q.append(now)
        return await call_next(request)
