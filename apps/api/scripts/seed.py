"""Idempotent bulk seed from data/raw/hackathon_preli_dataset.xlsx into SQLite/Postgres.

Invoked by `npm run seed` and `npm run setup`.
Verifies SHA-256, normalizes `avg_temp_C` -> `avg_temp_c` case-insensitively,
validates all 31,320 rows, and bulk-inserts 60 wards + 31,320 observations in < 5 s.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import Engine, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.adapters.db.engine import create_db_engine, normalize_database_url
from app.adapters.db.facilities_repo import seed_hospitals_from_geojson
from app.adapters.db.models import ObservationRow, WardRow
from app.core.config import get_settings

EXPECTED_SHA256 = "3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405"
EXPECTED_WARDS = 60
EXPECTED_OBSERVATIONS = 31_320

REQUIRED_COLUMNS: tuple[str, ...] = (
    "date",
    "city",
    "ward_id",
    "population_density_sqkm",
    "water_logging_risk_index",
    "sanitation_score",
    "avg_temp_c",
    "max_temp_c",
    "min_temp_c",
    "rainfall_mm",
    "relative_humidity_pct",
    "dengue_cases",
)


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _parse_monday(val: Any) -> date:
    if isinstance(val, datetime):
        d = val.date()
    elif isinstance(val, date):
        d = val
    elif isinstance(val, str):
        d = date.fromisoformat(val.strip()[:10])
    else:
        raise ValueError(f"Unsupported date value in dataset: {val!r}")
    if d.weekday() != 0:
        raise ValueError(f"Expected Monday ISO week start, got {d} (weekday={d.weekday()})")
    return d


def load_raw_dataset(
    xlsx_path: Path,
    sheet_name: str,
    *,
    verify_sha256: bool = True,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Read and validate wards + observations from the organisers' Excel workbook."""
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Raw dataset not found: {xlsx_path}")

    if verify_sha256:
        actual_sha = compute_sha256(xlsx_path)
        if actual_sha != EXPECTED_SHA256:
            raise ValueError(
                f"Dataset SHA-256 mismatch for {xlsx_path.name}: got {actual_sha}, expected {EXPECTED_SHA256}"
            )

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        if sheet_name not in wb.sheetnames:
            raise ValueError(f"Sheet {sheet_name!r} not found in {xlsx_path.name}: {wb.sheetnames}")
        ws = wb[sheet_name]
        rows_iter = ws.iter_rows(values_only=True)
        raw_header = next(rows_iter, None)
        if raw_header is None:
            raise ValueError(f"Sheet {sheet_name!r} is empty")

        col_idx: dict[str, int] = {}
        for idx, col_name in enumerate(raw_header):
            if col_name is None:
                continue
            normalized = str(col_name).strip().lower()
            if normalized in col_idx:
                raise ValueError(f"Duplicate column after case-insensitive normalization: {normalized!r}")
            col_idx[normalized] = idx

        missing = [c for c in REQUIRED_COLUMNS if c not in col_idx]
        if missing:
            raise ValueError(f"Dataset missing required columns: {missing}")

        i_date = col_idx["date"]
        i_city = col_idx["city"]
        i_ward = col_idx["ward_id"]
        i_pop = col_idx["population_density_sqkm"]
        i_wl = col_idx["water_logging_risk_index"]
        i_san = col_idx["sanitation_score"]
        i_tavg = col_idx["avg_temp_c"]
        i_tmax = col_idx["max_temp_c"]
        i_tmin = col_idx["min_temp_c"]
        i_rain = col_idx["rainfall_mm"]
        i_rh = col_idx["relative_humidity_pct"]
        i_cases = col_idx["dengue_cases"]

        wards_map: dict[str, dict[str, Any]] = {}
        observations: list[dict[str, Any]] = []

        for row_num, row in enumerate(rows_iter, start=2):
            if row is None or all(v is None for v in row):
                continue
            raw_vals = (
                row[i_date],
                row[i_city],
                row[i_ward],
                row[i_pop],
                row[i_wl],
                row[i_san],
                row[i_tavg],
                row[i_tmax],
                row[i_tmin],
                row[i_rain],
                row[i_rh],
                row[i_cases],
            )
            if any(v is None for v in raw_vals):
                raise ValueError(f"Null value encountered in dataset row {row_num}")

            week = _parse_monday(raw_vals[0])
            city = str(raw_vals[1]).strip()
            ward_id = str(raw_vals[2]).strip()
            pop_density = float(raw_vals[3])
            water_logging = float(raw_vals[4])
            sanitation = float(raw_vals[5])
            avg_temp_c = float(raw_vals[6])
            max_temp_c = float(raw_vals[7])
            min_temp_c = float(raw_vals[8])
            rainfall_mm = float(raw_vals[9])
            humidity_pct = float(raw_vals[10])
            dengue_cases = int(raw_vals[11])

            if rainfall_mm < 0 or dengue_cases < 0 or not (0.0 <= humidity_pct <= 100.0):
                raise ValueError(f"Out-of-range weather/case value on dataset row {row_num}")

            if ward_id not in wards_map:
                wards_map[ward_id] = {
                    "ward_id": ward_id,
                    "city": city,
                    "population_density_sqkm": pop_density,
                    "water_logging_risk_index": water_logging,
                    "sanitation_score": sanitation,
                }

            observations.append(
                {
                    "ward_id": ward_id,
                    "week": week,
                    "avg_temp_c": avg_temp_c,
                    "max_temp_c": max_temp_c,
                    "min_temp_c": min_temp_c,
                    "rainfall_mm": rainfall_mm,
                    "relative_humidity_pct": humidity_pct,
                    "dengue_cases": dengue_cases,
                }
            )
    finally:
        wb.close()

    wards = [wards_map[wid] for wid in sorted(wards_map)]
    return wards, observations


