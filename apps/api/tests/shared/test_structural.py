"""Unit, property-based (Hypothesis), direction-agreement, and invariant tests for ADR-0021 structural planner."""

from __future__ import annotations

import json

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.config import API_DIR
from app.shared.structural import (
    STRUCTURAL_DISCLAIMER,
    bootstrap_ci_95,
    build_vs_send_ratio,
    clamp_trait_delta,
    glm_annual_prevented,
    pd_annual_prevented,
)


def test_alg_ST1_glm_scaling() -> None:
    """ST1: Log-link Poisson GLM scaling for water-logging (-0.1/-0.2) and sanitation (+0.1/+0.2)."""
    pct_wl1, c_wl1 = glm_annual_prevented(200.0, 0.8665, -0.1)
    pct_wl2, c_wl2 = glm_annual_prevented(200.0, 0.8665, -0.2)
    pct_s1, c_s1 = glm_annual_prevented(200.0, -0.3459, +0.1)
    pct_s2, c_s2 = glm_annual_prevented(200.0, -0.3459, +0.2)

    assert pct_wl1 == pytest.approx(8.30, abs=0.02)
    assert c_wl1 == pytest.approx(16.60, abs=0.05)
    assert pct_wl2 == pytest.approx(15.91, abs=0.02)
    assert c_wl2 == pytest.approx(31.82, abs=0.05)
    assert pct_s1 == pytest.approx(3.40, abs=0.02)
    assert c_s1 == pytest.approx(6.80, abs=0.05)
    assert pct_s2 == pytest.approx(6.68, abs=0.02)
    assert c_s2 == pytest.approx(13.37, abs=0.05)


def test_alg_ST2_trait_clamping() -> None:
    """ST2: Trait deltas clamp strictly within [0, 1]."""
    assert clamp_trait_delta(0.05, -0.2) == pytest.approx(-0.05, abs=1e-6)
    assert clamp_trait_delta(0.95, +0.2) == pytest.approx(+0.05, abs=1e-6)
    assert clamp_trait_delta(0.0, -0.2) == 0.0
    assert clamp_trait_delta(1.0, +0.2) == 0.0

    pct_clamped, _ = glm_annual_prevented(200.0, 0.8665, clamp_trait_delta(0.05, -0.2))
    assert pct_clamped == pytest.approx(4.24, abs=0.02)
    _, zero_cases = glm_annual_prevented(200.0, 0.8665, clamp_trait_delta(0.0, -0.2))
    assert zero_cases == 0.0


def test_alg_ST3_lgbm_pd_toy() -> None:
    """ST3: Annualised LightGBM partial-dependence helper on 2-week toy ward."""
    base = np.array([10.0, 14.0], dtype=np.float64)
    shifted = np.array([9.0, 12.6], dtype=np.float64)
    pct, cases_yr = pd_annual_prevented(base, shifted, weeks_per_year=52.0)
    assert pct == pytest.approx(10.0, abs=1e-4)
    assert cases_yr == pytest.approx(62.4, abs=1e-4)


def test_alg_ST4_build_vs_send_ratio() -> None:
    """ST4: Build-vs-Send ratio divides drainage cases/yr by crew ROI and guards zero ROI."""
    assert build_vs_send_ratio(32.0, 8.0) == pytest.approx(4.0, abs=1e-4)
    assert build_vs_send_ratio(32.0, 0.0) is None
    assert build_vs_send_ratio(32.0, -1.0) is None


def test_alg_ST5_committed_structural_signs_agreement_cis_and_disclaimer() -> None:
    """ST5: Committed structural.json has expected signs, GLM/LGBM direction agreement, valid CIs, and disclaimer."""
    path = API_DIR / "evals" / "results" / "structural.json"
    assert path.exists(), "Run npm run structural first"
    data = json.loads(path.read_text(encoding="utf-8"))

    # Mandatory disclaimer verbatim
    assert data["disclaimer"] == STRUCTURAL_DISCLAIMER
    assert data["disclaimer"] == "associations in simulated data, not causal real-world estimates"

    # Expected signs on GLM coefficients: higher water-logging -> more cases (+); higher sanitation -> fewer cases (-)
    assert data["glm_coefficients"]["water_logging_risk_index"] > 0.0
    assert data["glm_coefficients"]["sanitation_score"] < 0.0

    # Both Poisson GLM and LightGBM PD agree in direction (> 0% reduction) for all 4 improvements
    summary = data["summary"]
    for key in (
        "water_logging_minus_01",
        "water_logging_minus_02",
        "sanitation_plus_01",
        "sanitation_plus_02",
    ):
        for est_key in ("glm", "lgbm_pd"):
            est = summary[key][est_key]
            assert est["estimate"] > 0.0, f"Expected positive reduction for {key}.{est_key}"
            assert est["ci_low"] <= est["estimate"] <= est["ci_high"]

    # Larger step prevents more cases than smaller step
    assert (
        summary["water_logging_minus_02"]["glm"]["estimate"]
        > summary["water_logging_minus_01"]["glm"]["estimate"]
    )
    assert summary["sanitation_plus_02"]["glm"]["estimate"] > summary["sanitation_plus_01"]["glm"]["estimate"]

    # Reference magnitude sanity: ~8% for -0.1 wl, ~3% for +0.1 san, top ward ~30-38 cases/yr for -0.2 wl
    assert 6.0 <= summary["water_logging_minus_01"]["glm"]["estimate"] <= 11.0
    assert 2.0 <= summary["sanitation_plus_01"]["glm"]["estimate"] <= 5.5
    assert len(data["wards"]) == 60
    top_wl02 = data["wards"][0]["water_logging_minus_02"]["glm"]["estimate"]
    assert 28.0 <= top_wl02 <= 40.0

    # Every ward CI ordered and sorted descending by GLM -0.2 water-logging
    prev_val = float("inf")
    for w in data["wards"]:
        val = w["water_logging_minus_02"]["glm"]["estimate"]
        assert val <= prev_val + 1e-9
        prev_val = val
        for key in (
            "water_logging_minus_01",
            "water_logging_minus_02",
            "sanitation_plus_01",
            "sanitation_plus_02",
        ):
            for est_key in ("glm", "lgbm_pd"):
                e = w[key][est_key]
                assert e["ci_low"] <= e["estimate"] <= e["ci_high"]


@settings(max_examples=40)
@given(
    val=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    delta=st.floats(min_value=-0.5, max_value=0.5, allow_nan=False, allow_infinity=False),
    base_yr=st.floats(min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False),
    beta_pos=st.floats(min_value=0.01, max_value=2.0, allow_nan=False, allow_infinity=False),
)
def test_property_clamping_and_monotone_steps(
    val: float,
    delta: float,
    base_yr: float,
    beta_pos: float,
) -> None:
    """Property: Clamped trait stays in [0, 1]; -0.2 water-logging prevents >= -0.1 >= 0."""
    eff = clamp_trait_delta(val, delta)
    assert -1e-6 <= val + eff <= 1.0 + 1e-6

    d1 = clamp_trait_delta(val, -0.1)
    d2 = clamp_trait_delta(val, -0.2)
    _, c1 = glm_annual_prevented(base_yr, beta_pos, d1)
    _, c2 = glm_annual_prevented(base_yr, beta_pos, d2)
    assert c2 >= c1 - 1e-6 >= -1e-6

    lo, hi = bootstrap_ci_95(np.array([c1, c2, (c1 + c2) / 2.0]), point_estimate=c1)
    assert lo <= c1 <= hi
