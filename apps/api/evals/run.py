"""Locked hold-out and dev evaluation runner for Abhas (AC-5 / NFR-1 / NFR-3).

Usage:
    python -m evals.run --lock
    python -m evals.run --split dev
    python -m evals.run --split heldout
    python -m evals.run --split all --tag baseline
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from evals.scoring import (
    TIER_TO_IDX,
    TIERS,
    ClimatologyBaseline,
    EvalPrediction,
    ForecasterHook,
    build_case_lookup,
    coverage_80,
    load_forecaster,
    load_raw_dataset,
    mae,
    percentile,
    persistence_prediction,
    poisson_deviance,
    rmse,
    seasonal_naive_prediction,
    tier_metrics,
)

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
DATASETS_DIR = ROOT / "datasets"
FORECAST_DATASET_PATH = DATASETS_DIR / "forecast.jsonl"
RESULTS_DIR = ROOT / "results"
HISTORY_PATH = ROOT / "history.jsonl"
REPORT_PATH = ROOT / "report.md"

TAMPER_EXIT_CODE = 3
GLOBAL_HORIZONS: tuple[int, ...] = (1, 2, 3, 4)
FIRST_VALID_ORIGIN = date(2016, 2, 29)


def git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
        )
        return out.stdout.strip() or "unknown"
    except OSError:
        return "unknown"


def load_config(path: Path | None = None) -> dict[str, Any]:
    cfg_path = path or CONFIG_PATH
    return json.loads(cfg_path.read_text(encoding="utf-8"))


def save_config(cfg: dict[str, Any], path: Path | None = None) -> None:
    cfg_path = path or CONFIG_PATH
    cfg_path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")


def load_forecast_cases(path: Path | None = None) -> list[dict[str, Any]]:
    ds_path = path or FORECAST_DATASET_PATH
    cases: list[dict[str, Any]] = []
    for raw_line in ds_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line:
            cases.append(json.loads(line))
    ids = [c["id"] for c in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate case ids in forecast.jsonl")
    return cases


def compute_heldout_sha256(cases: Sequence[dict[str, Any]]) -> str:
    """Compute canonical SHA-256 over all split=='heldout' records sorted by id."""
    held = sorted((c for c in cases if c.get("split") == "heldout"), key=lambda c: str(c["id"]))
    canonical = json.dumps(held, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def evaluate_golden_cases(
    cases: Sequence[dict[str, Any]],
    df: pd.DataFrame,
    forecaster: ForecasterHook,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Score golden cases: pass = tier within one band AND actual_cases inside [p10, p90]."""
    pairs = [(str(c["ward_id"]), date.fromisoformat(str(c["origin_week"])), int(c["horizon"])) for c in cases]
    preds, latencies_ms = forecaster.predict_batch(df, pairs)

    rows: list[dict[str, Any]] = []
    tier_pass: dict[str, list[bool]] = {t: [] for t in TIERS}
    for case, pred, ms in zip(cases, preds, latencies_ms, strict=True):
        actual_cases = int(case["actual_cases"])
        actual_tier = str(case["actual_tier"])
        within_one = abs(TIER_TO_IDX[actual_tier] - TIER_TO_IDX[pred.tier]) <= 1
        in_band = pred.p10 <= actual_cases <= pred.p90
        passed = bool(within_one and in_band)
        tier_pass.setdefault(actual_tier, []).append(passed)
        rows.append(
            {
                "id": case["id"],
                "split": case["split"],
                "ward_id": case["ward_id"],
                "city": case["city"],
                "origin_week": case["origin_week"],
                "horizon": case["horizon"],
                "target_week": case["target_week"],
                "actual_cases": actual_cases,
                "actual_tier": actual_tier,
                "expected_cases": round(pred.expected_cases, 3),
                "p10": round(pred.p10, 3),
                "p90": round(pred.p90, 3),
                "pred_tier": pred.tier,
                "risk_score": pred.risk_score,
                "within_one_tier": within_one,
                "in_80_band": in_band,
                "pass": passed,
                "ms": round(ms, 3),
                "ac_refs": case.get("ac_refs", ["AC-5"]),
            }
        )

    n = len(rows)
    pass_rate = round(sum(r["pass"] for r in rows) / max(n, 1), 4)
    by_tier = {
        t: {
            "n": len(vals),
            "pass_rate": round(sum(vals) / max(len(vals), 1), 4) if vals else 0.0,
        }
        for t, vals in tier_pass.items()
    }
    summary = {
        "n": n,
        "passed": sum(r["pass"] for r in rows),
        "pass_rate": pass_rate,
        "by_tier": by_tier,
        "p50_ms": round(percentile(latencies_ms, 50.0), 3),
        "p95_ms": round(percentile(latencies_ms, 95.0), 3),
    }
    return rows, summary


