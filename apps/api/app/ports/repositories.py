"""Ports: data access. DATA implements these in app/adapters/db/ (SQLAlchemy); tests use in-memory fakes."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol


@dataclass(frozen=True)
class WardRecord:
    ward_id: str
    city: str
    population_density_sqkm: float
    water_logging_risk_index: float
    sanitation_score: float


@dataclass(frozen=True)
class Observation:
    ward_id: str
    week: date
    avg_temp_c: float
    max_temp_c: float
    min_temp_c: float
    rainfall_mm: float
    relative_humidity_pct: float
    dengue_cases: int


class ObservationRepository(Protocol):
    def wards(self, city: str | None = None) -> Sequence[WardRecord]: ...

    def ward(self, ward_id: str) -> WardRecord | None: ...

    def history(
        self, ward_id: str, start: date | None = None, end: date | None = None
    ) -> Sequence[Observation]:
        """Weekly rows for one ward, date-sorted, inclusive bounds."""
        ...

    def all_observations(self, end: date | None = None) -> Sequence[Observation]:
        """Every ward-week up to `end` (inclusive), sorted by ward_id then week."""
        ...

    def date_range(self) -> tuple[date, date]: ...


class PredictionCache(Protocol):
    """Keyed by (ward_id, origin_week, horizon, model_version, weather_hash)."""

    def get(self, key: str) -> str | None: ...

    def put(self, key: str, payload_json: str) -> None: ...

    def count(self) -> int: ...


class CallLog(Protocol):
    """Counts outside calls (weather, llm) for /api/v1/ops and the daily LLM budget."""

    def record(
        self, kind: str, ok: bool, latency_ms: float, cost_usd: float = 0.0, detail: str = ""
    ) -> None: ...

    def today(self, kind: str) -> tuple[int, float]:
        """(calls, spend_usd) since 00:00 Asia/Dhaka."""
        ...


@dataclass(frozen=True)
class StoredPlan:
    """Append-only persisted planning run spanning plans + plan_runs tables (contracts §5, §6; ADR-0016)."""

    id: str
    kind: str
    label: str
    origin_week: date
    model_version: str
    git_sha: str
    data_as_of: date
    offline: bool
    created_at: datetime
    inputs_json: str
    outputs_json: str
    headline_json: str
    solve_ms: float


class PlanStore(Protocol):
    """Append-only storage for operational plans (SQLAlchemy adapter over Alembic 0002 tables)."""

    def save(self, record: StoredPlan) -> StoredPlan:
        """Persist a new plan record and return the stored copy."""
        ...

    def get(self, plan_id: str) -> StoredPlan | None:
        """Fetch one plan by UUID string, or None if not found."""
        ...

    def list(self, kind: str | None = None, limit: int = 20) -> Sequence[StoredPlan]:
        """Return plans newest-first, optionally filtered by kind."""
        ...
