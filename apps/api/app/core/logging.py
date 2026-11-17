"""Structured JSON logging with request id; redacts anything that looks like a key."""

import contextvars
import json
import logging
import re
import sys
from datetime import UTC, datetime

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{20,}|AQ\.[A-Za-z0-9_\-]{20,}|gsk_[A-Za-z0-9_\-]{20,}"
    r"|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._\-]+)"
)


def redact(text: str) -> str:
    return _SECRET_RE.sub("***", text)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
            "request_id": request_id_var.get(),
        }
        extra = getattr(record, "data", None)
        if isinstance(extra, dict):
            for key, value in extra.items():
                payload.setdefault(key, value)  # never overwrite reserved fields
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return redact(json.dumps(payload, ensure_ascii=False, default=str))


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for noisy in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def log_event(logger: logging.Logger, msg: str, **data: object) -> None:
    """Log a structured event: log_event(log, "llm_call", latency_ms=12, cost_usd=0.0001)."""
    logger.info(msg, extra={"data": data})
