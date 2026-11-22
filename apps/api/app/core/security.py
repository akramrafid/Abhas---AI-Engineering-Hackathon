"""Security headers ASGI middleware (SEC-11) and CSV formula-injection defense."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

NO_STORE_PATHS = frozenset({"/healthz", "/readyz", "/api/v1/ops"})
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


class SecurityHeadersMiddleware:
    """Attach defensive HTTP headers to every API response without buffering bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                if path in NO_STORE_PATHS:
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_with_headers)


def sanitize_csv_cell(value: object) -> str:
    """Neutralize spreadsheet formula injection (=, +, -, @, tab, CR) by prefixing with a single quote."""
    text = "" if value is None else str(value)
    stripped = text.lstrip(" ")
    if text.startswith(_FORMULA_PREFIXES) or stripped.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text
