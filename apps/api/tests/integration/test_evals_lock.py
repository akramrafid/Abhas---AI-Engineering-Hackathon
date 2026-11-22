"""Integration tests for locked hold-out eval datasets, tamper detection, and ranking harness (AC-5, NFR-4)."""

from __future__ import annotations

import json
import re
import shutil
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.core.types import CITIES, TIERS, WARD_ID_PATTERN
from evals import retrieval as retrieval_mod
from evals import run as run_mod
from evals.scoring import poisson_deviance, tier_from_cases, tier_metrics

REQUIRED_FORECAST_KEYS = {
    "id",
    "split",
    "ward_id",
    "city",
    "origin_week",
    "horizon",
    "target_week",
    "actual_cases",
    "actual_tier",
    "ac_refs",
}
WARD_RE = re.compile(WARD_ID_PATTERN)
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")


def test_ac_5_forecast_dataset_stratification_and_schema() -> None:
    """AC-5: forecast.jsonl has >= 48 heldout + >= 30 dev cases with valid split, dates, and fixed tiers."""
    assert run_mod.FORECAST_DATASET_PATH.exists(), "apps/api/evals/datasets/forecast.jsonl missing"
    cases = run_mod.load_forecast_cases()

    dev = [c for c in cases if c.get("split") == "dev"]
    heldout = [c for c in cases if c.get("split") == "heldout"]
    other = [c for c in cases if c.get("split") not in ("dev", "heldout")]

    assert not other, f"Unexpected split values: {[c.get('split') for c in other]}"
    assert len(dev) >= 30, f"Expected >= 30 dev cases, got {len(dev)}"
    assert len(heldout) >= 48, f"Expected >= 48 heldout cases, got {len(heldout)}"
    assert len(heldout) == 48, f"Option A locks exact 48 heldout golden cases, got {len(heldout)}"

    seen_ids: set[str] = set()
    for c in cases:
        missing = REQUIRED_FORECAST_KEYS - set(c.keys())
        assert not missing, f"Case {c.get('id')} missing keys: {missing}"
        assert c["id"] not in seen_ids
        seen_ids.add(c["id"])

        assert WARD_RE.match(c["ward_id"]), f"Invalid ward_id {c['ward_id']}"
        assert c["city"] in CITIES
        assert c["horizon"] in (2, 3, 4)

        origin = date.fromisoformat(c["origin_week"])
        target = date.fromisoformat(c["target_week"])
        assert origin.weekday() == 0, f"origin_week {origin} must be Monday"
        assert target.weekday() == 0, f"target_week {target} must be Monday"
        assert origin >= date(2016, 2, 29), f"origin_week {origin} lacks 0-8 week lags"
        assert target == origin + timedelta(weeks=int(c["horizon"]))

        if c["split"] == "dev":
            assert 2019 <= target.year <= 2023, f"dev target_week {target} outside 2019-2023"
        else:
            assert target.year in (2024, 2025), f"heldout target_week {target} outside 2024-2025"

        actual = int(c["actual_cases"])
        assert actual >= 0
        assert c["actual_tier"] == tier_from_cases(actual), (
            f"Case {c['id']}: actual_cases={actual} should map to {tier_from_cases(actual)}, got {c['actual_tier']}"
        )
        assert "AC-5" in c["ac_refs"]

    # Stratification across all 4 tiers in both splits, all 5 cities, and all 22 Critical weeks in heldout.
    assert set(TIERS) == {c["actual_tier"] for c in dev}
    assert set(TIERS) == {c["actual_tier"] for c in heldout}
    assert set(CITIES) == {c["city"] for c in heldout}
    heldout_crit_weeks = {c["target_week"] for c in heldout if c["actual_tier"] == "Critical"}
    assert len(heldout_crit_weeks) == 22, (
        f"Expected all 22 distinct 2024-2025 Critical target weeks covered, got {len(heldout_crit_weeks)}"
    )


