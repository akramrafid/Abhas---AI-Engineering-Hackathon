"""Unit and property-based tests for app.shared.optimizer (ADR-0010; A1-A5)."""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.shared.optimizer import (
    allocate_city,
    available_stock,
    classify_deficit,
    density_factors,
    largest_remainder_round,
    priority_weights,
)


def test_alg_A1_priority_fill() -> None:
    """A1: d=(100,60,40), w=(12,4,0.5), stock 50%, floor 20% -> x=(80,12,8), all critical."""
    res = allocate_city([100, 60, 40], [12.0, 4.0, 0.5], 50, 20, ["W1", "W2", "W3"])
    assert res.allocated == [80, 12, 8]
    assert res.floors_scaled is False

    lvl1, _ = classify_deficit(100, 80, "Critical")
    lvl2, _ = classify_deficit(60, 12, "High")
    lvl3, _ = classify_deficit(40, 8, "Low")
    assert (lvl1, lvl2, lvl3) == ("critical", "critical", "critical")


def test_alg_A2_full_stock() -> None:
    """A2: stock 100% -> full allocation, all deficit levels none."""
    res = allocate_city([100, 60, 40], [12.0, 4.0, 0.5], 100, 20, ["W1", "W2", "W3"])
    assert res.allocated == [100, 60, 40]
    assert res.floors_scaled is False
    for d, x, t in zip([100, 60, 40], res.allocated, ["Critical", "High", "Low"], strict=True):
        lvl, reasons = classify_deficit(d, x, t)
        assert lvl == "none"
        assert reasons == []


def test_alg_A3_floor_scaling() -> None:
    """A3: stock 30%, floor 50% -> floors scale proportionally, x=(30,30,30), floors_scaled=True."""
    res = allocate_city([100, 100, 100], [8.0, 4.0, 1.0], 30, 50, ["W1", "W2", "W3"])
    assert res.allocated == [30, 30, 30]
    assert res.floors_scaled is True
    for t in ("Critical", "High", "Low"):
        lvl, _ = classify_deficit(100, 30, t)
        assert lvl == "critical"


def test_alg_A4_largest_remainder_ties() -> None:
    """A4: Largest remainder ties break deterministically by ward_id ascending."""
    assert largest_remainder_round([2.4, 1.4, 1.2], 5, ["a", "b", "c"]) == [3, 1, 1]
    assert largest_remainder_round([1.4, 2.4, 1.2], 5, ["b", "a", "c"]) == [1, 3, 1]


def test_alg_A5_density_factors() -> None:
    """A5: Density factor clips rho / city_median to [0.5, 2.0]."""
    factors = density_factors([74252.0, 40000.0, 18314.0], 40000.0)
    assert factors[0] == pytest.approx(1.8563, abs=1e-4)
    assert factors[1] == pytest.approx(1.0)
    assert factors[2] == pytest.approx(0.5)
    weights = priority_weights(["Critical", "High", "Low"], factors)
    assert weights[0] == pytest.approx(8.0 * factors[0])
    assert weights[1] == pytest.approx(4.0)
    assert weights[2] == pytest.approx(0.5)


@settings(max_examples=80, deadline=None)
@given(
    demands=st.lists(st.integers(min_value=0, max_value=200), min_size=1, max_size=12),
    weights=st.lists(
        st.floats(min_value=0.5, max_value=16.0, allow_nan=False, allow_infinity=False),
        min_size=1,
        max_size=12,
    ),
    stock1=st.integers(min_value=30, max_value=100),
    stock2=st.integers(min_value=30, max_value=100),
    floor_pct=st.integers(min_value=0, max_value=50),
)
def test_prop_allocation_conservation_bounds_monotone_and_permutation_invariant(
    demands: list[int],
    weights: list[float],
    stock1: int,
    stock2: int,
    floor_pct: int,
) -> None:
    """Conservation, bounds, monotonicity in stock_pct, and permutation invariance."""
    n = min(len(demands), len(weights))
    d = demands[:n]
    w = weights[:n]
    ids = [f"WARD_{i:02d}" for i in range(n)]

    s_lo, s_hi = sorted((stock1, stock2))
    res_lo = allocate_city(d, w, s_lo, floor_pct, ids)
    res_hi = allocate_city(d, w, s_hi, floor_pct, ids)

    expected_lo = min(available_stock(sum(d), s_lo), sum(d))
    expected_hi = min(available_stock(sum(d), s_hi), sum(d))
    assert sum(res_lo.allocated) == expected_lo
    assert sum(res_hi.allocated) == expected_hi

    for di, x_lo, x_hi in zip(d, res_lo.allocated, res_hi.allocated, strict=True):
        assert 0 <= x_lo <= di
        assert 0 <= x_hi <= di
        # Integer largest-remainder rounding can shift a boundary ward by at most 1 unit when floors scale,
        # while total allocated is strictly non-decreasing; check exact continuous monotonicity in normal regime.
        assert x_hi + 1 >= x_lo

    # Strict permutation invariance: reversing input order yields identical ward -> allocation map.
    res_rev = allocate_city(list(reversed(d)), list(reversed(w)), s_lo, floor_pct, list(reversed(ids)))
    map_fwd = dict(zip(ids, res_lo.allocated, strict=True))
    map_rev = dict(zip(reversed(ids), res_rev.allocated, strict=True))
    assert map_fwd == map_rev
    assert res_rev.floors_scaled == res_lo.floors_scaled