def evaluate_global_holdout(
    df: pd.DataFrame,
    forecaster: ForecasterHook,
    target_years: Sequence[int],
    climatology: ClimatologyBaseline,
) -> dict[str, Any]:
    """Score ALL ward-weeks in `target_years` across horizons h=1..4 (incl. all 159 Critical rows)."""
    lookup = build_case_lookup(df)
    target_df = df[df["year"].isin(target_years)].sort_values(["date", "ward_id"])
    no_weather_map = forecaster.no_weather_mae_by_horizon()

    by_horizon: dict[str, dict[str, Any]] = {}
    all_y: list[float] = []
    all_p10: list[float] = []
    all_p90: list[float] = []
    all_pred_tiers: list[str] = []
    all_latencies: list[float] = []

    for h in GLOBAL_HORIZONS:
        pairs: list[tuple[str, date, int]] = []
        y_true: list[float] = []
        clim_preds: list[float] = []
        snaive_preds: list[float] = []
        snaive_y: list[float] = []
        persist_preds: list[float] = []
        persist_y: list[float] = []

        for wid, target_dt, actual in zip(
            target_df["ward_id"], target_df["date"], target_df["dengue_cases"], strict=True
        ):
            origin_dt = target_dt - timedelta(weeks=h)
            if origin_dt < FIRST_VALID_ORIGIN:
                continue
            wid_s = str(wid)
            pairs.append((wid_s, origin_dt, h))
            y_val = float(actual)
            y_true.append(y_val)
            clim_preds.append(climatology.predict_one(wid_s, target_dt).expected_cases)
            sn = seasonal_naive_prediction(lookup, wid_s, target_dt)
            if sn is not None:
                snaive_preds.append(sn)
                snaive_y.append(y_val)
            ps = persistence_prediction(lookup, wid_s, origin_dt)
            if ps is not None:
                persist_preds.append(ps)
                persist_y.append(y_val)

        preds: list[EvalPrediction]
        preds, lats = forecaster.predict_batch(df, pairs)
        mu = [p.expected_cases for p in preds]
        p10 = [p.p10 for p in preds]
        p90 = [p.p90 for p in preds]
        ptiers = [p.tier for p in preds]

        model_mae = mae(y_true, mu)
        clim_mae = mae(y_true, clim_preds)
        improv = ((clim_mae - model_mae) / clim_mae) if clim_mae > 0 else 0.0
        nw_mae = no_weather_map.get(h)
        h_tiers = tier_metrics(y_true, ptiers)

        by_horizon[f"h{h}"] = {
            "horizon": h,
            "n": len(y_true),
            "mae": round(model_mae, 4),
            "rmse": round(rmse(y_true, mu), 4),
            "poisson_deviance": round(poisson_deviance(y_true, mu), 4),
            "coverage_80": round(coverage_80(y_true, p10, p90), 4),
            "within_one_tier": h_tiers["within_one_tier"],
            "critical_recall": h_tiers["critical_recall"],
            "macro_f1": h_tiers["macro_f1"],
            "baselines": {
                "climatology": {
                    "mae": round(clim_mae, 4),
                    "rmse": round(rmse(y_true, clim_preds), 4),
                    "poisson_deviance": round(poisson_deviance(y_true, clim_preds), 4),
                },
                "seasonal_naive": {
                    "mae": round(mae(snaive_y, snaive_preds), 4),
                    "rmse": round(rmse(snaive_y, snaive_preds), 4),
                    "poisson_deviance": round(poisson_deviance(snaive_y, snaive_preds), 4),
                },
                "persistence": {
                    "mae": round(mae(persist_y, persist_preds), 4),
                    "rmse": round(rmse(persist_y, persist_preds), 4),
                    "poisson_deviance": round(poisson_deviance(persist_y, persist_preds), 4),
                },
                "no_weather": {
                    "mae": round(nw_mae, 4) if nw_mae is not None else None,
                    "worse_than_full_model": (nw_mae > model_mae) if nw_mae is not None else None,
                },
            },
            "mae_improvement_vs_climatology_pct": round(improv * 100.0, 2),
        }

        all_y.extend(y_true)
        all_p10.extend(p10)
        all_p90.extend(p90)
        all_pred_tiers.extend(ptiers)
        all_latencies.extend(lats)

    overall_tiers = tier_metrics(all_y, all_pred_tiers)
    return {
        "target_years": list(target_years),
        "n_ward_weeks_total": len(all_y),
        "by_horizon": by_horizon,
        "coverage_80": round(coverage_80(all_y, all_p10, all_p90), 4),
        "within_one_tier": overall_tiers["within_one_tier"],
        "critical_recall": overall_tiers["critical_recall"],
        "critical_n_total": overall_tiers["critical_n"],
        "macro_f1": overall_tiers["macro_f1"],
        "confusion_matrix": {
            "labels": overall_tiers["labels"],
            "matrix": overall_tiers["matrix"],
        },
        "p50_ward_ms": round(percentile(all_latencies, 50.0), 3),
        "p95_ward_ms": round(percentile(all_latencies, 95.0), 3),
    }


