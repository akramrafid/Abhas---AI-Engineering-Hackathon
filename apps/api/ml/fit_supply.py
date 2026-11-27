"""Fit/verify Phase 2 supply constants and derive 2016-2022 ward bed capacities (WP0b; contracts §3).

Usage:
    npm run fit:supply
    node scripts/py.mjs -m ml.fit_supply

Reads data/raw/bangladesh_dengue_large_dataset_onsite.xlsx strictly read-only, verifies its
SHA-256 digest, proves round_half_up(c * dengue_cases) reproduces 100% of all 31,320 rows,
derives per-ward bed capacity from 2016-2022 training rows only, and writes deterministic
JSON configs to apps/api/config/supply_ratios.json and apps/api/config/ward_capacity.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import API_DIR, REPO_ROOT

EXPECTED_ONSITE_SHA256 = "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0"
DEFAULT_INPUT_PATH = REPO_ROOT / "data" / "raw" / "bangladesh_dengue_large_dataset_onsite.xlsx"
DEFAULT_SUPPLY_OUT = API_DIR / "config" / "supply_ratios.json"
DEFAULT_CAPACITY_OUT = API_DIR / "config" / "ward_capacity.json"

SUPPLY_CONSTANTS: dict[str, float] = {
    "saline_bags": 2.385,
    "diagnostic_kits": 1.164,
    "hospital_beds": 0.298,
}

SUPPLY_COLUMNS: dict[str, str] = {
    "saline_bags": "saline_bags_needed",
    "diagnostic_kits": "diagnostic_kits_needed",
    "hospital_beds": "hospital_beds_required",
}

TRAIN_YEARS: tuple[int, int] = (2016, 2022)
CAPACITY_PERCENTILE = 95.0
CAPACITY_MARGIN = 1.10
CAPACITY_MIN = 1


def round_half_up(value: float) -> int:
    """Deterministic round-half-up: floor(x + 0.5) matching the dataset rule."""
    return int(math.floor(float(value) + 0.5))


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().lower()


def verify_supply_constants(
    frame: pd.DataFrame,
    constants: dict[str, float] | None = None,
) -> tuple[dict[str, float], dict[str, list[float]]]:
    """Verify round_half_up(c * dengue_cases) == column across every row and compute valid intervals."""
    consts = constants or SUPPLY_CONSTANTS
    cases = frame["dengue_cases"].to_numpy(dtype=np.int64)
    n_rows = int(len(cases))
    if n_rows == 0:
        raise ValueError("Dataset has zero rows")

    row_match: dict[str, float] = {}
    valid_interval: dict[str, list[float]] = {}

    for key, col in SUPPLY_COLUMNS.items():
        if col not in frame.columns:
            raise ValueError(f"Missing required supply column: {col}")
        actual = frame[col].to_numpy(dtype=np.int64)
        c = float(consts[key])
        predicted = np.floor(cases.astype(np.float64) * c + 0.5).astype(np.int64)
        matches = int(np.sum(predicted == actual))
        share = matches / n_rows
        row_match[key] = round(share, 6)

        pos = cases > 0
        pos_cases = cases[pos].astype(np.float64)
        pos_actual = actual[pos].astype(np.float64)
        lo = float(np.max((pos_actual - 0.5) / pos_cases))
        hi = float(np.min((pos_actual + 0.5) / pos_cases))
        valid_interval[key] = [round(lo, 6), round(hi, 6)]

    return row_match, valid_interval


def derive_ward_capacities(
    frame: pd.DataFrame,
    *,
    years: tuple[int, int] = TRAIN_YEARS,
    percentile: float = CAPACITY_PERCENTILE,
    margin: float = CAPACITY_MARGIN,
    minimum: int = CAPACITY_MIN,
) -> dict[str, int]:
    """Derive per-ward weekly dengue bed capacity from training years only (ADR-0012)."""
    dates = pd.to_datetime(frame["date"], errors="raise")
    mask = (dates.dt.year >= years[0]) & (dates.dt.year <= years[1])
    train_df = frame.loc[mask]
    if train_df.empty:
        raise ValueError(f"No rows found within training years {years[0]}..{years[1]}")

    capacities: dict[str, int] = {}
    for ward_id in sorted(str(w) for w in train_df["ward_id"].unique()):
        beds = train_df.loc[train_df["ward_id"] == ward_id, "hospital_beds_required"].to_numpy(
            dtype=np.float64
        )
        p_val = float(np.percentile(beds, percentile))
        capacities[ward_id] = max(minimum, int(math.ceil(margin * p_val)))
    return capacities


def run_fit_supply(
    *,
    input_path: Path = DEFAULT_INPUT_PATH,
    supply_out: Path = DEFAULT_SUPPLY_OUT,
    capacity_out: Path = DEFAULT_CAPACITY_OUT,
    expected_sha256: str = EXPECTED_ONSITE_SHA256,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Verify dataset SHA-256 and supply rule, then write both versioned Phase 2 JSON configs."""
    if not input_path.exists():
        raise FileNotFoundError(f"Onsite dataset not found: {input_path}")

    actual_sha = compute_sha256(input_path)
    if actual_sha != expected_sha256.lower():
        raise ValueError(
            f"Onsite dataset SHA-256 mismatch: expected {expected_sha256.lower()}, got {actual_sha}"
        )

    frame = pd.read_excel(input_path)
    n_rows = int(len(frame))
    row_match, valid_interval = verify_supply_constants(frame)
    for key, share in row_match.items():
        if share < 1.0:
            raise ValueError(
                f"Supply constant for {key} ({SUPPLY_CONSTANTS[key]}) matched only {share:.6f} of rows"
            )

    wards_cap = derive_ward_capacities(frame)
    total_beds = int(sum(wards_cap.values()))

    supply_payload: dict[str, Any] = {
        "method": f"supply = round_half_up(c × dengue_cases); constants reproduce {n_rows:,}/{n_rows:,} rows",
        "dataset_sha256": actual_sha,
        "ratios": dict(SUPPLY_CONSTANTS),
        "valid_interval": valid_interval,
        "row_match": row_match,
    }
    capacity_payload: dict[str, Any] = {
        "method": "max(1, ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022))",
        "fitted_years": [TRAIN_YEARS[0], TRAIN_YEARS[1]],
        "dataset_sha256": actual_sha,
        "assumption": "Derived: the dataset has no capacity column. Replace with real hospital capacity before deployment.",
        "total_beds": total_beds,
        "wards": wards_cap,
    }

    supply_out.parent.mkdir(parents=True, exist_ok=True)
    capacity_out.parent.mkdir(parents=True, exist_ok=True)
    supply_out.write_text(json.dumps(supply_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    capacity_out.write_text(
        json.dumps(capacity_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return supply_payload, capacity_payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify onsite supply constants and derive ward capacities.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH)
    parser.add_argument("--supply-out", type=Path, default=DEFAULT_SUPPLY_OUT)
    parser.add_argument("--capacity-out", type=Path, default=DEFAULT_CAPACITY_OUT)
    args = parser.parse_args(argv)

    try:
        supply_payload, capacity_payload = run_fit_supply(
            input_path=args.input,
            supply_out=args.supply_out,
            capacity_out=args.capacity_out,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"fit_supply failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"fit_supply OK: ratios={supply_payload['ratios']} "
        f"row_match={supply_payload['row_match']} "
        f"wards={len(capacity_payload['wards'])} total_beds={capacity_payload['total_beds']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
