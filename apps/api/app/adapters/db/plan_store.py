"""SQLAlchemy 2.0 adapter implementing app.ports.repositories.PlanStore (ADR-0016)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from threading import RLock
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, insert, inspect, select

from app.core.config import API_DIR, get_settings
from app.ports.repositories import StoredPlan

from .engine import normalize_database_url
from .factory import ensure_database_ready, get_engine
from .models import PlanRow, PlanRunRow

logger = logging.getLogger("abhas.db.plans")

_lock = RLock()
_stores: dict[str, SqlPlanStore] = {}
_plans_migrated_urls: set[str] = set()


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _db_ts(engine: Engine, dt: datetime) -> datetime:
    """SQLite compares naive UTC ISO strings reliably; Postgres uses tz-aware UTC."""
    utc = _ensure_utc(dt)
    if engine.dialect.name == "sqlite":
        return utc.replace(tzinfo=None)
    return utc


def _default_url() -> str:
    return normalize_database_url(get_settings().database_url)


def _row_to_stored_plan(row: Any) -> StoredPlan:
    return StoredPlan(
        id=str(row[0]),
        kind=str(row[1]),
        label=str(row[2]),
        origin_week=row[3],
        model_version=str(row[4]),
        git_sha=str(row[5]),
        data_as_of=row[6],
        offline=bool(row[7]),
        created_at=_ensure_utc(row[8]),
        inputs_json=str(row[9]),
        outputs_json=str(row[10]),
        headline_json=str(row[11]),
        solve_ms=float(row[12]),
    )


class SqlPlanStore:
    """Append-only PlanStore over Alembic 0002 tables (`plans` + `plan_runs`)."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def save(self, record: StoredPlan) -> StoredPlan:
        """Persist a plan header and its run payload atomically in one transaction."""
        created_utc = _ensure_utc(record.created_at)
        db_created = _db_ts(self._engine, created_utc)
        plan_stmt = insert(PlanRow).values(
            id=record.id,
            kind=record.kind,
            label=record.label,
            origin_week=record.origin_week,
            model_version=record.model_version,
            git_sha=record.git_sha,
            data_as_of=record.data_as_of,
            offline=bool(record.offline),
            created_at=db_created,
        )
        run_stmt = insert(PlanRunRow).values(
            plan_id=record.id,
            inputs_json=record.inputs_json,
            outputs_json=record.outputs_json,
            headline_json=record.headline_json,
            solve_ms=max(0.0, float(record.solve_ms)),
        )
        with self._engine.begin() as conn:
            conn.execute(plan_stmt)
            conn.execute(run_stmt)
        return StoredPlan(
            id=record.id,
            kind=record.kind,
            label=record.label,
            origin_week=record.origin_week,
            model_version=record.model_version,
            git_sha=record.git_sha,
            data_as_of=record.data_as_of,
            offline=bool(record.offline),
            created_at=created_utc,
            inputs_json=record.inputs_json,
            outputs_json=record.outputs_json,
            headline_json=record.headline_json,
            solve_ms=max(0.0, float(record.solve_ms)),
        )

    def get(self, plan_id: str) -> StoredPlan | None:
        """Fetch a single saved plan by UUID string, or None when absent."""
        p = PlanRow.__table__
        r = PlanRunRow.__table__
        stmt = (
            select(
                p.c.id,
                p.c.kind,
                p.c.label,
                p.c.origin_week,
                p.c.model_version,
                p.c.git_sha,
                p.c.data_as_of,
                p.c.offline,
                p.c.created_at,
                r.c.inputs_json,
                r.c.outputs_json,
                r.c.headline_json,
                r.c.solve_ms,
            )
            .join(r, p.c.id == r.c.plan_id)
            .where(p.c.id == plan_id)
        )
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None:
            return None
        return _row_to_stored_plan(row)

    def list(self, kind: str | None = None, limit: int = 20) -> Sequence[StoredPlan]:
        """List saved plans newest first, optionally filtered by kind."""
        capped_limit = max(1, min(int(limit), 100))
        p = PlanRow.__table__
        r = PlanRunRow.__table__
        stmt = (
            select(
                p.c.id,
                p.c.kind,
                p.c.label,
                p.c.origin_week,
                p.c.model_version,
                p.c.git_sha,
                p.c.data_as_of,
                p.c.offline,
                p.c.created_at,
                r.c.inputs_json,
                r.c.outputs_json,
                r.c.headline_json,
                r.c.solve_ms,
            )
            .join(r, p.c.id == r.c.plan_id)
            .order_by(p.c.created_at.desc(), p.c.id.desc())
            .limit(capped_limit)
        )
        if kind is not None:
            stmt = stmt.where(p.c.kind == kind)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [_row_to_stored_plan(row) for row in rows]


def _ensure_plans_tables(normalized_url: str, engine: Engine) -> None:
    if normalized_url in _plans_migrated_urls:
        return
    with _lock:
        if normalized_url in _plans_migrated_urls:
            return
        settings = get_settings()
        if settings.app_env != "production" and not inspect(engine).has_table("plans"):
            logger.info("Upgrading database to head for Phase 2 plans tables")
            cfg = Config(str(API_DIR / "alembic.ini"))
            cfg.set_main_option("script_location", str(API_DIR / "migrations"))
            cfg.attributes["url"] = normalized_url
            command.upgrade(cfg, "head")
        _plans_migrated_urls.add(normalized_url)


def get_plan_store(url: str | None = None, *, auto_bootstrap: bool = True) -> SqlPlanStore:
    """Return a cached SqlPlanStore for the given (or default) database URL."""
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    if auto_bootstrap:
        _ensure_plans_tables(normalized, engine)
    with _lock:
        store = _stores.get(normalized)
        if store is None:
            store = SqlPlanStore(engine)
            _stores[normalized] = store
        return store


def reset_plan_store() -> None:
    """Clear cached SqlPlanStore instances (primarily for tests)."""
    with _lock:
        _stores.clear()
        _plans_migrated_urls.clear()
