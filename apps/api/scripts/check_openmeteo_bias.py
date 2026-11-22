"""Compare dataset weekly weather (2016–2025) against Open-Meteo Historical Archive (ERA5).

Produces per-city and pooled bias, Pearson correlation, and RMSE across:
  - avg_temp_c (deg C)
  - rainfall_mm (weekly sum, mm)
  - relative_humidity_pct (%)

Usage:
  node scripts/py.mjs -m scripts.check_openmeteo_bias [--start 2020-01-06] [--end 2025-12-29] [--json-out path]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

from app.adapters.openmeteo import aggregate_daily_to_iso_weeks, load_city_centroids
from app.core.config import get_settings

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def _dataset_city_weekly(xlsx_path: Path, sheet_name: str, start: date, end: date) -> pd.DataFrame:
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name)
    df.columns = [str(c).strip().lower() for c in df.columns]
    df["week"] = pd.to_datetime(df["date"]).dt.date
    df = df[(df["week"] >= start) & (df["week"] <= end)].copy()
    city_weekly = (
        df.groupby(["city", "week"], as_index=False)[
            ["avg_temp_c", "max_temp_c", "min_temp_c", "rainfall_mm", "relative_humidity_pct"]
        ]
        .mean()
        .sort_values(["city", "week"])
        .reset_index(drop=True)
    )
    return city_weekly


def _fetch_openmeteo_archive(
    centroids: list[dict[str, Any]], start: date, end: date
) -> dict[str, dict[date, dict[str, float]]]:
    end_sunday = end + timedelta(days=6)
    lat_str = ",".join(str(c["latitude"]) for c in centroids)
    lon_str = ",".join(str(c["longitude"]) for c in centroids)
    params = {
        "latitude": lat_str,
        "longitude": lon_str,
        "start_date": start.isoformat(),
        "end_date": end_sunday.isoformat(),
        "daily": ",".join(
            [
                "temperature_2m_mean",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "relative_humidity_2m_mean",
            ]
        ),
        "timezone": "Asia/Dhaka",
    }
    timeout = httpx.Timeout(connect=5.0, read=25.0, write=5.0, pool=5.0)
    with httpx.Client(timeout=timeout) as client:
        resp = client.get(ARCHIVE_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()

    items = payload if isinstance(payload, list) else [payload]
    out: dict[str, dict[date, dict[str, float]]] = {}
    for city_cfg, item in zip(centroids, items, strict=True):
        daily = item.get("daily", {})
        out[city_cfg["city"]] = aggregate_daily_to_iso_weeks(daily)
    return out


def _metric_summary(ds_vals: np.ndarray, om_vals: np.ndarray) -> dict[str, float]:
    diff = ds_vals - om_vals
    bias = float(np.mean(diff))
    mae = float(np.mean(np.abs(diff)))
    rmse = float(np.sqrt(np.mean(diff**2)))
    if np.std(ds_vals) > 0 and np.std(om_vals) > 0:
        corr = float(np.corrcoef(ds_vals, om_vals)[0, 1])
    else:
        corr = 0.0
    ratio = float(np.mean(ds_vals) / np.mean(om_vals)) if np.mean(om_vals) > 1e-6 else 1.0
    return {
        "dataset_mean": round(float(np.mean(ds_vals)), 3),
        "openmeteo_mean": round(float(np.mean(om_vals)), 3),
        "bias_ds_minus_om": round(bias, 3),
        "ratio_ds_over_om": round(ratio, 3),
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "pearson_r": round(corr, 4),
    }


def run_bias_check(start: date, end: date) -> dict[str, Any]:
    settings = get_settings()
    cfg = load_city_centroids()
    centroids = cfg["cities"]

    ds_df = _dataset_city_weekly(settings.raw_dataset_path, settings.raw_dataset_sheet, start, end)
    om_data = _fetch_openmeteo_archive(centroids, start, end)

    merged_rows: list[dict[str, Any]] = []
    for row in ds_df.itertuples(index=False):
        om_week = om_data.get(str(row.city), {}).get(row.week)
        if om_week is None:
            continue
        merged_rows.append(
            {
                "city": row.city,
                "week": row.week,
                "ds_temp": float(row.avg_temp_c),
                "om_temp": float(om_week["avg_temp_c"]),
                "ds_rain": float(row.rainfall_mm),
                "om_rain": float(om_week["rainfall_mm"]),
                "ds_rh": float(row.relative_humidity_pct),
                "om_rh": float(om_week["relative_humidity_pct"]),
            }
        )

    merged = pd.DataFrame(merged_rows)
    if merged.empty:
        raise RuntimeError("No overlapping weeks between dataset and Open-Meteo archive response.")

    by_city: dict[str, Any] = {}
    for city, g in merged.groupby("city"):
        by_city[str(city)] = {
            "n_weeks": int(len(g)),
            "avg_temp_c": _metric_summary(g["ds_temp"].to_numpy(), g["om_temp"].to_numpy()),
            "rainfall_mm": _metric_summary(g["ds_rain"].to_numpy(), g["om_rain"].to_numpy()),
            "relative_humidity_pct": _metric_summary(g["ds_rh"].to_numpy(), g["om_rh"].to_numpy()),
        }

    pooled = {
        "n_city_weeks": int(len(merged)),
        "avg_temp_c": _metric_summary(merged["ds_temp"].to_numpy(), merged["om_temp"].to_numpy()),
        "rainfall_mm": _metric_summary(merged["ds_rain"].to_numpy(), merged["om_rain"].to_numpy()),
        "relative_humidity_pct": _metric_summary(merged["ds_rh"].to_numpy(), merged["om_rh"].to_numpy()),
    }

    # Check if units match and seasonality tracks together (r > 0.5 on temp & rain)
    units_and_season_ok = (
        pooled["avg_temp_c"]["pearson_r"] >= 0.70
        and pooled["rainfall_mm"]["pearson_r"] >= 0.40
        and abs(pooled["avg_temp_c"]["bias_ds_minus_om"]) <= 4.0
    )

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "passed": bool(units_and_season_ok),
        "pooled": pooled,
        "by_city": by_city,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check Open-Meteo ERA5 archive bias against dataset.")
    parser.add_argument("--start", default="2016-01-04", help="Start Monday ISO date")
    parser.add_argument("--end", default="2025-12-29", help="End Monday ISO date")
    parser.add_argument("--json-out", type=Path, default=None, help="Optional JSON output path")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if archive fetch fails")
    args = parser.parse_args(argv)

    try:
        report = run_bias_check(date.fromisoformat(args.start), date.fromisoformat(args.end))
    except Exception as exc:
        sys.stderr.write(f"Open-Meteo archive bias check unavailable ({type(exc).__name__}): {exc}\n")
        return 1 if args.strict else 0

    rendered = json.dumps(report, indent=2)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(rendered + "\n", encoding="utf-8")
    sys.stdout.write(rendered + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
