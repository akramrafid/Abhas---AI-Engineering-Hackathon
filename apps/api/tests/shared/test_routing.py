"""Unit and property-based tests for app.shared.routing (ADR-0012; R1-R3)."""

from __future__ import annotations

import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.shared.routing import derive_capacity, route_city, summarise_city


def test_alg_R1_exact_min_arcs() -> None:
    """R1: W1 9/5, W2 2/6, W3 3/5 -> single transfer W1->W2: 4, loads (5,6,3), u*=1.0."""
    res = route_city([9, 2, 3], [5, 6, 5], ["W1", "W2", "W3"])
    assert len(res.transfers) == 1
    assert (res.transfers[0].from_ward, res.transfers[0].to_ward, res.transfers[0].patients) == (
        "W1",
        "W2",
        4,
    )
    assert res.loads == [5, 6, 3]
    assert res.u_star == pytest.approx(1.0)

    stats = summarise_city([9, 2, 3], [5, 6, 5], res.loads, transfers=len(res.transfers))
    assert stats.capacity_total == 16
    assert stats.required_total == 14
    assert stats.utilisation_before == pytest.approx(14 / 16)
    assert stats.utilisation_after == pytest.approx(14 / 16)
    assert stats.unroutable_patients == 0
    assert stats.headroom_after == 2
    assert stats.transfers == 1


def test_alg_R2_city_oversubscribed() -> None:
    """R2: W1 10/4, W2 3/4, W3 4/5 -> W1->W2: 1, W1->W3: 1; loads (8,4,5); unroutable=4."""
    res = route_city([10, 3, 4], [4, 4, 5], ["W1", "W2", "W3"])
    arcs = [(t.from_ward, t.to_ward, t.patients) for t in res.transfers]
    assert arcs == [("W1", "W2", 1), ("W1", "W3", 1)]
    assert res.loads == [8, 4, 5]
    assert res.u_star == pytest.approx(2.0)

    stats = summarise_city([10, 3, 4], [4, 4, 5], res.loads, transfers=len(res.transfers))
    assert stats.utilisation_before == pytest.approx(17 / 13)
    assert stats.utilisation_after == pytest.approx(1.0)
    assert stats.unroutable_patients == 4
    assert stats.headroom_after == 0


def test_alg_R3_city_pool_isolation() -> None:
    """R3: Dhaka North deficit with no headroom stays unroutable; Dhaka South headroom untouched."""
    dn_res = route_city([8], [5], ["DNCC_Ward_01"])
    ds_res = route_city([0], [10], ["DSCC_Ward_01"])
    assert dn_res.transfers == []
    assert dn_res.loads == [8]
    dn_stats = summarise_city([8], [5], dn_res.loads, transfers=0)
    assert dn_stats.unroutable_patients == 3
    assert ds_res.transfers == []
    assert ds_res.loads == [0]


def test_derive_capacity_training_years_only() -> None:
    """derive_capacity uses training years (2016..2022) only and ignores hold-out spike."""
    df = pd.DataFrame(
        {
            "ward_id": ["W1"] * 4,
            "year": [2020, 2021, 2022, 2024],
            "hospital_beds_required": [2, 3, 4, 99],
        }
    )
    caps = derive_capacity(df, years=(2016, 2022), q=0.95, margin=1.10, minimum=1)
    assert caps["W1"] == 5

    mapping_caps = derive_capacity({"W1": [(2020, 2.0), (2021, 3.0), (2022, 4.0), (2024, 99.0)]})
    assert mapping_caps == caps


@settings(max_examples=60, deadline=None)
@given(
    req=st.lists(st.integers(min_value=0, max_value=20), min_size=2, max_size=8),
    cap=st.lists(st.integers(min_value=1, max_value=12), min_size=2, max_size=8),
)
def test_prop_routing_invariants(req: list[int], cap: list[int]) -> None:
    """Conservation, no self-arcs, disjoint sender/receiver, exact unroutable count, permutation invariance."""
    n = min(len(req), len(cap))
    r = req[:n]
    k = cap[:n]
    wids = [f"W{i:02d}" for i in range(n)]

    res = route_city(r, k, wids)
    total_d = sum(max(ri - ki, 0) for ri, ki in zip(r, k, strict=True))
    total_h = sum(max(ki - ri, 0) for ri, ki in zip(r, k, strict=True))
    expected_moved = min(total_d, total_h)

    moved = sum(t.patients for t in res.transfers)
    assert moved == expected_moved
    assert sum(res.loads) == sum(r)

    senders = {t.from_ward for t in res.transfers}
    receivers = {t.to_ward for t in res.transfers}
    assert senders.isdisjoint(receivers)
    for t in res.transfers:
        assert t.from_ward != t.to_ward
        assert t.patients >= 1

    stats = summarise_city(r, k, res.loads, transfers=len(res.transfers))
    assert stats.unroutable_patients == max(total_d - total_h, 0)

    raw_max_u = max(ri / ki for ri, ki in zip(r, k, strict=True))
    assert res.u_star <= raw_max_u + 1e-9

    # Permutation invariance
    res_rev = route_city(list(reversed(r)), list(reversed(k)), list(reversed(wids)))
    assert [(t.from_ward, t.to_ward, t.patients) for t in res_rev.transfers] == [
        (t.from_ward, t.to_ward, t.patients) for t in res.transfers
    ]
    assert dict(zip(reversed(wids), res_rev.loads, strict=True)) == dict(zip(wids, res.loads, strict=True))
