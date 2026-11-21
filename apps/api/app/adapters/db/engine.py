"""SQLAlchemy 2.0 engine creation with SQLite WAL mode and Postgres compatibility."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.pool import StaticPool

from app.core.config import REPO_ROOT


def normalize_database_url(url: str) -> str:
    """Normalize SQLite relative paths against REPO_ROOT and postgres:// scheme."""
    if url.startswith("postgres://"):
        return "postgresql://" + url.removeprefix("postgres://")

    if not url.startswith("sqlite:///"):
        return url

    remainder = url.removeprefix("sqlite:///")
    path_part, sep, query_part = remainder.partition("?")
    if not path_part or path_part == ":memory:":
        return url

    db_path = Path(path_part)
    if not db_path.is_absolute():
        db_path = (REPO_ROOT / db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = f"?{query_part}" if sep else ""
    return f"sqlite:///{db_path.as_posix()}{suffix}"


def _configure_sqlite_connection(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=15000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def create_db_engine(url: str) -> Engine:
    """Create a configured SQLAlchemy 2.0 Engine (SQLite WAL or Postgres)."""
    normalized = normalize_database_url(url)
    kwargs: dict[str, Any] = {"future": True, "pool_pre_ping": True}

    if normalized.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15.0}
        if ":memory:" in normalized:
            kwargs["poolclass"] = StaticPool

    engine = create_engine(normalized, **kwargs)
    if engine.dialect.name == "sqlite":
        event.listen(engine, "connect", _configure_sqlite_connection)
    return engine
