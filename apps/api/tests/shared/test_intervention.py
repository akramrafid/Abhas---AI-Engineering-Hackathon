"""Unit and property-based tests for app.shared.intervention and greedy_crews (ADR-0011, ADR-0013; E1, T1-T3, G1-G3)."""

from __future__ import annotations

from datetime import date

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.runtime import get_forecast_model
from app.shared.features import FEATURE_COLUMNS
from app.shared.forecast_engine import ForecastEngine
from app.shared.intervention import (
    EFFICACY_PRESETS,
    MONOTONE_RAIN_FEATURES,
    apply_reduction,
    reduction,
    roi,
)
from app.shared.optimizer import greedy_crews
from ml.train import monotone_constraints_for_horizon


def test_alg_E1_efficacy_curve() -> None:
    """E1: Diminishing-returns efficacy curve matches documented values for c=0..3 across all presets."""
    expected: dict[str, list[float]] = {
        "low": [0.0, 0.0738, 0.1259, 0.1625],
        "base": [0.0, 0.1574, 0.2528, 0.3107],
        "high": [0.0, 0.2769, 0.4144, 0.4826],
    }
    for preset, exp_vals in expected.items():
        e_max, k = EFFICACY_PRESETS[preset]
        for c, exp in enumerate(exp_vals):
            assert reduction(c, e_max, k) == pytest.approx(exp, abs=1e-4)


def test_alg_T1_toy_counterfactual() -> None:
    """T1: Toy linear model cases = 2 + 0.05 * rain_sum_0_3 with 2 crews (base)."""
    row = {
        "rainfall_lag_0": 50.0,
        "rainfall_lag_1": 50.0,
        "rainfall_lag_2": 50.0,
        "rain_sum_0_3": 200.0,
        "rain_anomaly": 40.0,
        "temp_lag_0": 30.0,
    }
    e_max, k = EFFICACY_PRESETS["base"]
    frac = reduction(2, e_max, k)
    cf_row = apply_reduction(row, horizon=2, fraction=frac, rain_total=50.0)

    # Unconstrained feature untouched; constrained rain features scaled cleanly
    assert cf_row["temp_lag_0"] == pytest.approx(30.0)
    assert cf_row["rain_anomaly"] == pytest.approx(40.0 - frac * 50.0)

    baseline = 2.0 + 0.05 * row["rain_sum_0_3"]
    counterfactual = 2.0 + 0.05 * cf_row["rain_sum_0_3"]
    prevented = baseline - counterfactual
    assert baseline == pytest.approx(12.0)
    assert counterfactual == pytest.approx(9.4715, abs=1e-4)
    assert prevented == pytest.approx(2.5285, abs=1e-4)
    assert prevented * 0.298 == pytest.approx(0.7535, abs=1e-4)
    assert prevented * 2.385 == pytest.approx(6.0305, abs=1e-4)
    assert roi(prevented, 2) == pytest.approx(1.2642, abs=1e-4)


def test_alg_T2_toy_sensitivity_band() -> None:
    """T2: Same toy model across low and high efficacy presets."""
    row = {"rain_sum_0_3": 200.0, "rainfall_lag_0": 50.0, "rain_anomaly": 10.0}
    baseline = 2.0 + 0.05 * row["rain_sum_0_3"]

    low_em, low_k = EFFICACY_PRESETS["low"]
    hi_em, hi_k = EFFICACY_PRESETS["high"]
    cf_low = apply_reduction(row, horizon=3, fraction=reduction(2, low_em, low_k), rain_total=50.0)
    cf_high = apply_reduction(row, horizon=3, fraction=reduction(2, hi_em, hi_k), rain_total=50.0)

    prev_low = baseline - (2.0 + 0.05 * cf_low["rain_sum_0_3"])
    prev_high = baseline - (2.0 + 0.05 * cf_high["rain_sum_0_3"])
    assert prev_low == pytest.approx(1.2585, abs=1e-4)
    assert prev_high == pytest.approx(4.1437, abs=1e-4)


def test_alg_T3_real_model_monotone_all_wards_presets() -> None:
    """T3: Real LightGBM model satisfies counterfactual <= baseline for all 60 wards, h=2..4, and all presets."""
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=None,
    )
    origin = date(2024, 8, 5)
    wards = sorted(w.ward_id for w in repo.wards())
    assert len(wards) == 60

    scenarios: list[dict[str, float]] = [{}]
    for preset in ("low", "base", "high"):
        e_max, k = EFFICACY_PRESETS[preset]
        for crews in (1, 2, 5):
            frac = reduction(crews, e_max, k)
            scenarios.append({w: frac for w in wards})

    grid = engine.counterfactual_grid(wards, origin, (2, 3, 4), scenarios)
    base = grid[0]
    for cf_map in grid[1:]:
        for w in wards:
            for h in (2, 3, 4):
                assert cf_map[(w, h)].expected_cases <= base[(w, h)].expected_cases + 1e-9