def check_ac5_floors(
    global_metrics: dict[str, Any],
    golden_pass_rate: float,
    cfg: dict[str, Any],
) -> tuple[dict[str, bool], bool]:
    """Evaluate every AC-5 / NFR-1 / NFR-3 floor against global hold-out and golden metrics."""
    fcfg = cfg.get("floors", {})
    by_h = global_metrics["by_horizon"]
    h2 = by_h["h2"]
    h3 = by_h["h3"]
    h4 = by_h["h4"]
    min_imp = float(fcfg.get("mae_improvement_vs_climatology_min", 0.10))

    weather_checks = [
        by_h[f"h{h}"]["baselines"]["no_weather"]["worse_than_full_model"] is True for h in GLOBAL_HORIZONS
    ]
    floors = {
        "mae_h2_le_1_10": h2["mae"] <= float(fcfg.get("mae_h2_max", 1.10)),
        "mae_h3_le_1_10": h3["mae"] <= float(fcfg.get("mae_h3_max", 1.10)),
        "mae_h2_beats_climatology_10pct": h2["mae"]
        <= (1.0 - min_imp) * h2["baselines"]["climatology"]["mae"],
        "mae_h3_beats_climatology_10pct": h3["mae"]
        <= (1.0 - min_imp) * h3["baselines"]["climatology"]["mae"],
        "mae_h4_beats_climatology": h4["mae"] < h4["baselines"]["climatology"]["mae"],
        "weather_ablation_worse_all_h": all(weather_checks),
        "coverage_80_in_range": (
            float(fcfg.get("coverage_80_min", 0.75))
            <= global_metrics["coverage_80"]
            <= float(fcfg.get("coverage_80_max", 0.90))
        ),
        "within_one_tier_ge_0_95": global_metrics["within_one_tier"]
        >= float(fcfg.get("within_one_tier_min", 0.95)),
        "critical_recall_ge_0_85": global_metrics["critical_recall"]
        >= float(fcfg.get("critical_recall_min", 0.85)),
        "p95_ward_ms_lt_50": global_metrics["p95_ward_ms"] < float(fcfg.get("p95_ward_ms_max", 50.0)),
        "golden_pass_rate_ge_threshold": golden_pass_rate >= float(cfg.get("threshold", 0.80)),
    }
    return floors, all(floors.values())


