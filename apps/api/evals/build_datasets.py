"""Deterministically generate forecast.jsonl and retrieval.jsonl from the raw dataset (read-only).

Run once before locking with `npm run eval:lock`. Pass `--force` only if intentionally regenerating
datasets (which invalidates the previous heldout_sha256 lock).
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.types import CITIES
from evals.scoring import load_raw_dataset, tier_from_cases

ROOT = Path(__file__).resolve().parent
DATASETS_DIR = ROOT / "datasets"
FORECAST_PATH = DATASETS_DIR / "forecast.jsonl"
RETRIEVAL_PATH = DATASETS_DIR / "retrieval.jsonl"

HORIZONS: tuple[int, ...] = (2, 3, 4)
FIRST_VALID_ORIGIN = date(2016, 2, 29)


def _pick_stratified_rows(
    pool: pd.DataFrame,
    count: int,
    years: Sequence[int],
    used_keys: set[tuple[str, date]],
    prefer_zero_split: bool = False,
) -> list[dict[str, Any]]:
    """Select `count` deterministic, city/year-balanced rows from `pool` avoiding `used_keys`."""
    candidates = pool[~pool.apply(lambda r: (str(r["ward_id"]), r["date"]) in used_keys, axis=1)].sort_values(
        ["date", "ward_id"]
    )
    if len(candidates) < count:
        raise ValueError(f"Pool has only {len(candidates)} rows, need {count}")

    selected: list[dict[str, Any]] = []
    year_counts: Counter[int] = Counter()
    city_counts: Counter[str] = Counter()
    ward_counts: Counter[str] = Counter()

    # Deterministic spread across calendar weeks within each (year, city) bucket.
    for i in range(count):
        target_year = years[i % len(years)]
        target_city = CITIES[i % len(CITIES)]
        want_zero = prefer_zero_split and (i % 2 == 0)

        sub = candidates[(candidates["year"] == target_year) & (candidates["city"] == target_city)]
        if want_zero:
            zsub = sub[sub["dengue_cases"] == 0]
            if not zsub.empty:
                sub = zsub
        elif prefer_zero_split:
            nzsub = sub[sub["dengue_cases"] > 0]
            if not nzsub.empty:
                sub = nzsub

        if sub.empty:
            sub = candidates[candidates["year"] == target_year]
        if sub.empty:
            sub = candidates

        # Prefer wards not yet chosen, then spread across the ordered calendar dates.
        sub = sub.copy()
        sub["_w_used"] = sub["ward_id"].map(lambda w: ward_counts[str(w)])
        sub["_c_used"] = sub["city"].map(lambda c: city_counts[str(c)])
        sub["_y_used"] = sub["year"].map(lambda y: year_counts[int(y)])
        sub = sub.sort_values(["_w_used", "_c_used", "_y_used", "date", "ward_id"])

        # Pick from spread quantile position among the least-used group so months vary.
        best_tier = sub[
            (sub["_w_used"] == sub["_w_used"].iloc[0])
            & (sub["_c_used"] == sub["_c_used"].iloc[0])
            & (sub["_y_used"] == sub["_y_used"].iloc[0])
        ]
        pick_idx = ((i * 7) + 3) % len(best_tier)
        row = best_tier.iloc[pick_idx]
        key = (str(row["ward_id"]), row["date"])
        used_keys.add(key)
        year_counts[int(row["year"])] += 1
        city_counts[str(row["city"])] += 1
        ward_counts[str(row["ward_id"])] += 1
        selected.append(
            {
                "ward_id": str(row["ward_id"]),
                "city": str(row["city"]),
                "target_week": row["date"],
                "actual_cases": int(row["dengue_cases"]),
                "actual_tier": tier_from_cases(float(row["dengue_cases"])),
            }
        )
        candidates = candidates[~((candidates["ward_id"] == key[0]) & (candidates["date"] == key[1]))]
    return selected


def build_heldout_cases(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Build exact 48 stratified 2024-2025 golden cases covering all 22 Critical target weeks."""
    ho = df[df["year"].isin([2024, 2025])].copy()
    ho["actual_tier"] = ho["dengue_cases"].map(lambda c: tier_from_cases(float(c)))

    used_keys: set[tuple[str, date]] = set()
    raw_cases: list[dict[str, Any]] = []

    # 1. All 22 distinct Critical target weeks in 2024-2025: pick peak-case ward per week,
    # breaking ties to maximize city spread, then deterministic ward_id order.
    crit_df = ho[ho["actual_tier"] == "Critical"].sort_values(["date", "ward_id"])
    crit_city_counts: Counter[str] = Counter()
    for target_dt, grp in crit_df.groupby("date", sort=True):
        max_cases = int(grp["dengue_cases"].max())
        tied = grp[grp["dengue_cases"] == max_cases].copy()
        tied["_city_cnt"] = tied["city"].map(lambda c: crit_city_counts[str(c)])
        tied = tied.sort_values(["_city_cnt", "ward_id"])
        best = tied.iloc[0]
        wid = str(best["ward_id"])
        city = str(best["city"])
        crit_city_counts[city] += 1
        used_keys.add((wid, target_dt))  # type: ignore[arg-type]
        raw_cases.append(
            {
                "ward_id": wid,
                "city": city,
                "target_week": target_dt,
                "actual_cases": int(best["dengue_cases"]),
                "actual_tier": "Critical",
            }
        )

    assert len(raw_cases) == 22, f"Expected 22 distinct 2024-2025 Critical weeks, found {len(raw_cases)}"

    # 2. 10 High + 8 Medium + 8 Low = 26 non-Critical cases -> 48 total exact.
    raw_cases.extend(_pick_stratified_rows(ho[ho["actual_tier"] == "High"], 10, (2024, 2025), used_keys))
    raw_cases.extend(_pick_stratified_rows(ho[ho["actual_tier"] == "Medium"], 8, (2024, 2025), used_keys))
    raw_cases.extend(
        _pick_stratified_rows(
            ho[ho["actual_tier"] == "Low"], 8, (2024, 2025), used_keys, prefer_zero_split=True
        )
    )

    # Sort deterministically by (target_week, ward_id) and assign horizons balanced across {2, 3, 4}.
    raw_cases.sort(key=lambda r: (r["target_week"], r["ward_id"]))
    tier_h_counter: Counter[str] = Counter()
    formatted: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_cases, start=1):
        tier = str(item["actual_tier"])
        horizon = HORIZONS[tier_h_counter[tier] % len(HORIZONS)]
        tier_h_counter[tier] += 1
        target_dt: date = item["target_week"]
        origin_dt = target_dt - timedelta(weeks=horizon)
        assert origin_dt >= FIRST_VALID_ORIGIN
        formatted.append(
            {
                "id": f"HO-{idx:03d}",
                "split": "heldout",
                "ward_id": item["ward_id"],
                "city": item["city"],
                "origin_week": origin_dt.isoformat(),
                "horizon": horizon,
                "target_week": target_dt.isoformat(),
                "actual_cases": item["actual_cases"],
                "actual_tier": tier,
                "ac_refs": ["AC-5"],
            }
        )
    return formatted


