"""Triage history in SQLite (stdlib). One short-lived connection per call; parameterized SQL only."""

import asyncio
import logging
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from app.core.config import get_settings
from app.schemas import TriageHistoryItem, TriageResult

log = logging.getLogger("app.history")

_PREFIX = "sqlite:///"
_ready: set[Path] = set()
_DDL = """
CREATE TABLE IF NOT EXISTS triage_history (
    id TEXT PRIMARY KEY,
    ticket_id TEXT,
    category TEXT NOT NULL,
    urgency TEXT NOT NULL,
    language TEXT NOT NULL,
    needs_human INTEGER NOT NULL,
    injection_detected INTEGER NOT NULL,
    summary TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_triage_history_created ON triage_history (created_at DESC);
"""


def _db_path() -> Path:
    settings = get_settings()
    url = settings.database_url
    if not url.startswith(_PREFIX):
        raise ValueError("DATABASE_URL must look like sqlite:///./file.db")
    return settings.resolve(url[len(_PREFIX) :])


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    needs_schema = path not in _ready or not path.exists()  # created once per db file, not on every read
    conn = sqlite3.connect(path, timeout=5)
    if needs_schema:
        conn.executescript(_DDL)
        _ready.add(path)
    return conn


def _save_sync(result: TriageResult) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT OR REPLACE INTO triage_history (id, ticket_id, category, urgency, language, needs_human,"
            " injection_detected, summary, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                result.id,
                result.ticket_id,
                result.category.value,
                result.urgency.value,
                result.language.value,
                int(result.needs_human),
                int(result.injection_detected),
                result.summary,
                result.model_dump_json(),
                result.created_at.isoformat(),
            ),
        )


def _list_sync(limit: int) -> list[TriageHistoryItem]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, ticket_id, category, urgency, language, needs_human, injection_detected, summary,"
            " created_at FROM triage_history ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (int(limit),),
        ).fetchall()
    items: list[TriageHistoryItem] = []
    for r in rows:
        try:
            items.append(
                TriageHistoryItem(
                    id=r[0],
                    ticket_id=r[1],
                    category=r[2],
                    urgency=r[3],
                    language=r[4],
                    needs_human=bool(r[5]),
                    injection_detected=bool(r[6]),
                    summary=r[7],
                    created_at=datetime.fromisoformat(r[8]),
                )
            )
        except ValueError:
            log.warning("skipping unreadable history row", extra={"data": {"id": r[0]}})
    return items


async def save(result: TriageResult) -> None:
    """Persist a result. History is auxiliary: a storage failure is logged, never raised to the caller."""
    try:
        await asyncio.to_thread(_save_sync, result)
    except (sqlite3.Error, OSError, ValueError):
        log.exception("could not save triage history")


async def list_recent(limit: int = 50) -> list[TriageHistoryItem]:
    """Newest first. Returns [] if the store is unavailable."""
    try:
        return await asyncio.to_thread(_list_sync, max(1, min(limit, 200)))
    except (sqlite3.Error, OSError, ValueError):
        log.exception("could not read triage history")
        return []
