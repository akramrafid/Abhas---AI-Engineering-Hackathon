"""JSON logs with secret redaction and a sanitized request id on every line."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SAFE_RID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_PG_DSN_RE = re.compile(r"(postgres(?:ql)?://[^:/\s]+:)[^@\s]+(@)", re.IGNORECASE)
_SECRET_RE = re.compile(
    r"sk-ant-[A-Za-z0-9_-]{12,}"
    r"|sk-[A-Za-z0-9_-]{20,}"
    r"|AIza[A-Za-z0-9_-]{30,}"
    r"|AQ\.[A-Za-z0-9._-]{20,}"
    r"|ghp_[A-Za-z0-9]{36}"
    r"|xox[abprs]-[A-Za-z0-9-]+"
    r"|AKIA[0-9A-Z]{16}"
    r"|(?i:(?:authorization\s*[:=]\s*(?:bearer\s+)?|bearer\s+|x-ops-token['\":=\s]+|x-goog-api-key['\":=\s]+|password\s*=\s*)[^\s'\",;]+)"
)


def redact_secrets(text: str) -> str:
    """Mask API keys, auth headers, ops tokens, passwords, and Postgres DSN credentials."""
    masked = _PG_DSN_RE.sub(r"\1[REDACTED]\2", text)
    return _SECRET_RE.sub("[REDACTED]", masked)


def sanitize_request_id(raw: str | None) -> str:
    """Accept only [A-Za-z0-9._-]{1,64}; replace invalid or missing values with a fresh UUID hex."""
    if raw and _SAFE_RID.match(raw):
        return raw
    return uuid.uuid4().hex[:16]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": round(record.created, 3),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact_secrets(record.getMessage()),
            "request_id": request_id_var.get(),
        }
        for key in ("route", "status", "duration_ms", "event"):
            if hasattr(record, key):
                val = getattr(record, key)
                payload[key] = redact_secrets(val) if isinstance(val, str) else val
        if record.exc_info:
            payload["exc"] = redact_secrets(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)


def enable_abhas_loggers() -> None:
    """Re-enable abhas.* loggers if Alembic's logging.config.fileConfig disabled existing loggers."""
    root = logging.getLogger("abhas")
    root.disabled = False
    for name, obj in logging.root.manager.loggerDict.items():
        if (name == "abhas" or name.startswith("abhas.")) and isinstance(obj, logging.Logger):
            obj.disabled = False


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger("abhas")
    root.handlers[:] = [handler]
    root.setLevel(level)
    root.propagate = False
    enable_abhas_loggers()


class RequestIdMiddleware:
    """Pure ASGI middleware: sanitizes X-Request-ID, binds request_id_var, and logs before reset."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        rid = sanitize_request_id(Headers(scope=scope).get("x-request-id"))
        token = request_id_var.set(rid)
        start = time.perf_counter()
        status_code = 500

        async def send_with_rid(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = rid
            await send(message)

        try:
            await self.app(scope, receive, send_with_rid)
        finally:
            try:
                logging.getLogger("abhas.http").info(
                    "request",
                    extra={
                        "route": str(scope.get("path", "")),
                        "status": status_code,
                        "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                    },
                )
            finally:
                request_id_var.reset(token)