def build_dev_cases(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Build 48 stratified 2019-2023 dev cases (12 per tier across all 5 years and 5 cities)."""
    dev = df[df["year"].between(2019, 2023)].copy()
    dev["actual_tier"] = dev["dengue_cases"].map(lambda c: tier_from_cases(float(c)))

    used_keys: set[tuple[str, date]] = set()
    raw_cases: list[dict[str, Any]] = []
    years = (2019, 2020, 2021, 2022, 2023)
    for tier_name, prefer_zero in (
        ("Critical", False),
        ("High", False),
        ("Medium", False),
        ("Low", True),
    ):
        raw_cases.extend(
            _pick_stratified_rows(
                dev[dev["actual_tier"] == tier_name],
                12,
                years,
                used_keys,
                prefer_zero_split=prefer_zero,
            )
        )

    raw_cases.sort(key=lambda r: (r["target_week"], r["ward_id"]))
    tier_h_counter: Counter[str] = Counter()
    formatted: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_cases, start=1):
        tier = str(item["actual_tier"])
        horizon = HORIZONS[tier_h_counter[tier] % len(HORIZONS)]
        tier_h_counter[tier] += 1
        target_dt: date = item["target_week"]
        origin_dt = target_dt - timedelta(weeks=horizon)
        assert origin_dt >= FIRST_VALID_ORIGIN
        formatted.append(
            {
                "id": f"DEV-{idx:03d}",
                "split": "dev",
                "ward_id": item["ward_id"],
                "city": item["city"],
                "origin_week": origin_dt.isoformat(),
                "horizon": horizon,
                "target_week": target_dt.isoformat(),
                "actual_cases": item["actual_cases"],
                "actual_tier": tier,
                "ac_refs": ["AC-5"],
            }
        )
    return formatted


def build_retrieval_queries(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Build held-out in-season (June-September 2024 & 2025) top-15 ward ranking queries."""
    all_dates = sorted(df["date"].unique())
    max_date: date = all_dates[-1]
    in_season_origins = [
        d
        for d in all_dates
        if d.year in (2024, 2025) and d.month in (6, 7, 8, 9) and d + timedelta(weeks=4) <= max_date
    ]
    wards = sorted(str(w) for w in df["ward_id"].unique())
    lookup = {
        (str(w), d): int(c) for w, d, c in zip(df["ward_id"], df["date"], df["dengue_cases"], strict=True)
    }

    queries: list[dict[str, Any]] = []
    for idx, ow in enumerate(in_season_origins, start=1):
        totals = [(sum(lookup[(w, ow + timedelta(weeks=h))] for h in (2, 3, 4)), w) for w in wards]
        totals.sort(key=lambda pair: (-pair[0], pair[1]))
        top_15 = [w for _, w in totals[:15]]
        queries.append(
            {
                "id": f"RET-{idx:03d}",
                "origin_week": ow.isoformat(),
                "split": "heldout",
                "top_15_wards": top_15,
                "ac_refs": ["NFR-4"],
            }
        )
    return queries


def write_jsonl(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(r, ensure_ascii=False) for r in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build stratified forecast & retrieval eval datasets.")
    ap.add_argument("--force", action="store_true", help="Overwrite existing dataset files.")
    args = ap.parse_args(argv)

    if not args.force and (FORECAST_PATH.exists() or RETRIEVAL_PATH.exists()):
        print("Datasets already exist. Pass --force to regenerate (requires re-locking).")
        return 1

    df = load_raw_dataset()
    dev_cases = build_dev_cases(df)
    heldout_cases = build_heldout_cases(df)
    retrieval_queries = build_retrieval_queries(df)

    write_jsonl(FORECAST_PATH, [*dev_cases, *heldout_cases])
    write_jsonl(RETRIEVAL_PATH, retrieval_queries)

    ho_tiers = Counter(c["actual_tier"] for c in heldout_cases)
    ho_cities = Counter(c["city"] for c in heldout_cases)
    dev_tiers = Counter(c["actual_tier"] for c in dev_cases)
    print(
        f"Wrote {FORECAST_PATH}: dev={len(dev_cases)} {dict(dev_tiers)}, heldout={len(heldout_cases)} {dict(ho_tiers)}"
    )
    print(f"Heldout cities: {dict(ho_cities)}")
    print(f"Wrote {RETRIEVAL_PATH}: n_queries={len(retrieval_queries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