def test_nfr_4_retrieval_dataset_schema_and_count() -> None:
    """NFR-4: retrieval.jsonl has >= 30 held-out in-season (Jun-Sep 2024 & 2025) top-15 queries."""
    assert retrieval_mod.RETRIEVAL_DATASET_PATH.exists(), "apps/api/evals/datasets/retrieval.jsonl missing"
    queries = retrieval_mod.load_retrieval_queries()
    assert len(queries) >= 30, f"Expected >= 30 retrieval queries, got {len(queries)}"

    seen_weeks: set[str] = set()
    years_seen: set[int] = set()
    for q in queries:
        assert q["split"] == "heldout"
        ow = date.fromisoformat(q["origin_week"])
        assert ow.weekday() == 0, f"origin_week {ow} must be Monday"
        assert ow.year in (2024, 2025)
        assert ow.month in (6, 7, 8, 9), f"query {ow} not in monsoon season (Jun-Sep)"
        assert q["origin_week"] not in seen_weeks
        seen_weeks.add(q["origin_week"])
        years_seen.add(ow.year)

        top15 = q["top_15_wards"]
        assert isinstance(top15, list) and len(top15) == 15
        assert len(set(top15)) == 15
        assert all(WARD_RE.match(w) for w in top15)

    assert years_seen == {2024, 2025}


