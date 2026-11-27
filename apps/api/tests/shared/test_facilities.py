"""Unit, property-based (Hypothesis), and red-team sanitisation tests for ADR-0018 facilities."""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.shared.facilities import (
    HospitalCandidate,
    build_tel_href,
    has_unsafe_control_chars,
    haversine_km,
    rank_hospitals,
    sanitize_phone,
    straight_line_eta_minutes,
)


def _three_north_hospitals(
    c1: tuple[str, int, float],
    c2: tuple[str, int, float],
    c3: tuple[str, int, float],
) -> list[HospitalCandidate]:
    return [
        HospitalCandidate(id="H1", city=c1[0], lat=23.7590, lon=90.3900, free_beds=c1[1], age_hours=c1[2]),
        HospitalCandidate(id="H2", city=c2[0], lat=23.7770, lon=90.3900, free_beds=c2[1], age_hours=c2[2]),
        HospitalCandidate(id="H3", city=c3[0], lat=23.7950, lon=90.3900, free_beds=c3[1], age_hours=c3[2]),
    ]


def test_alg_F1_fresh_available_beats_closer_full_and_stale() -> None:
    """F1: Tier 1 (fresh free>=1 & age<=6h) ranks #1 ahead of closer stale (Tier 2) & full (Tier 3)."""
    hospitals = _three_north_hospitals(
        ("Dhaka South", 0, 1.0),
        ("Dhaka South", 4, 9.0),
        ("Dhaka South", 2, 2.0),
    )
    ranked = rank_hospitals(hospitals, user_lat=23.7500, user_lon=90.3900, user_city="Dhaka South")
    assert [r.id for r in ranked] == ["H3", "H2", "H1"]
    assert [r.rank_tier for r in ranked] == [1, 2, 3]
    assert ranked[0].is_stale is False and ranked[0].distance_km == pytest.approx(5.004, abs=0.02)
    assert ranked[0].eta_minutes == 22
    assert ranked[1].is_stale is True and ranked[1].distance_km == pytest.approx(3.002, abs=0.02)
    assert ranked[1].eta_minutes == 16
    assert ranked[2].distance_km == pytest.approx(1.001, abs=0.02)
    assert ranked[2].eta_minutes == 9


def test_alg_F2_no_fresh_beds_nearest_stale_flagged_wins() -> None:
    """F2: No Tier 1 hospital -> nearest Tier 2 (free>=1, stale flagged) beats closer full."""
    hospitals = _three_north_hospitals(
        ("Dhaka South", 0, 0.5),
        ("Dhaka South", 3, 8.0),
        ("Dhaka South", 6, 7.0),
    )
    ranked = rank_hospitals(hospitals, user_lat=23.7500, user_lon=90.3900, user_city="Dhaka South")
    assert [r.id for r in ranked] == ["H2", "H3", "H1"]
    assert [r.rank_tier for r in ranked] == [2, 2, 3]
    assert ranked[0].is_stale is True and ranked[1].is_stale is True


def test_alg_F3_all_full_prefers_same_city_and_6h_boundary() -> None:
    """F3: All full -> nearest same-city alternative first; age == 6.0h is fresh, 6.01h is stale."""
    hospitals = _three_north_hospitals(
        ("Dhaka North", 0, 1.0),
        ("Dhaka South", 0, 1.0),
        ("Dhaka South", 0, 2.0),
    )
    ranked = rank_hospitals(hospitals, user_lat=23.7500, user_lon=90.3900, user_city="Dhaka South")
    assert [r.id for r in ranked] == ["H2", "H3", "H1"]
    assert all(r.rank_tier == 3 for r in ranked)

    # Exact 6.0 h boundary check
    boundary = [
        HospitalCandidate(id="A", city="Dhaka South", lat=23.76, lon=90.39, free_beds=1, age_hours=6.01),
        HospitalCandidate(id="B", city="Dhaka South", lat=23.79, lon=90.39, free_beds=1, age_hours=6.00),
    ]
    b_ranked = rank_hospitals(boundary, user_lat=23.75, user_lon=90.39, user_city="Dhaka South")
    assert [r.id for r in b_ranked] == ["B", "A"]
    assert b_ranked[0].rank_tier == 1 and b_ranked[0].is_stale is False
    assert b_ranked[1].rank_tier == 2 and b_ranked[1].is_stale is True