def render_report(payload: dict[str, Any]) -> str:
    gm = payload["metrics"]["global"]
    by_h = gm["by_horizon"]
    lines = [
        f"# Abhas Eval Report ({payload['split']})",
        "",
        (
            f"- **Timestamp:** {payload['ts']} · **Commit:** `{payload['commit']}` · "
            f"**Model:** `{payload['generator_model']}` · **Judge:** `{payload['judge_model']}`"
        ),
        (
            f"- **Golden pass rate:** {payload['pass_rate']:.2%} ({payload['passed']}/{payload['n']}, "
            f"threshold {payload['threshold']:.0%}) · **p95 inference:** {gm['p95_ward_ms']:.2f} ms/ward"
        ),
        (
            f"- **Global hold-out:** coverage_80={gm['coverage_80']:.3f} · "
            f"within_one_tier={gm['within_one_tier']:.3f} · critical_recall={gm['critical_recall']:.3f} · "
            f"macro_f1={gm['macro_f1']:.3f} · floors_passed={payload['floors_passed']}"
        ),
        "",
        "## Global Metrics by Horizon",
        "| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for h in GLOBAL_HORIZONS:
        row = by_h[f"h{h}"]
        b = row["baselines"]
        nw = f"{b['no_weather']['mae']:.3f}" if b["no_weather"]["mae"] is not None else "n/a"
        lines.append(
            f"| h={h} | {row['mae']:.3f} | {b['climatology']['mae']:.3f} | "
            f"{row['mae_improvement_vs_climatology_pct']:+.1f}% | "
            f"{b['seasonal_naive']['mae']:.3f} | {b['persistence']['mae']:.3f} | {nw} | "
            f"{row['rmse']:.3f} | {row['poisson_deviance']:.3f} | {row['coverage_80']:.3f} |"
        )

    lines.extend(["", "## AC-5 Floor Checks", "| Floor | Status |", "|---|---|"])
    for k, ok in payload["floors"].items():
        lines.append(f"| `{k}` | {'PASS' if ok else 'FAIL'} |")

    lines.extend(
        [
            "",
            "## Golden Cases",
            "| ID | Split | Ward | Origin | h | Actual | Expected [P10, P90] | Tier (Act→Pred) | Pass |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
    )
    for c in payload["cases"]:
        lines.append(
            f"| {c['id']} | {c['split']} | {c['ward_id']} | {c['origin_week']} | {c['horizon']} | "
            f"{c['actual_cases']} | {c['expected_cases']:.2f} [{c['p10']:.1f}, {c['p90']:.1f}] | "
            f"{c['actual_tier']}→{c['pred_tier']} | {'PASS' if c['pass'] else 'FAIL'} |"
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Abhas forecast evaluation & hold-out lock runner.")
    ap.add_argument("--lock", action="store_true", help="Compute heldout_sha256 and write config.json.")
    ap.add_argument("--split", choices=["dev", "heldout", "all"], default="heldout")
    ap.add_argument("--tag", default="", help="Optional run tag (e.g. baseline).")
    args = ap.parse_args(argv)

    cfg = load_config()
    cases = load_forecast_cases()
    current_sha = compute_heldout_sha256(cases)
    heldout_count = sum(1 for c in cases if c.get("split") == "heldout")

    if args.lock:
        cfg["heldout_sha256"] = current_sha
        save_config(cfg)
        print(f"Locked {heldout_count} held-out cases in {CONFIG_PATH.name}: {current_sha}")
        return 0

    locked_sha = cfg.get("heldout_sha256")
    if args.split in ("heldout", "all") and locked_sha is not None and locked_sha != current_sha:
        print(
            f"FAIL: held-out cases changed after lock (locked={locked_sha[:12]}..., current={current_sha[:12]}...)",
            file=sys.stderr,
        )
        return TAMPER_EXIT_CODE

    df = load_raw_dataset()
    fit_year = 2018 if args.split == "dev" else 2023
    forecaster = load_forecaster(df, train_end_year=fit_year)
    if forecaster.is_baseline_fallback:
        print(
            f"Note: trained model artifact not found; scoring {forecaster.model_version} "
            "(clean hook ready for CORE's LightGBM artifact)."
        )

    selected = [c for c in cases if args.split == "all" or c.get("split") == args.split]
    golden_rows, golden_summary = evaluate_golden_cases(selected, df, forecaster)

    target_years = (2019, 2020, 2021, 2022, 2023) if args.split == "dev" else (2024, 2025)
    global_metrics = evaluate_global_holdout(df, forecaster, target_years, forecaster.climatology)

    floors, floors_passed = check_ac5_floors(global_metrics, golden_summary["pass_rate"], cfg)
    ts = datetime.now(UTC).isoformat(timespec="seconds")
    commit = git_commit()
    split_counts = Counter(c["split"] for c in selected)

    payload: dict[str, Any] = {
        "ts": ts,
        "commit": commit,
        "split": args.split,
        "tag": args.tag,
        "n": golden_summary["n"],
        "passed": golden_summary["passed"],
        "skipped": 0,
        "pass_rate": golden_summary["pass_rate"],
        "threshold": float(cfg.get("threshold", 0.80)),
        "generator_model": forecaster.model_version,
        "judge_model": "-",
        "prompt_versions": {},
        "cost_usd": 0.0,
        "heldout_sha256": current_sha,
        "split_counts": dict(split_counts),
        "p50_ms": golden_summary["p50_ms"],
        "p95_ms": golden_summary["p95_ms"],
        "by_tier": golden_summary["by_tier"],
        "floors": floors,
        "floors_passed": floors_passed,
        "metrics": {
            "pass_rate": golden_summary["pass_rate"],
            "global": global_metrics,
        },
        "cases": golden_rows,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    (RESULTS_DIR / f"latest-{args.split}.json").write_text(serialized, encoding="utf-8")
    (RESULTS_DIR / "eval.json").write_text(serialized, encoding="utf-8")
    if args.tag == "baseline":
        (RESULTS_DIR / "baseline.json").write_text(serialized, encoding="utf-8")

    history_entry = {
        "ts": ts,
        "commit": commit,
        "split": args.split,
        "tag": args.tag,
        "n": payload["n"],
        "skipped": 0,
        "pass_rate": payload["pass_rate"],
        "floors_passed": floors_passed,
        "generator_model": payload["generator_model"],
        "judge_model": "-",
        "cost_usd": 0.0,
        "mae_h2": global_metrics["by_horizon"]["h2"]["mae"],
        "mae_h3": global_metrics["by_horizon"]["h3"]["mae"],
        "mae_h4": global_metrics["by_horizon"]["h4"]["mae"],
        "coverage_80": global_metrics["coverage_80"],
        "within_one_tier": global_metrics["within_one_tier"],
        "critical_recall": global_metrics["critical_recall"],
        "p95_ward_ms": global_metrics["p95_ward_ms"],
    }
    with HISTORY_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(history_entry, ensure_ascii=False) + "\n")

    REPORT_PATH.write_text(render_report(payload), encoding="utf-8")

    print(
        f"eval[{args.split}] model={forecaster.model_version} "
        f"pass_rate={payload['pass_rate']:.4f} ({payload['passed']}/{payload['n']}) "
        f"h2_mae={global_metrics['by_horizon']['h2']['mae']:.3f} "
        f"h3_mae={global_metrics['by_horizon']['h3']['mae']:.3f} "
        f"cov80={global_metrics['coverage_80']:.3f} "
        f"floors_passed={floors_passed}"
    )

    if args.tag == "baseline" or args.split == "dev":
        return 0
    return 0 if (payload["pass_rate"] >= payload["threshold"] and floors_passed) else 1


if __name__ == "__main__":
    raise SystemExit(main())
