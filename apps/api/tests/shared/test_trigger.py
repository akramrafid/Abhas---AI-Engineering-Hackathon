"""Unit, property-based (Hypothesis), leakage, and hold-out reproduction tests for ADR-0020 trigger."""

from __future__ import annotations

import json
from datetime import date, timedelta

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.config import API_DIR
from app.shared.trigger import (
    DEFAULT_MAX_TRAIN_YEAR,
    episode_lead_times,
    evaluate_trigger,
    score_binary_alerts,
    select_best_trigger,
    trigger_alerts,
)
from ml.trigger import build_trigger_evaluation


def test_alg_TR1_contingency_peirce() -> None:
    """TR1: a=16, b=18, c=4, d=62 -> hit=0.80, FPR=0.225, FAR=0.5294, PSS=0.575."""
    alerts = np.array([True] * 16 + [True] * 18 + [False] * 4 + [False] * 62, dtype=bool)
    events = np.array([True] * 16 + [False] * 18 + [True] * 4 + [False] * 62, dtype=bool)
    sc = score_binary_alerts(alerts, events)
    assert (sc.tp, sc.fp, sc.fn, sc.tn) == (16, 18, 4, 62)
    assert sc.alerts == 34 and sc.high_weeks == 20 and sc.total_ward_weeks == 100
    assert sc.hit_rate == pytest.approx(0.8000, abs=1e-4)
    assert sc.false_alarm_rate == pytest.approx(0.2250, abs=1e-4)
    assert sc.false_alarm_ratio == pytest.approx(18 / 34, abs=1e-4)
    assert sc.peirce_skill_score == pytest.approx(0.5750, abs=1e-4)


def test_alg_TR2_rule_boundaries() -> None:
    """TR2: Strict `>` on rain_2w and inclusive `>=` on water_logging_risk_index."""
    rain = np.array([80.0, 80.1, 140.0], dtype=np.float64)
    wl = np.array([0.30, 0.30, 0.29], dtype=np.float64)
    out = trigger_alerts(rain, wl, r_mm=80.0, w_min=0.30)
    assert out.tolist() == [False, True, False]


def test_alg_TR3_lead_time_quartiles() -> None:
    """TR3: Five High waves with pre-onset alert leads [2, 3, 4, 5, 6] -> Q25=3.0, med=4.0, Q75=5.0."""
    start = date(2024, 1, 1)
    onset_offsets = [10, 30, 50, 70, 90]
    lead_targets = [2, 3, 4, 5, 6]
    alert_offsets = {o - lead for o, lead in zip(onset_offsets, lead_targets, strict=True)}
    onset_set = set(onset_offsets)

    weeks = [start + timedelta(days=7 * k) for k in range(100)]
    wards = ["DSCC_Ward_04"] * 100
    alerts = [k in alert_offsets for k in range(100)]
    highs = [k in onset_set for k in range(100)]

    stats = episode_lead_times(wards, weeks, alerts, highs, max_lookback_weeks=8, min_calm_weeks=4)
    assert stats.spells_covered == 5 and stats.total_spells == 5
    assert stats.q25 == pytest.approx(3.0, abs=1e-4)
    assert stats.median == pytest.approx(4.0, abs=1e-4)
    assert stats.q75 == pytest.approx(5.0, abs=1e-4)


def test_alg_TR4_zero_alerts_guard() -> None:
    """TR4: Zero alerts fired produces 0.0 FAR and 0.0 PSS with no NaN or ZeroDivisionError."""
    alerts = np.zeros(100, dtype=bool)
    events = np.array([True] * 5 + [False] * 95, dtype=bool)
    sc = score_binary_alerts(alerts, events)
    assert sc.alerts == 0
    assert sc.hit_rate == 0.0
    assert sc.false_alarm_rate == 0.0
    assert sc.false_alarm_ratio == 0.0
    assert sc.peirce_skill_score == 0.0