def test_redteam_phone_and_tel_href_sanitisation() -> None:
    """Red-team: reject javascript:, CRLF, HTML tags, extra schemes, and non-phone strings."""
    assert sanitize_phone("+880 2-55165088") == "+880 2-55165088"
    assert build_tel_href("+880 2-55165088") == "tel:+880255165088"
    assert build_tel_href("01711-000111") == "tel:01711000111"

    for bad in (
        "javascript:alert(1)",
        "tel:999;evil",
        "01711\r\nBcc:evil",
        "<script>alert(1)</script>",
        "12",
        "+88012345678901234567890",
        "call-me-maybe",
        "",
        None,
    ):
        assert sanitize_phone(bad) is None, f"Should reject {bad!r}"
        assert build_tel_href(bad) is None, f"Should not produce tel: href for {bad!r}"

    assert has_unsafe_control_chars("normal note") is False
    assert has_unsafe_control_chars("bad\x00note") is True
    assert has_unsafe_control_chars("bidi\u202eoverride") is True


@settings(max_examples=50)
@given(
    user_lat=st.floats(min_value=22.0, max_value=24.5, allow_nan=False, allow_infinity=False),
    user_lon=st.floats(min_value=90.0, max_value=92.0, allow_nan=False, allow_infinity=False),
    items=st.lists(
        st.tuples(
            st.sampled_from(["Dhaka South", "Dhaka North", "Chattogram"]),
            st.floats(min_value=22.0, max_value=24.5, allow_nan=False, allow_infinity=False),
            st.floats(min_value=90.0, max_value=92.0, allow_nan=False, allow_infinity=False),
            st.integers(min_value=0, max_value=20),
            st.floats(min_value=0.0, max_value=14.0, allow_nan=False, allow_infinity=False),
        ),
        min_size=1,
        max_size=15,
    ),
)
def test_property_ranking_matches_brute_force_nearest(
    user_lat: float,
    user_lon: float,
    items: list[tuple[str, float, float, int, float]],
) -> None:
    """Property: Top-1 hospital equals brute-force minimum inside the highest available tier."""
    candidates = [
        HospitalCandidate(id=f"H{idx:02d}", city=c, lat=la, lon=lo, free_beds=fb, age_hours=age)
        for idx, (c, la, lo, fb, age) in enumerate(items)
    ]
    ranked = rank_hospitals(candidates, user_lat=user_lat, user_lon=user_lon, user_city="Dhaka South")
    assert len(ranked) == len(candidates)

    # Brute-force verify #1 matches minimum distance in the best non-empty tier
    fresh = [c for c in candidates if c.free_beds >= 1 and c.age_hours <= 6.0]
    stale = [c for c in candidates if c.free_beds >= 1 and c.age_hours > 6.0]
    same_city_full = [c for c in candidates if c.free_beds == 0 and c.city == "Dhaka South"]
    pool = fresh or stale or same_city_full or candidates
    best_dist = min(round(haversine_km(user_lat, user_lon, c.lat, c.lon), 6) for c in pool)
    assert round(
        haversine_km(
            user_lat,
            user_lon,
            next(c.lat for c in candidates if c.id == ranked[0].id),
            next(c.lon for c in candidates if c.id == ranked[0].id),
        ),
        6,
    ) == pytest.approx(best_dist, abs=1e-5)

    # ETA is always >= 5 min and non-decreasing in distance
    for r in ranked:
        assert r.eta_minutes == straight_line_eta_minutes(r.distance_km)
        assert r.eta_minutes >= 5