def test_ac_5_config_lock_sha256_matches(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-5: config.json stores fixed cut-offs and heldout_sha256 matching python -m evals.run --lock."""
    cfg = run_mod.load_config()
    assert cfg["tier_cutoffs"] == {"Medium": 3, "High": 8, "Critical": 14}
    locked = cfg.get("heldout_sha256")
    assert isinstance(locked, str) and HEX64_RE.match(locked), (
        "heldout_sha256 must be locked (npm run eval:lock)"
    )

    cases = run_mod.load_forecast_cases()
    expected = run_mod.compute_heldout_sha256(cases)
    assert locked == expected, "config.json heldout_sha256 does not match forecast.jsonl"

    # Re-running --lock against a temp config produces the exact same digest.
    tmp_cfg = tmp_path / "config.json"
    shutil.copyfile(run_mod.CONFIG_PATH, tmp_cfg)
    raw = json.loads(tmp_cfg.read_text(encoding="utf-8"))
    raw["heldout_sha256"] = None
    tmp_cfg.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)
    rc = run_mod.main(["--lock"])
    assert rc == 0
    relocked = json.loads(tmp_cfg.read_text(encoding="utf-8"))["heldout_sha256"]
    assert relocked == locked


def test_ac_5_tampered_heldout_exits_with_code_3(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """AC-5: tampering with any held-out line causes evals.run --split heldout to exit with code 3."""
    orig_ds = run_mod.FORECAST_DATASET_PATH
    tmp_cfg = tmp_path / "config.json"
    tmp_ds = tmp_path / "forecast.jsonl"
    shutil.copyfile(run_mod.CONFIG_PATH, tmp_cfg)
    shutil.copyfile(orig_ds, tmp_ds)

    # Mutate a single held-out case's actual_cases.
    lines = [json.loads(line) for line in tmp_ds.read_text(encoding="utf-8").splitlines() if line.strip()]
    for row in lines:
        if row["split"] == "heldout":
            row["actual_cases"] = int(row["actual_cases"]) + 1
            break
    tmp_ds.write_text("\n".join(json.dumps(r) for r in lines) + "\n", encoding="utf-8")

    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)
    monkeypatch.setattr(run_mod, "FORECAST_DATASET_PATH", tmp_ds)

    rc = run_mod.main(["--split", "heldout"])
    captured = capsys.readouterr()
    assert rc == 3, f"Expected exit code 3 on tampered heldout set, got {rc}"
    assert "changed after lock" in captured.err.lower()

    # Also verify deleting a heldout row triggers exit code 3.
    shutil.copyfile(orig_ds, tmp_ds)
    raw_lines = [json.loads(line) for line in tmp_ds.read_text(encoding="utf-8").splitlines() if line.strip()]
    removed_one = False
    kept = []
    for row in raw_lines:
        if not removed_one and row["split"] == "heldout":
            removed_one = True
            continue
        kept.append(row)
    tmp_ds.write_text("\n".join(json.dumps(r) for r in kept) + "\n", encoding="utf-8")
    assert run_mod.main(["--split", "heldout"]) == 3


def test_ac_5_and_nfr_4_results_artifacts_match_gate_schemas() -> None:
    """AC-5 & NFR-4: baseline.json, eval.json, and retrieval.json satisfy gates.mjs schemas."""
    baseline_path = run_mod.RESULTS_DIR / "baseline.json"
    eval_path = run_mod.RESULTS_DIR / "eval.json"
    retrieval_path = retrieval_mod.RETRIEVAL_RESULT_PATH

    assert baseline_path.exists(), "baseline.json missing (run npm run eval:baseline)"
    assert eval_path.exists(), "eval.json missing"
    assert retrieval_path.exists(), "retrieval.json missing (run npm run eval:retrieval)"

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    for key in (
        "commit",
        "prompt_versions",
        "metrics",
        "pass_rate",
        "n",
        "skipped",
        "generator_model",
        "judge_model",
        "cost_usd",
        "ts",
        "split",
    ):
        assert key in baseline, f"baseline.json missing required key {key}"
    assert baseline["judge_model"] == "-"
    assert baseline["cost_usd"] == 0.0
    assert baseline["skipped"] == 0

    ret = json.loads(retrieval_path.read_text(encoding="utf-8"))
    for key in ("k", "recall_at_k", "mrr", "n_queries", "climatology_recall_at_k", "model_version"):
        assert key in ret, f"retrieval.json missing required key {key}"
    assert ret["k"] == 15
    assert ret["n_queries"] >= 30
    assert ret["recall_at_k"] >= 0.55


def test_ac_5_dev_edit_does_not_invalidate_heldout_hash() -> None:
    """AC-5: modifying dev split cases never alters heldout_sha256."""
    cases = run_mod.load_forecast_cases()
    orig = run_mod.compute_heldout_sha256(cases)
    mutated = [dict(c) for c in cases]
    for c in mutated:
        if c["split"] == "dev":
            c["actual_cases"] = int(c["actual_cases"]) + 5
            break
    assert run_mod.compute_heldout_sha256(mutated) == orig


def test_ac_5_scoring_helpers_and_ranking_metrics() -> None:
    """Unit checks on fixed tier cut-offs, Poisson deviance, confusion metrics, and recall@15/MRR."""
    assert tier_from_cases(0) == "Low"
    assert tier_from_cases(2.99) == "Low"
    assert tier_from_cases(3) == "Medium"
    assert tier_from_cases(7.99) == "Medium"
    assert tier_from_cases(8) == "High"
    assert tier_from_cases(13.99) == "High"
    assert tier_from_cases(14) == "Critical"
    assert tier_from_cases(41) == "Critical"

    assert poisson_deviance([0, 5, 14], [0.000001, 5.0, 14.0]) == pytest.approx(0.0, abs=1e-4)
    assert poisson_deviance([10], [2]) > poisson_deviance([10], [8])

    tm = tier_metrics([1, 5, 10, 16, 20], ["Low", "Medium", "High", "High", "Low"])
    assert tm["labels"] == ["Low", "Medium", "High", "Critical"]
    assert tm["within_one_tier"] == pytest.approx(4 / 5)
    assert tm["critical_recall"] == pytest.approx(1 / 2)
    assert tm["critical_n"] == 2

    rec, rr = retrieval_mod.score_ranking(["W1", "W2", "W3"], ["W2", "W3", "W4"], k=3)
    assert rec == pytest.approx(2 / 3)
    assert rr == pytest.approx(0.5)