def test_leakage_guard_refuses_holdout_years() -> None:
    """Thresholds MUST be fitted strictly on 2016–2023; any 2024/2025 row raises ValueError."""
    rain = np.array([40.0, 90.0, 120.0], dtype=np.float64)
    wl = np.array([0.4, 0.5, 0.6], dtype=np.float64)
    ev = np.array([False, True, True], dtype=bool)
    years_with_leak = np.array([2022, 2023, 2024], dtype=np.int64)

    with pytest.raises(ValueError, match="Hold-out leakage guard"):
        select_best_trigger(
            rain,
            wl,
            ev,
            years_with_leak,
            r_grid=[60.0, 80.0],
            w_grid=[0.3, 0.4],
            max_train_year=DEFAULT_MAX_TRAIN_YEAR,
        )


def test_alg_TR5_holdout_metrics_reproduce_committed_json() -> None:
    """TR5: Live recomputation reproduces apps/api/evals/results/trigger.json hold-out numbers."""
    committed_path = API_DIR / "evals" / "results" / "trigger.json"
    assert committed_path.exists(), "Run npm run trigger first"
    committed = json.loads(committed_path.read_text(encoding="utf-8"))
    recomputed = build_trigger_evaluation()

    assert recomputed["rule"]["rain_2w_gt_mm"] == committed["rule"]["rain_2w_gt_mm"] == 80.0
    assert recomputed["rule"]["water_logging_gte"] == committed["rule"]["water_logging_gte"] == 0.3
    assert recomputed["rule"]["fit_years"] == [2016, 2023]
    assert recomputed["rule"]["holdout_years"] == [2024, 2025]

    for block in ("holdout_rule", "holdout_model"):
        for key in (
            "hit_rate",
            "false_alarm_ratio",
            "false_alarm_rate",
            "peirce_skill_score",
            "alerts",
            "high_weeks",
            "tp",
            "fp",
            "fn",
            "tn",
        ):
            assert recomputed[block][key] == committed[block][key], f"Mismatch in {block}.{key}"
        assert recomputed[block]["lead_time_weeks"] == committed[block]["lead_time_weeks"]

    # Reference magnitude check & Abhas beats rule on FAR and Peirce skill score
    assert committed["holdout_rule"]["hit_rate"] >= 0.90
    assert committed["holdout_rule"]["peirce_skill_score"] >= 0.70
    assert committed["holdout_model"]["false_alarm_ratio"] < committed["holdout_rule"]["false_alarm_ratio"]
    assert committed["holdout_model"]["peirce_skill_score"] > committed["holdout_rule"]["peirce_skill_score"]


@settings(max_examples=40)
@given(
    n=st.integers(min_value=5, max_value=60),
    r1=st.floats(min_value=0.0, max_value=150.0, allow_nan=False, allow_infinity=False),
    delta_r=st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
    w1=st.floats(min_value=0.0, max_value=0.7, allow_nan=False, allow_infinity=False),
    delta_w=st.floats(min_value=0.0, max_value=0.3, allow_nan=False, allow_infinity=False),
    seed=st.integers(min_value=0, max_value=10_000),
)
def test_property_trigger_bounds_monotone_and_permutation_invariant(
    n: int,
    r1: float,
    delta_r: float,
    w1: float,
    delta_w: float,
    seed: int,
) -> None:
    """Property: PSS in [-1, 1], alerts non-increasing in R and W, permutation-invariant."""
    rng = np.random.default_rng(seed)
    rain = rng.uniform(0.0, 220.0, size=n)
    wl = rng.uniform(0.0, 1.0, size=n)
    ev = rng.integers(0, 2, size=n).astype(bool)

    s1 = evaluate_trigger(rain, wl, ev, r_mm=r1, w_min=w1)
    s2 = evaluate_trigger(rain, wl, ev, r_mm=r1 + delta_r, w_min=w1 + delta_w)
    assert -1.0 <= s1.peirce_skill_score <= 1.0
    assert -1.0 <= s2.peirce_skill_score <= 1.0
    assert s2.alerts <= s1.alerts

    perm = rng.permutation(n)
    s_perm = evaluate_trigger(rain[perm], wl[perm], ev[perm], r_mm=r1, w_min=w1)
    assert s_perm == s1
