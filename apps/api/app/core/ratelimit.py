"""In-process sliding-window rate limit per client IP + streaming ASGI request body size guard."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Iterable

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import PROBLEM_BASE, PROBLEM_MEDIA
from app.core.logging import request_id_var

EXEMPT = frozenset({"/healthz", "/readyz", "/docs", "/openapi.json", "/redoc"})
WINDOW_S = 60.0
MAX_TRACKED_KEYS = 1000
MAX_BODY_BYTES = 65_536


class _BodyTooLarge(Exception):
    """Internal signal raised immediately when a streaming request body exceeds MAX_BODY_BYTES."""


class BodySizeLimitMiddleware:
    """Pure ASGI streaming middleware that aborts oversized bodies without buffering into RAM (SEC-3)."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        rid = request_id_var.get()
        payload: dict[str, object] = {
            "type": PROBLEM_BASE + "payload-too-large",
            "title": "Payload too large",
            "status": 413,
            "detail": f"Request body exceeds {self.max_bytes} bytes",
            "instance": str(scope.get("path", "")),
        }
        if rid != "-":
            payload["request_id"] = rid
        response = JSONResponse(payload, status_code=413, media_type=PROBLEM_MEDIA)
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        cl = Headers(scope=scope).get("content-length")
        if cl and cl.strip().isdigit() and int(cl.strip()) > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        seen = 0
        too_large = False
        response_started = False

        async def limited_receive() -> Message:
            nonlocal seen, too_large
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.max_bytes:
                    too_large = True
                    raise _BodyTooLarge
            return msg

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if too_large and not response_started:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except _BodyTooLarge:
            pass
        if too_large and not response_started:
            await self._reject(scope, receive, send)


class RateLimitMiddleware:
    """Pure ASGI sliding-window rate limiter with exact exempt paths, trusted proxies, and LRU eviction."""

    def __init__(
        self,
        app: ASGIApp,
        per_minute: int,
        advisory_per_minute: int | None = None,
        trusted_proxies: Iterable[str] = (),
    ) -> None:
        self.app = app
        self.per_minute = per_minute
        self.advisory_per_minute = advisory_per_minute or per_minute
        self.trusted_proxies: frozenset[str] = frozenset(p.strip() for p in trusted_proxies if p.strip())
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def _client_ip(self, scope: Scope, headers: Headers) -> str:
        client = scope.get("client")
        peer = str(client[0]) if client and client[0] else "unknown"
        if peer not in self.trusted_proxies:
            return peer
        xff = headers.get("x-forwarded-for", "")
        if not xff:
            return peer
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        for ip in reversed(parts):
            if ip not in self.trusted_proxies:
                return ip
        return parts[0] if parts else peer

    def _evict_stale(self, now: float) -> None:
        if len(self.hits) <= MAX_TRACKED_KEYS:
            return
        stale = [k for k, q in self.hits.items() if not q or now - q[-1] > WINDOW_S]
        for k in stale:
            del self.hits[k]
        while len(self.hits) > MAX_TRACKED_KEYS:
            lru_key = min(self.hits, key=lambda k: self.hits[k][-1] if self.hits[k] else -1.0)
            del self.hits[lru_key]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))
        if path in EXEMPT:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        ip = self._client_ip(scope, headers)
        is_adv = path == "/api/v1/advisory" and self.advisory_per_minute < self.per_minute
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
                "instance": path,
            }
            if rid != "-":
                payload["request_id"] = rid
            response = JSONResponse(
                payload,
                status_code=429,
                media_type=PROBLEM_MEDIA,
                headers={"Retry-After": str(retry)},
            )
            await response(scope, receive, send)
            return
        q.append(now)
        await self.app(scope, receive, send)
