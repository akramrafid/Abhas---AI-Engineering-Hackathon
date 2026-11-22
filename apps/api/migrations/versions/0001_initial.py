"""Initial schema: wards, observations, weather_cache, predictions_cache, api_calls, llm_traces.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "wards",
        sa.Column("ward_id", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=32), nullable=False),
        sa.Column("population_density_sqkm", sa.Float(), nullable=False),
        sa.Column("water_logging_risk_index", sa.Float(), nullable=False),
        sa.Column("sanitation_score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("population_density_sqkm >= 0", name="ck_wards_population_density_nonneg"),
        sa.CheckConstraint(
            "water_logging_risk_index >= 0 AND water_logging_risk_index <= 1",
            name="ck_wards_water_logging_unit",
        ),
        sa.CheckConstraint(
            "sanitation_score >= 0 AND sanitation_score <= 1",
            name="ck_wards_sanitation_unit",
        ),
        sa.PrimaryKeyConstraint("ward_id", name="pk_wards"),
    )
    op.create_index("ix_wards_city", "wards", ["city"], unique=False)

    op.create_table(
        "observations",
        sa.Column("ward_id", sa.String(length=16), nullable=False),
        sa.Column("week", sa.Date(), nullable=False),
        sa.Column("avg_temp_c", sa.Float(), nullable=False),
        sa.Column("max_temp_c", sa.Float(), nullable=False),
        sa.Column("min_temp_c", sa.Float(), nullable=False),
        sa.Column("rainfall_mm", sa.Float(), nullable=False),
        sa.Column("relative_humidity_pct", sa.Float(), nullable=False),
        sa.Column("dengue_cases", sa.Integer(), nullable=False),
        sa.CheckConstraint("rainfall_mm >= 0", name="ck_observations_rainfall_nonneg"),
        sa.CheckConstraint(
            "relative_humidity_pct >= 0 AND relative_humidity_pct <= 100",
            name="ck_observations_humidity_pct",
        ),
        sa.CheckConstraint("dengue_cases >= 0", name="ck_observations_cases_nonneg"),
        sa.ForeignKeyConstraint(
            ["ward_id"],
            ["wards.ward_id"],
            name="fk_observations_ward_id_wards",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("ward_id", "week", name="pk_observations"),
    )
    op.create_index("ix_observations_ward_id_week", "observations", ["ward_id", "week"], unique=False)
    op.create_index("ix_observations_week", "observations", ["week"], unique=False)

    op.create_table(
        "weather_cache",
        sa.Column("city", sa.String(length=32), nullable=False),
        sa.Column("week", sa.Date(), nullable=False),
        sa.Column("avg_temp_c", sa.Float(), nullable=False),
        sa.Column("max_temp_c", sa.Float(), nullable=False),
        sa.Column("min_temp_c", sa.Float(), nullable=False),
        sa.Column("rainfall_mm", sa.Float(), nullable=False),
        sa.Column("relative_humidity_pct", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rainfall_mm >= 0", name="ck_weather_cache_rainfall_nonneg"),
        sa.CheckConstraint(
            "relative_humidity_pct >= 0 AND relative_humidity_pct <= 100",
            name="ck_weather_cache_humidity_pct",
        ),
        sa.PrimaryKeyConstraint("city", "week", name="pk_weather_cache"),
    )
    op.create_index("ix_weather_cache_city_week", "weather_cache", ["city", "week"], unique=False)
    op.create_index("ix_weather_cache_expires_at", "weather_cache", ["expires_at"], unique=False)

    op.create_table(
        "predictions_cache",
        sa.Column("cache_key", sa.String(length=128), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("cache_key", name="pk_predictions_cache"),
    )
    op.create_index("ix_predictions_cache_created_at", "predictions_cache", ["created_at"], unique=False)

    op.create_table(
        "api_calls",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("cost_usd", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("detail", sa.String(length=500), server_default=sa.text("''"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("latency_ms >= 0", name="ck_api_calls_latency_nonneg"),
        sa.CheckConstraint("cost_usd >= 0", name="ck_api_calls_cost_nonneg"),
        sa.PrimaryKeyConstraint("id", name="pk_api_calls"),
    )
    op.create_index("ix_api_calls_kind_created_at", "api_calls", ["kind", "created_at"], unique=False)

    op.create_table(
        "llm_traces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.String(length=64), server_default=sa.text("'-'"), nullable=False),
        sa.Column("ward_id", sa.String(length=16), nullable=True),
        sa.Column("origin_week", sa.Date(), nullable=True),
        sa.Column("horizon", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(length=8), server_default=sa.text("'en'"), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("prompt_version", sa.String(length=32), server_default=sa.text("'v1'"), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("cost_usd", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("latency_ms", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("cache_hit", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("numbers_validated", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("ok", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("error_type", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("input_tokens >= 0", name="ck_llm_traces_input_tokens_nonneg"),
        sa.CheckConstraint("output_tokens >= 0", name="ck_llm_traces_output_tokens_nonneg"),
        sa.CheckConstraint("cost_usd >= 0", name="ck_llm_traces_cost_nonneg"),
        sa.CheckConstraint("latency_ms >= 0", name="ck_llm_traces_latency_nonneg"),
        sa.PrimaryKeyConstraint("id", name="pk_llm_traces"),
    )
    op.create_index("ix_llm_traces_created_at", "llm_traces", ["created_at"], unique=False)
    op.create_index("ix_llm_traces_request_id", "llm_traces", ["request_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_llm_traces_request_id", table_name="llm_traces")
    op.drop_index("ix_llm_traces_created_at", table_name="llm_traces")
    op.drop_table("llm_traces")

    op.drop_index("ix_api_calls_kind_created_at", table_name="api_calls")
    op.drop_table("api_calls")

    op.drop_index("ix_predictions_cache_created_at", table_name="predictions_cache")
    op.drop_table("predictions_cache")

    op.drop_index("ix_weather_cache_expires_at", table_name="weather_cache")
    op.drop_index("ix_weather_cache_city_week", table_name="weather_cache")
    op.drop_table("weather_cache")

    op.drop_index("ix_observations_week", table_name="observations")
    op.drop_index("ix_observations_ward_id_week", table_name="observations")
    op.drop_table("observations")

    op.drop_index("ix_wards_city", table_name="wards")
    op.drop_table("wards")