def _upsert_statement(engine: Engine, table: Any, index_elements: list[str], update_cols: list[str]) -> Any:
    if engine.dialect.name == "sqlite":
        stmt = sqlite_insert(table)
        return stmt.on_conflict_do_update(
            index_elements=index_elements,
            set_={col: getattr(stmt.excluded, col) for col in update_cols},
        )
    if engine.dialect.name == "postgresql":
        stmt = pg_insert(table)
        return stmt.on_conflict_do_update(
            index_elements=index_elements,
            set_={col: getattr(stmt.excluded, col) for col in update_cols},
        )
    return insert(table)


def seed_database(
    *,
    engine: Engine | None = None,
    xlsx_path: Path | None = None,
    sheet_name: str | None = None,
    force: bool = False,
    verify_sha256: bool = True,
) -> tuple[int, int, bool]:
    """Seed wards + observations idempotently. Returns (ward_count, obs_count, skipped_fast_path)."""
    settings = get_settings()
    target_xlsx = xlsx_path or settings.raw_dataset_path
    target_sheet = sheet_name or settings.raw_dataset_sheet

    owns_engine = engine is None
    db_engine = engine or create_db_engine(normalize_database_url(settings.database_url))
    try:
        ward_t = WardRow.__table__
        obs_t = ObservationRow.__table__

        if not force:
            with db_engine.connect() as conn:
                existing_wards = int(conn.execute(select(func.count()).select_from(ward_t)).scalar_one())
                existing_obs = int(conn.execute(select(func.count()).select_from(obs_t)).scalar_one())
            if existing_wards == EXPECTED_WARDS and existing_obs == EXPECTED_OBSERVATIONS:
                if verify_sha256:
                    actual_sha = compute_sha256(target_xlsx)
                    if actual_sha != EXPECTED_SHA256:
                        raise ValueError(
                            f"Dataset SHA-256 mismatch: got {actual_sha}, expected {EXPECTED_SHA256}"
                        )
                seed_hospitals_from_geojson(db_engine)
                return existing_wards, existing_obs, True

        wards, observations = load_raw_dataset(target_xlsx, target_sheet, verify_sha256=verify_sha256)

        ward_upsert = _upsert_statement(
            db_engine,
            ward_t,
            ["ward_id"],
            ["city", "population_density_sqkm", "water_logging_risk_index", "sanitation_score"],
        )
        obs_upsert = _upsert_statement(
            db_engine,
            obs_t,
            ["ward_id", "week"],
            [
                "avg_temp_c",
                "max_temp_c",
                "min_temp_c",
                "rainfall_mm",
                "relative_humidity_pct",
                "dengue_cases",
            ],
        )

        batch_size = 5000
        with db_engine.begin() as conn:
            conn.execute(ward_upsert, wards)
            for offset in range(0, len(observations), batch_size):
                conn.execute(obs_upsert, observations[offset : offset + batch_size])

            final_wards = int(conn.execute(select(func.count()).select_from(ward_t)).scalar_one())
            final_obs = int(conn.execute(select(func.count()).select_from(obs_t)).scalar_one())
        seed_hospitals_from_geojson(db_engine)
        return final_wards, final_obs, False
    finally:
        if owns_engine:
            db_engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed Abhas SQLite/Postgres DB from raw dataset xlsx.")
    parser.add_argument(
        "--force", action="store_true", help="Re-read xlsx and upsert all rows even if seeded."
    )
    args = parser.parse_args(argv)

    t0 = time.perf_counter()
    wards, observations, skipped = seed_database(force=args.force)
    elapsed = time.perf_counter() - t0
    mode = "already seeded (fast path)" if skipped else "bulk upserted"
    sys.stdout.write(f"seed OK ({mode}): {wards} wards, {observations:,} observations in {elapsed:.2f} s\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
