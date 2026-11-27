"""Phase 2 plans decision log and dispatch log tables: plans, plan_runs, dispatch_log.

Revision ID: 0002_phase2_plans
Revises: 0001_initial
Create Date: 2026-11-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_phase2_plans"
down_revision: str | Sequence[str] | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("origin_week", sa.Date(), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("git_sha", sa.String(length=40), nullable=False),
        sa.Column("data_as_of", sa.Date(), nullable=False),
        sa.Column("offline", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind in ('allocation','overflow','simulation','dispatch')",
            name="ck_plans_kind_valid",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_plans"),
    )
    op.create_index(
        "ix_plans_kind_created",
        "plans",
        ["kind", sa.text("created_at DESC")],
        unique=False,
    )

    op.create_table(
        "plan_runs",
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("inputs_json", sa.Text(), nullable=False),
        sa.Column("outputs_json", sa.Text(), nullable=False),
        sa.Column("headline_json", sa.Text(), nullable=False),
        sa.Column("solve_ms", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            name="fk_plan_runs_plan_id_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", name="pk_plan_runs"),
    )

    op.create_table(
        "dispatch_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=True),
        sa.Column("ward_id", sa.String(length=16), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("lang", sa.String(length=2), nullable=False),
        sa.Column("encoding", sa.String(length=8), nullable=True),
        sa.Column("segments", sa.Integer(), nullable=True),
        sa.Column("characters", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            name="fk_dispatch_log_plan_id_plans",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dispatch_log"),
    )
    op.create_index(
        "ix_dispatch_log_ward_created",
        "dispatch_log",
        ["ward_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dispatch_log_ward_created", table_name="dispatch_log")
    op.drop_table("dispatch_log")

    op.drop_table("plan_runs")

    op.drop_index("ix_plans_kind_created", table_name="plans")
    op.drop_table("plans")
