"""SQLAlchemy 2.0 implementations of app.ports.repositories + weather_cache store."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from threading import RLock
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Engine, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.types import DATA_END, DATA_START
from app.ports.repositories import Observation, WardRecord

from .models import ApiCallRow, ObservationRow, PredictionCacheRow, WardRow, WeatherCacheRow

DHAKA_TZ = ZoneInfo("Asia/Dhaka")


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


def _dialect_upsert(engine: Engine, table: Any) -> Any:
    if engine.dialect.name == "postgresql":
        return pg_insert(table)
    if engine.dialect.name == "sqlite":
        return sqlite_insert(table)
    return insert(table)


class SqlObservationRepository:
    """Implements app.ports.repositories.ObservationRepository using SQLAlchemy Core."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def wards(self, city: str | None = None) -> Sequence[WardRecord]:
        t = WardRow.__table__
        stmt = select(
            t.c.ward_id,
            t.c.city,
            t.c.population_density_sqkm,
            t.c.water_logging_risk_index,
            t.c.sanitation_score,
        ).order_by(t.c.ward_id.asc())
        if city is not None:
            stmt = stmt.where(t.c.city == city)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [
            WardRecord(
                ward_id=r[0],
                city=r[1],
                population_density_sqkm=float(r[2]),
                water_logging_risk_index=float(r[3]),
                sanitation_score=float(r[4]),
            )
            for r in rows
        ]

    def ward(self, ward_id: str) -> WardRecord | None:
        t = WardRow.__table__
        stmt = select(
            t.c.ward_id,
            t.c.city,
            t.c.population_density_sqkm,
            t.c.water_logging_risk_index,
            t.c.sanitation_score,
        ).where(t.c.ward_id == ward_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None:
            return None
        return WardRecord(
            ward_id=row[0],
            city=row[1],
            population_density_sqkm=float(row[2]),
            water_logging_risk_index=float(row[3]),
            sanitation_score=float(row[4]),
        )

    def history(
        self, ward_id: str, start: date | None = None, end: date | None = None
    ) -> Sequence[Observation]:
        t = ObservationRow.__table__
        stmt = (
            select(
                t.c.ward_id,
                t.c.week,
                t.c.avg_temp_c,
                t.c.max_temp_c,
                t.c.min_temp_c,
                t.c.rainfall_mm,
                t.c.relative_humidity_pct,
                t.c.dengue_cases,
            )
            .where(t.c.ward_id == ward_id)
            .order_by(t.c.week.asc())
        )
        if start is not None:
            stmt = stmt.where(t.c.week >= start)
        if end is not None:
            stmt = stmt.where(t.c.week <= end)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [
            Observation(
                ward_id=r[0],
                week=r[1],
                avg_temp_c=float(r[2]),
                max_temp_c=float(r[3]),
                min_temp_c=float(r[4]),
                rainfall_mm=float(r[5]),
                relative_humidity_pct=float(r[6]),
                dengue_cases=int(r[7]),
            )
            for r in rows
        ]

    def all_observations(self, end: date | None = None) -> Sequence[Observation]:
        t = ObservationRow.__table__
        stmt = select(
            t.c.ward_id,
            t.c.week,
            t.c.avg_temp_c,
            t.c.max_temp_c,
            t.c.min_temp_c,
            t.c.rainfall_mm,
            t.c.relative_humidity_pct,
            t.c.dengue_cases,
        ).order_by(t.c.ward_id.asc(), t.c.week.asc())
        if end is not None:
            stmt = stmt.where(t.c.week <= end)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [
            Observation(
                ward_id=r[0],
                week=r[1],
                avg_temp_c=float(r[2]),
                max_temp_c=float(r[3]),
                min_temp_c=float(r[4]),
                rainfall_mm=float(r[5]),
                relative_humidity_pct=float(r[6]),
                dengue_cases=int(r[7]),
            )
            for r in rows
        ]

    def date_range(self) -> tuple[date, date]:
        t = ObservationRow.__table__
        stmt = select(func.min(t.c.week), func.max(t.c.week))
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None or row[0] is None or row[1] is None:
            return (DATA_START, DATA_END)
        return (row[0], row[1])


class SqlPredictionCache:
    """Implements app.ports.repositories.PredictionCache with an in-memory hot LRU layer."""

    def __init__(self, engine: Engine, max_memory_entries: int = 2048) -> None:
        self._engine = engine
        self._max_memory_entries = max_memory_entries
        self._mem: OrderedDict[str, str] = OrderedDict()
        self._lock = RLock()

    def get(self, key: str) -> str | None:
        with self._lock:
            cached = self._mem.get(key)
            if cached is not None:
                self._mem.move_to_end(key)
                return cached

        t = PredictionCacheRow.__table__
        stmt = select(t.c.payload_json).where(t.c.cache_key == key)
        with self._engine.connect() as conn:
            val = conn.execute(stmt).scalar_one_or_none()
        if val is None:
            return None

        with self._lock:
            self._mem[key] = str(val)
            self._mem.move_to_end(key)
            while len(self._mem) > self._max_memory_entries:
                self._mem.popitem(last=False)
        return str(val)

    def put(self, key: str, payload_json: str) -> None:
        now = _db_ts(self._engine, datetime.now(UTC))
        t = PredictionCacheRow.__table__
        stmt = _dialect_upsert(self._engine, t).values(
            cache_key=key,
            payload_json=payload_json,
            created_at=now,
            updated_at=now,
        )
        if hasattr(stmt, "on_conflict_do_update"):
            stmt = stmt.on_conflict_do_update(
                index_elements=["cache_key"],
                set_={"payload_json": payload_json, "updated_at": now},
            )
        with self._engine.begin() as conn:
            conn.execute(stmt)

        with self._lock:
            self._mem[key] = payload_json
            self._mem.move_to_end(key)
            while len(self._mem) > self._max_memory_entries:
                self._mem.popitem(last=False)

    def count(self) -> int:
        t = PredictionCacheRow.__table__
        with self._engine.connect() as conn:
            val = conn.execute(select(func.count()).select_from(t)).scalar_one()
        return int(val)

    def clear_memory(self) -> None:
        with self._lock:
            self._mem.clear()


class SqlCallLog:
    """Implements app.ports.repositories.CallLog backed by the api_calls table."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def record(self, kind: str, ok: bool, latency_ms: float, cost_usd: float = 0.0, detail: str = "") -> None:
        now = _db_ts(self._engine, datetime.now(UTC))
        stmt = insert(ApiCallRow).values(
            kind=kind[:32],
            ok=bool(ok),
            latency_ms=max(0.0, float(latency_ms)),
            cost_usd=max(0.0, float(cost_usd)),
            detail=detail[:500],
            created_at=now,
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def today(self, kind: str) -> tuple[int, float]:
        """(calls, spend_usd) since 00:00 Asia/Dhaka."""
        dhaka_midnight = datetime.now(DHAKA_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff = _db_ts(self._engine, dhaka_midnight)
        t = ApiCallRow.__table__
        stmt = select(func.count(), func.coalesce(func.sum(t.c.cost_usd), 0.0)).where(
            t.c.kind == kind,
            t.c.created_at >= cutoff,
        )
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None:
            return (0, 0.0)
        return (int(row[0] or 0), float(row[1] or 0.0))


@dataclass(frozen=True)
class WeatherCacheEntry:
    city: str
    week: date
    avg_temp_c: float
    max_temp_c: float
    min_temp_c: float
    rainfall_mm: float
    relative_humidity_pct: float
    source: str
    fetched_at: datetime
    expires_at: datetime


class SqlWeatherCache:
    """Persistence adapter for the weather_cache table (6h TTL + stale fallback)."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_entries(self, entries: Sequence[WeatherCacheEntry]) -> None:
        if not entries:
            return
        t = WeatherCacheRow.__table__
        rows = [
            {
                "city": e.city,
                "week": e.week,
                "avg_temp_c": float(e.avg_temp_c),
                "max_temp_c": float(e.max_temp_c),
                "min_temp_c": float(e.min_temp_c),
                "rainfall_mm": max(0.0, float(e.rainfall_mm)),
                "relative_humidity_pct": min(100.0, max(0.0, float(e.relative_humidity_pct))),
                "source": e.source,
                "fetched_at": _db_ts(self._engine, e.fetched_at),
                "expires_at": _db_ts(self._engine, e.expires_at),
            }
            for e in entries
        ]
        stmt = _dialect_upsert(self._engine, t)
        if hasattr(stmt, "on_conflict_do_update"):
            stmt = stmt.on_conflict_do_update(
                index_elements=["city", "week"],
                set_={
                    "avg_temp_c": stmt.excluded.avg_temp_c,
                    "max_temp_c": stmt.excluded.max_temp_c,
                    "min_temp_c": stmt.excluded.min_temp_c,
                    "rainfall_mm": stmt.excluded.rainfall_mm,
                    "relative_humidity_pct": stmt.excluded.relative_humidity_pct,
                    "source": stmt.excluded.source,
                    "fetched_at": stmt.excluded.fetched_at,
                    "expires_at": stmt.excluded.expires_at,
                },
            )
        with self._engine.begin() as conn:
            conn.execute(stmt, rows)

    def get_city_weeks(self, city: str, weeks: Sequence[date]) -> dict[date, WeatherCacheEntry]:
        if not weeks:
            return {}
        t = WeatherCacheRow.__table__
        stmt = select(
            t.c.city,
            t.c.week,
            t.c.avg_temp_c,
            t.c.max_temp_c,
            t.c.min_temp_c,
            t.c.rainfall_mm,
            t.c.relative_humidity_pct,
            t.c.source,
            t.c.fetched_at,
            t.c.expires_at,
        ).where(t.c.city == city, t.c.week.in_(list(weeks)))
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return {
            r[1]: WeatherCacheEntry(
                city=r[0],
                week=r[1],
                avg_temp_c=float(r[2]),
                max_temp_c=float(r[3]),
                min_temp_c=float(r[4]),
                rainfall_mm=float(r[5]),
                relative_humidity_pct=float(r[6]),
                source=r[7],
                fetched_at=_ensure_utc(r[8]),
                expires_at=_ensure_utc(r[9]),
            )
            for r in rows
        }

    def latest_city_fetches(self) -> dict[str, tuple[datetime, datetime]]:
        t = WeatherCacheRow.__table__
        stmt = select(t.c.city, func.max(t.c.fetched_at), func.max(t.c.expires_at)).group_by(t.c.city)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        out: dict[str, tuple[datetime, datetime]] = {}
        for city, fetched_at, expires_at in rows:
            if fetched_at is not None and expires_at is not None:
                out[city] = (_ensure_utc(fetched_at), _ensure_utc(expires_at))
        return out
