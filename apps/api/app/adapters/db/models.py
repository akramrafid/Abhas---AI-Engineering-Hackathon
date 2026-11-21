"""SQLAlchemy 2.0 ORM models matching Alembic revision 0001_initial."""

from __future__ import annotations

from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class WardRow(Base):
    __tablename__ = "wards"
    __table_args__ = (
        CheckConstraint("population_density_sqkm >= 0", name="population_density_nonneg"),
        CheckConstraint(
            "water_logging_risk_index >= 0 AND water_logging_risk_index <= 1",
            name="water_logging_unit",
        ),
        CheckConstraint("sanitation_score >= 0 AND sanitation_score <= 1", name="sanitation_unit"),
        Index("ix_wards_city", "city"),
    )

    ward_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    city: Mapped[str] = mapped_column(String(32), nullable=False)
    population_density_sqkm: Mapped[float] = mapped_column(Float, nullable=False)
    water_logging_risk_index: Mapped[float] = mapped_column(Float, nullable=False)
    sanitation_score: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class ObservationRow(Base):
    __tablename__ = "observations"
    __table_args__ = (
        CheckConstraint("rainfall_mm >= 0", name="rainfall_nonneg"),
        CheckConstraint(
            "relative_humidity_pct >= 0 AND relative_humidity_pct <= 100",
            name="humidity_pct",
        ),
        CheckConstraint("dengue_cases >= 0", name="cases_nonneg"),
        Index("ix_observations_ward_id_week", "ward_id", "week"),
        Index("ix_observations_week", "week"),
    )

    ward_id: Mapped[str] = mapped_column(
        String(16),
        ForeignKey("wards.ward_id", ondelete="CASCADE"),
        primary_key=True,
    )
    week: Mapped[date] = mapped_column(Date, primary_key=True)
    avg_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    max_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    min_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall_mm: Mapped[float] = mapped_column(Float, nullable=False)
    relative_humidity_pct: Mapped[float] = mapped_column(Float, nullable=False)
    dengue_cases: Mapped[int] = mapped_column(Integer, nullable=False)


class WeatherCacheRow(Base):
    __tablename__ = "weather_cache"
    __table_args__ = (
        CheckConstraint("rainfall_mm >= 0", name="rainfall_nonneg"),
        CheckConstraint(
            "relative_humidity_pct >= 0 AND relative_humidity_pct <= 100",
            name="humidity_pct",
        ),
        Index("ix_weather_cache_city_week", "city", "week"),
        Index("ix_weather_cache_expires_at", "expires_at"),
    )

    city: Mapped[str] = mapped_column(String(32), primary_key=True)
    week: Mapped[date] = mapped_column(Date, primary_key=True)
    avg_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    max_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    min_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall_mm: Mapped[float] = mapped_column(Float, nullable=False)
    relative_humidity_pct: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PredictionCacheRow(Base):
    __tablename__ = "predictions_cache"
    __table_args__ = (Index("ix_predictions_cache_created_at", "created_at"),)

    cache_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class ApiCallRow(Base):
    __tablename__ = "api_calls"
    __table_args__ = (
        CheckConstraint("latency_ms >= 0", name="latency_nonneg"),
        CheckConstraint("cost_usd >= 0", name="cost_nonneg"),
        Index("ix_api_calls_kind_created_at", "kind", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, server_default=sa.text("0"), nullable=False)
    detail: Mapped[str] = mapped_column(String(500), server_default=sa.text("''"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class LlmTraceRow(Base):
    __tablename__ = "llm_traces"
    __table_args__ = (
        CheckConstraint("input_tokens >= 0", name="input_tokens_nonneg"),
        CheckConstraint("output_tokens >= 0", name="output_tokens_nonneg"),
        CheckConstraint("cost_usd >= 0", name="cost_nonneg"),
        CheckConstraint("latency_ms >= 0", name="latency_nonneg"),
        Index("ix_llm_traces_created_at", "created_at"),
        Index("ix_llm_traces_request_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(64), server_default=sa.text("'-'"), nullable=False)
    ward_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    origin_week: Mapped[date | None] = mapped_column(Date, nullable=True)
    horizon: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language: Mapped[str] = mapped_column(String(8), server_default=sa.text("'en'"), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(32), server_default=sa.text("'v1'"), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, server_default=sa.text("0"), nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, server_default=sa.text("0"), nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, server_default=sa.text("0"), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, server_default=sa.text("0"), nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, server_default=sa.text("0"), nullable=False)
    numbers_validated: Mapped[bool] = mapped_column(Boolean, server_default=sa.text("1"), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, server_default=sa.text("1"), nullable=False)
    error_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
