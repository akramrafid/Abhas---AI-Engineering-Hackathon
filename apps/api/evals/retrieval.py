"""Top-15 ward ranking evaluation on held-out in-season weeks (NFR-4 / gates.mjs retrieval).

Usage:
    python -m evals.retrieval
"""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from evals.scoring import ClimatologyBaseline, load_forecaster, load_raw_dataset

ROOT = Path(__file__).resolve().parent
RETRIEVAL_DATASET_PATH = ROOT / "datasets" / "retrieval.jsonl"
RESULTS_DIR = ROOT / "results"
RETRIEVAL_RESULT_PATH = RESULTS_DIR / "retrieval.json"

K = 15
MIN_QUERIES = 30
MIN_RECALL_AT_K = 0.55
RANKING_HORIZONS: tuple[int, ...] = (2, 3, 4)


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


def load_retrieval_queries(path: Path | None = None) -> list[dict[str, Any]]:
    ds_path = path or RETRIEVAL_DATASET_PATH
    queries: list[dict[str, Any]] = []
    for raw_line in ds_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line:
            queries.append(json.loads(line))
    return queries


def score_ranking(predicted_top_k: list[str], actual_top_k: list[str], k: int = K) -> tuple[float, float]:
    """Return (recall@k, reciprocal_rank_of_first_hit) for a single query."""
    relevant = set(actual_top_k[:k])
    top_pred = predicted_top_k[:k]
    recall = len(relevant & set(top_pred)) / max(k, 1)
    first_rank = next((i + 1 for i, ward_id in enumerate(top_pred) if ward_id in relevant), None)
    rr = (1.0 / first_rank) if first_rank is not None else 0.0
    return recall, rr


def main() -> int:
    queries = load_retrieval_queries()
    df = load_raw_dataset()
    wards = sorted(str(w) for w in df["ward_id"].unique())
    climatology = ClimatologyBaseline.fit(df, train_end_year=2023)
    forecaster = load_forecaster(df, train_end_year=2023)

    if forecaster.is_baseline_fallback:
        print(f"Note: trained model artifact not found; scoring retrieval with {forecaster.model_version}.")

    recalls: list[float] = []
    mrrs: list[float] = []
    clim_recalls: list[float] = []

    for q in queries:
        origin_week = date.fromisoformat(str(q["origin_week"]))
        actual_top_15: list[str] = list(q["top_15_wards"])

        pairs = [(w, origin_week, h) for w in wards for h in RANKING_HORIZONS]
        preds, _ = forecaster.predict_batch(df, pairs)
        clim_preds, _ = climatology.predict_batch(pairs)

        model_totals: dict[str, float] = {w: 0.0 for w in wards}
        clim_totals: dict[str, float] = {w: 0.0 for w in wards}
        for (w, _, _), mp, cp in zip(pairs, preds, clim_preds, strict=True):
            model_totals[w] += mp.expected_cases
            clim_totals[w] += cp.expected_cases

        pred_top_15 = [w for w, _ in sorted(model_totals.items(), key=lambda x: (-x[1], x[0]))[:K]]
        clim_top_15 = [w for w, _ in sorted(clim_totals.items(), key=lambda x: (-x[1], x[0]))[:K]]

        r_model, rr_model = score_ranking(pred_top_15, actual_top_15, k=K)
        r_clim, _ = score_ranking(clim_top_15, actual_top_15, k=K)
        recalls.append(r_model)
        mrrs.append(rr_model)
        clim_recalls.append(r_clim)

    n = len(queries)
    recall_at_k = round(sum(recalls) / max(n, 1), 4)
    mrr = round(sum(mrrs) / max(n, 1), 4)
    clim_recall_at_k = round(sum(clim_recalls) / max(n, 1), 4)
    beats_or_matches = recall_at_k >= clim_recall_at_k

    out: dict[str, Any] = {
        "k": K,
        "recall_at_k": recall_at_k,
        "mrr": mrr,
        "n_queries": n,
        "climatology_recall_at_k": clim_recall_at_k,
        "model_version": forecaster.model_version,
        "beats_or_matches_climatology": beats_or_matches,
        "commit": git_commit(),
        "ts": datetime.now(UTC).isoformat(timespec="seconds"),
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    RETRIEVAL_RESULT_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out))

    ok = n >= MIN_QUERIES and recall_at_k >= MIN_RECALL_AT_K and beats_or_matches
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
