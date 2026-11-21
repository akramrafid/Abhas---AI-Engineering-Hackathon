"""In-process sliding-window rate limit per client IP (single local process; Redis is the Stage-2 upgrade)."""

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.errors import PROBLEM_BASE, PROBLEM_MEDIA

EXEMPT = ("/healthz", "/readyz", "/docs", "/openapi.json", "/redoc")
WINDOW_S = 60.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith(EXEMPT):
            return await call_next(request)
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= self.per_minute:
            retry = max(1, int(WINDOW_S - (now - q[0])))
            return JSONResponse(
                {
                    "type": PROBLEM_BASE + "rate-limited",
                    "title": "Too many requests",
                    "status": 429,
                    "detail": f"Limit is {self.per_minute} requests per minute",
                    "instance": request.url.path,
                },
                status_code=429,
                media_type=PROBLEM_MEDIA,
                headers={"Retry-After": str(retry)},
            )
        q.append(now)
        return await call_next(request)
