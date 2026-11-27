"""Phase 2 facilities tables (ADR-0018): hospitals, bed_updates, ambulance_requests (zero patient PII).

Revision ID: 0003_facilities
Revises: 0002_phase2_plans
Create Date: 2026-11-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_facilities"
down_revision: str | Sequence[str] | None = "0002_phase2_plans"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hospitals",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("city", sa.String(length=32), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("address", sa.String(length=240), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("total_beds", sa.Integer(), nullable=False),
        sa.Column("free_beds", sa.Integer(), nullable=False),
        sa.Column("data_source", sa.String(length=16), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("total_beds >= 1", name="ck_hospitals_total_beds_pos"),
        sa.CheckConstraint(
            "free_beds >= 0 AND free_beds <= total_beds",
            name="ck_hospitals_free_beds_bounds",
        ),
        sa.CheckConstraint(
            "data_source in ('demo','board')",
            name="ck_hospitals_data_source_valid",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_hospitals"),
    )
    op.create_index("ix_hospitals_city", "hospitals", ["city"], unique=False)

    op.create_table(
        "bed_updates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("hospital_id", sa.String(length=64), nullable=False),
        sa.Column("free_beds", sa.Integer(), nullable=False),
        sa.Column("total_beds", sa.Integer(), nullable=False),
        sa.Column("data_source", sa.String(length=16), nullable=False),
        sa.Column("note", sa.String(length=160), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("total_beds >= 1", name="ck_bed_updates_total_beds_pos"),
        sa.CheckConstraint(
            "free_beds >= 0 AND free_beds <= total_beds",
            name="ck_bed_updates_free_beds_bounds",
        ),
        sa.ForeignKeyConstraint(
            ["hospital_id"],
            ["hospitals.id"],
            name="fk_bed_updates_hospital_id_hospitals",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bed_updates"),
    )
    op.create_index(
        "ix_bed_updates_hospital_time",
        "bed_updates",
        ["hospital_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "ambulance_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("hospital_id", sa.String(length=64), nullable=False),
        sa.Column("city", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("beds_requested", sa.Integer(), nullable=False),
        sa.Column("dispatcher_note", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "severity in ('Moderate','High','Critical')",
            name="ck_ambulance_requests_severity_valid",
        ),
        sa.CheckConstraint(
            "beds_requested >= 1 AND beds_requested <= 10",
            name="ck_ambulance_requests_beds_bounds",
        ),
        sa.ForeignKeyConstraint(
            ["hospital_id"],
            ["hospitals.id"],
            name="fk_ambulance_requests_hospital_id_hospitals",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ambulance_requests"),
    )
    op.create_index(
        "ix_ambulance_requests_city_created",
        "ambulance_requests",
        ["city", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ambulance_requests_city_created", table_name="ambulance_requests")
    op.drop_table("ambulance_requests")

    op.drop_index("ix_bed_updates_hospital_time", table_name="bed_updates")
    op.drop_table("bed_updates")

    op.drop_index("ix_hospitals_city", table_name="hospitals")
    op.drop_table("hospitals")
