"""Unit and property-based tests for app.shared.supply (ADR-0009; S0-S4)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.ports.supply import SupplyRatios
from app.shared.supply import (
    DATASET_SUPPLY_CONSTANTS,
    fit_ratios,
    peak_week_case_quantile,
    round_half_up,
    single_week_case_quantile,
    supply_for_cases,
    verify_constants,
    window_case_quantile,
)

REPO_ROOT = Path(__file__).resolve().parents[4]
ONSITE_CSV = REPO_ROOT / "data" / "raw" / "bangladesh_dengue_large_dataset_onsite.csv"

CANONICAL_RATIOS = SupplyRatios(
    saline_bags=DATASET_SUPPLY_CONSTANTS["saline_bags"],
    diagnostic_kits=DATASET_SUPPLY_CONSTANTS["diagnostic_kits"],
    hospital_beds=DATASET_SUPPLY_CONSTANTS["hospital_beds"],
    dataset_sha256="24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0",
)


def test_alg_S0_dataset_exact_rule() -> None:
    """S0: round_half_up(c * k) matches exact documented values and 100% of onsite rows."""
    expected: dict[int, tuple[int, int, int]] = {
        0: (0, 0, 0),
        1: (2, 1, 0),
        2: (5, 2, 1),
        5: (12, 6, 1),
        10: (24, 12, 3),
        15: (36, 17, 4),
        20: (48, 23, 6),
    }
    for k, (exp_s, exp_k, exp_b) in expected.items():
        got = supply_for_cases(k, CANONICAL_RATIOS)
        assert (got["saline_bags"], got["diagnostic_kits"], got["hospital_beds"]) == (
            exp_s,
            exp_k,
            exp_b,
        )

    assert round_half_up(2.5) == 3
    assert round_half_up(3.5) == 4

    if ONSITE_CSV.is_file():
        df = pd.read_csv(ONSITE_CSV)
        matches = verify_constants(df, CANONICAL_RATIOS)
        assert matches == {"saline_bags": 1.0, "diagnostic_kits": 1.0, "hospital_beds": 1.0}
        fitted = fit_ratios(df, years=(2016, 2022), dataset_sha256=CANONICAL_RATIOS.dataset_sha256)
        assert fitted.saline_bags == pytest.approx(2.385)
        assert fitted.diagnostic_kits == pytest.approx(1.164)
        assert fitted.hospital_beds == pytest.approx(0.298)
        assert all(v == 1.0 for v in fitted.row_match.values())


def test_alg_S1_single_week_nb() -> None:
    """S1: One week mu=10, r=2 -> Q0.8=15, Q0.9=20; saline=36, kits=17, beds=6."""
    q80 = window_case_quantile([10.0], [2.0], 0.8)
    q90 = window_case_quantile([10.0], [2.0], 0.9)
    assert q80 == 15
    assert q90 == 20
    sup80 = supply_for_cases(q80, CANONICAL_RATIOS)
    sup90 = supply_for_cases(q90, CANONICAL_RATIOS)
    assert sup80["saline_bags"] == 36
    assert sup80["diagnostic_kits"] == 17
    assert sup90["hospital_beds"] == 6


def test_alg_S2_window_nb() -> None:
    """S2: Window h=2..4, mu=(4, 6, 8), r=3 -> Q0.8=24, Q0.9=28; saline=57, kits=28, beds=8."""
    q80 = window_case_quantile([4.0, 6.0, 8.0], [3.0, 3.0, 3.0], 0.8)
    q90 = window_case_quantile([4.0, 6.0, 8.0], [3.0, 3.0, 3.0], 0.9)
    assert q80 == 24
    assert q90 == 28
    sup80 = supply_for_cases(q80, CANONICAL_RATIOS)
    sup90 = supply_for_cases(q90, CANONICAL_RATIOS)
    assert sup80["saline_bags"] == 57
    assert sup80["diagnostic_kits"] == 28
    assert sup90["hospital_beds"] == 8


def test_alg_S3_poisson_fallback() -> None:
    """S3: Window mu=(2, 3), huge r -> Poisson(5), Q0.8=7; saline=17, kits=8."""
    q80 = window_case_quantile([2.0, 3.0], [1e12, 1e12], 0.8)
    assert q80 == 7
    sup80 = supply_for_cases(q80, CANONICAL_RATIOS)
    assert sup80["saline_bags"] == 17
    assert sup80["diagnostic_kits"] == 8


def test_alg_S4_zero_means() -> None:
    """S4: All mu=0 -> Q=0 and every supply 0 without division by zero."""
    q80 = window_case_quantile([0.0, 0.0, 0.0], [3.0, 3.0, 3.0], 0.8)
    assert q80 == 0
    assert supply_for_cases(q80, CANONICAL_RATIOS) == {
        "saline_bags": 0,
        "diagnostic_kits": 0,
        "hospital_beds": 0,
    }


@settings(max_examples=80, deadline=None)
@given(
    means=st.lists(
        st.floats(min_value=0.0, max_value=120.0, allow_nan=False, allow_infinity=False),
        min_size=1,
        max_size=4,
    ),
    r_val=st.floats(min_value=0.5, max_value=50.0, allow_nan=False, allow_infinity=False),
    q1=st.floats(min_value=0.5, max_value=0.95, allow_nan=False, allow_infinity=False),
    delta_q=st.floats(min_value=0.0, max_value=0.04, allow_nan=False, allow_infinity=False),
    delta_mu=st.floats(min_value=0.0, max_value=25.0, allow_nan=False, allow_infinity=False),
)
def test_prop_quantile_and_supply_monotone(
    means: list[float],
    r_val: float,
    q1: float,
    delta_q: float,
    delta_mu: float,
) -> None:
    """Q_s is non-decreasing in s and in every mu_h; supplies are non-decreasing in Q."""
    nb_r = [r_val] * len(means)
    q2 = min(0.99, q1 + delta_q)
    val1 = window_case_quantile(means, nb_r, q1)
    val2 = window_case_quantile(means, nb_r, q2)
    assert val2 >= val1

    bumped = list(means)
    bumped[0] += delta_mu
    val_bumped = window_case_quantile(bumped, nb_r, q1)
    assert val_bumped >= val1

    sup1 = supply_for_cases(val1, CANONICAL_RATIOS)
    sup2 = supply_for_cases(val2, CANONICAL_RATIOS)
    for k in ("saline_bags", "diagnostic_kits", "hospital_beds"):
        assert sup2[k] >= sup1[k] >= 0

    # Peak-week quantile is non-decreasing in q and in every mu_h, and never exceeds window total
    pk1 = peak_week_case_quantile(means, nb_r, q1)
    pk2 = peak_week_case_quantile(means, nb_r, q2)
    assert pk2 >= pk1 >= 0
    assert pk1 <= val1
    pk_bumped = peak_week_case_quantile(bumped, nb_r, q1)
    assert pk_bumped >= pk1
    assert peak_week_case_quantile([means[0]], [r_val], q1) == single_week_case_quantile(means[0], r_val, q1)