def test_alg_G1_greedy_crews() -> None:
    """G1: Two wards B_A(c)=20*E(c), B_B(c)=10*E(c), base preset, 3 crews -> A=2, B=1, prevented=6.6308."""
    e_max, k = EFFICACY_PRESETS["base"]
    scale = {"A": 20.0, "B": 10.0}

    def marginal(w: str, c: int) -> float:
        return scale[w] * (reduction(c, e_max, k) - reduction(c - 1, e_max, k))

    res = greedy_crews(marginal, ["A", "B"], total_crews=3, cap=5)
    assert res.crews == {"A": 2, "B": 1}
    assert res.approximate is False
    total_prev = scale["A"] * reduction(2, e_max, k) + scale["B"] * reduction(1, e_max, k)
    assert total_prev == pytest.approx(6.6308, abs=1e-4)


def test_alg_G2_zero_crews() -> None:
    """G2: 0 crews returns all zeros with approximate=False."""
    res = greedy_crews(lambda _w, _c: 1.0, ["A", "B"], total_crews=0, cap=5)
    assert res.crews == {"A": 0, "B": 0}
    assert res.approximate is False


def test_alg_G3_ward_cap() -> None:
    """G3: Ward A capped at 2 with 4 crews -> A=2, B=2."""
    e_max, k = EFFICACY_PRESETS["base"]
    scale = {"A": 20.0, "B": 10.0}

    def marginal(w: str, c: int) -> float:
        return scale[w] * (reduction(c, e_max, k) - reduction(c - 1, e_max, k))

    res = greedy_crews(marginal, ["A", "B"], total_crews=4, cap=2)
    assert res.crews == {"A": 2, "B": 2}
    assert res.approximate is False


def test_greedy_crews_flags_non_concave_and_tiebreaks() -> None:
    """Non-increasing marginals set approximate=False; increasing marginal flags approximate=True; ties break by weight then ward_id."""
    non_concave = {"A": [1.0, 2.5, 0.5], "B": [0.8, 0.4, 0.2]}
    res_nc = greedy_crews(lambda w, c: non_concave[w][c - 1], ["A", "B"], total_crews=3, cap=3)
    assert res_nc.approximate is True
    assert sum(res_nc.crews.values()) == 3

    res_tie = greedy_crews(
        lambda _w, _c: 1.0,
        ["W2", "W1", "W3"],
        total_crews=2,
        cap=1,
        weights={"W1": 4.0, "W2": 4.0, "W3": 8.0},
    )
    assert res_tie.crews == {"W3": 1, "W1": 1, "W2": 0}


def test_monotone_rain_features_matches_ml_train_py() -> None:
    """MONOTONE_RAIN_FEATURES equals ml/train.py monotone_constraints_for_horizon for h = 2, 3, 4."""
    for h in (2, 3, 4):
        flags = monotone_constraints_for_horizon(h)
        expected = frozenset(col for col, flag in zip(FEATURE_COLUMNS, flags, strict=True) if flag == 1)
        assert MONOTONE_RAIN_FEATURES[h] == expected


@settings(max_examples=80, deadline=None)
@given(
    crews=st.integers(min_value=0, max_value=10),
    preset=st.sampled_from(["low", "base", "high"]),
    horizon=st.sampled_from([2, 3, 4]),
    rain0=st.floats(min_value=0.0, max_value=400.0, allow_nan=False, allow_infinity=False),
    rain1=st.floats(min_value=0.0, max_value=400.0, allow_nan=False, allow_infinity=False),
    rain2=st.floats(min_value=0.0, max_value=400.0, allow_nan=False, allow_infinity=False),
    rain3=st.floats(min_value=0.0, max_value=400.0, allow_nan=False, allow_infinity=False),
    temp0=st.floats(min_value=15.0, max_value=42.0, allow_nan=False, allow_infinity=False),
)
def test_prop_reduction_and_apply_reduction_invariants(
    crews: int,
    preset: str,
    horizon: int,
    rain0: float,
    rain1: float,
    rain2: float,
    rain3: float,
    temp0: float,
) -> None:
    """Reduction is concave in crews; apply_reduction never increases any feature and leaves non-monotone features untouched."""
    e_max, k = EFFICACY_PRESETS[preset]
    f0 = reduction(crews, e_max, k)
    f1 = reduction(crews + 1, e_max, k)
    f2 = reduction(crews + 2, e_max, k)
    assert 0.0 <= f0 < e_max
    assert f1 >= f0
    assert (f2 - f1) <= (f1 - f0) + 1e-12

    row = {
        "rainfall_lag_0": rain0,
        "rainfall_lag_1": rain1,
        "rainfall_lag_2": rain2,
        "rainfall_lag_3": rain3,
        "rain_sum_0_3": rain0 + rain1 + rain2 + rain3,
        "rain_anomaly": rain0 - 50.0,
        "temp_lag_0": temp0,
    }
    cf = apply_reduction(row, horizon=horizon, fraction=f0, rain_total=rain0)
    constrained = MONOTONE_RAIN_FEATURES[horizon]
    for feat, orig_val in row.items():
        if feat in constrained:
            assert cf[feat] <= orig_val + 1e-9
        else:
            assert cf[feat] == orig_val
