"""Prove Alembic migrations are reversible on an EMPTY throwaway SQLite DB.

Invoked by `npm run db:check` and `node .orca-team/tools/gates.mjs migrations`.
Runs: upgrade head -> alembic check (no ORM drift) -> schema/constraint assertions
      -> downgrade base -> assert empty -> upgrade head -> assert tables exist.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.adapters.db.engine import create_db_engine
from app.core.config import API_DIR

EXPECTED_TABLES: frozenset[str] = frozenset(
    {
        "wards",
        "observations",
        "weather_cache",
        "predictions_cache",
        "api_calls",
        "llm_traces",
    }
)


def _alembic_config(url: str) -> Config:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    return cfg


def _user_tables(url: str) -> set[str]:
    engine = create_db_engine(url)
    try:
        names = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
    return names - {"alembic_version"}


def _assert_schema_details(url: str) -> None:
    engine = create_db_engine(url)
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names()) - {"alembic_version"}
        missing = EXPECTED_TABLES - tables
        if missing:
            raise AssertionError(f"Missing expected tables: {sorted(missing)}")

        obs_pk = insp.get_pk_constraint("observations")
        if obs_pk.get("constrained_columns") != ["ward_id", "week"]:
            raise AssertionError(f"Unexpected observations PK: {obs_pk}")

        obs_idx_cols = {tuple(ix["column_names"]) for ix in insp.get_indexes("observations")}
        if ("ward_id", "week") not in obs_idx_cols or ("week",) not in obs_idx_cols:
            raise AssertionError(
                f"Expected indexes on (ward_id, week) and (week), found: {sorted(obs_idx_cols)}"
            )

        obs_fks = insp.get_foreign_keys("observations")
        if not any(fk.get("referred_table") == "wards" for fk in obs_fks):
            raise AssertionError(f"Missing FK from observations to wards: {obs_fks}")

        ward_idx_cols = {tuple(ix["column_names"]) for ix in insp.get_indexes("wards")}
        if ("city",) not in ward_idx_cols:
            raise AssertionError(f"Missing index on wards(city), found: {sorted(ward_idx_cols)}")

        with engine.connect() as conn:
            journal_mode = str(conn.execute(text("PRAGMA journal_mode")).scalar_one()).lower()
            foreign_keys = int(conn.execute(text("PRAGMA foreign_keys")).scalar_one())
            if journal_mode != "wal":
                raise AssertionError(f"Expected SQLite WAL mode, got {journal_mode!r}")
            if foreign_keys != 1:
                raise AssertionError(f"Expected PRAGMA foreign_keys=ON, got {foreign_keys}")
    finally:
        engine.dispose()


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="abhas-db-check-") as tmpdir:
        db_path = Path(tmpdir) / "db_check.sqlite"
        url = f"sqlite:///{db_path.as_posix()}"
        cfg = _alembic_config(url)

        command.upgrade(cfg, "head")
        command.check(cfg)
        _assert_schema_details(url)

        command.downgrade(cfg, "base")
        leftover = _user_tables(url)
        if leftover:
            sys.stderr.write(f"FAIL: downgrade base left tables behind: {sorted(leftover)}\n")
            return 1

        command.upgrade(cfg, "head")
        final_tables = _user_tables(url)
        if final_tables != EXPECTED_TABLES:
            sys.stderr.write(
                f"FAIL: second upgrade table set mismatch: got {sorted(final_tables)}, "
                f"expected {sorted(EXPECTED_TABLES)}\n"
            )
            return 1

    sys.stdout.write(
        "db:check OK: upgrade head -> check -> downgrade base (0 tables) -> upgrade head "
        f"verified all {len(EXPECTED_TABLES)} tables, constraints, indexes, and WAL mode.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
