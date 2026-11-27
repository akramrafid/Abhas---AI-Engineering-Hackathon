"""API and service integration tests for WP3 counterfactual simulator and crew assignment."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.adapters.db.factory import get_engine
from app.adapters.db.models import PredictionCacheRow
from app.main import create_app


def test_wp3_1_2_3_deployments_model_driven_monotone_and_roi_ranked() -> None:
    """WP3-1, WP3-2, WP3-3: model-driven h=2..4, counterfactual <= baseline, ROI ranking, sensitivity band, supplies."""
    deployments = [
        {"ward_id": "DSCC_Ward_04", "crews": 2},
        {"ward_id": "DNCC_Ward_01", "crews": 1},
        {"ward_id": "CCC_Ward_01", "crews": 3},
    ]
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/simulator/run",
            json={"origin_week": "2024-08-05", "deployments": deployments, "efficacy": "base"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

    assert data["efficacy"]["preset"] == "base"
    assert data["efficacy"]["e_max"] == pytest.approx(0.40)
    assert data["efficacy"]["k"] == pytest.approx(0.50)
    assert "Assumed, not fitted" in data["efficacy"]["assumption_note"]

    wards = data["wards"]
    assert len(wards) == 3
    assert [w["rank"] for w in wards] == [1, 2, 3]

    # ROI descending order
    rois = [w["roi_cases_per_crew"] for w in wards]
    assert rois == sorted(rois, reverse=True)

    for w in wards:
        assert [h["horizon"] for h in w["horizons"]] == [2, 3, 4]
        for h in w["horizons"]:
            assert h["counterfactual_cases"] <= h["baseline_cases"] + 1e-6
            assert h["cases_prevented"] >= 0.0
            assert h["cases_prevented"] == pytest.approx(
                h["baseline_cases"] - h["counterfactual_cases"], abs=1e-3
            )
        assert w["cases_prevented_low"] <= w["cases_prevented"] + 1e-4
        assert w["cases_prevented"] <= w["cases_prevented_high"] + 1e-4
        assert w["beds_avoided"] == pytest.approx(w["cases_prevented"] * 0.298, abs=1e-3)
        assert w["saline_avoided"] == pytest.approx(w["cases_prevented"] * 2.385, abs=1e-3)
        assert w["roi_cases_per_crew"] == pytest.approx(w["cases_prevented"] / w["crews"], abs=1e-3)

    totals = data["totals"]
    assert totals["crews"] == 6
    assert totals["cases_prevented"] == pytest.approx(sum(w["cases_prevented"] for w in wards), abs=1e-3)
    assert totals["cases_prevented_low"] <= totals["cases_prevented"] + 1e-4
    assert totals["cases_prevented"] <= totals["cases_prevented_high"] + 1e-4


def test_wp3_4_5_auto_crews_matches_allocation_crew_placement() -> None:
    """WP3-4 & WP3-5: allocation/plan greedy crews sum to min(N, 5*wards) and match simulator auto_crews=N identically."""
    with TestClient(create_app()) as client:
        alloc_resp = client.post(
            "/api/v1/allocation/plan",
            json={
                "scope": "all",
                "origin_week": "2024-08-05",
                "h_start": 2,
                "h_end": 4,
                "stock_pct": 60,
                "total_crews": 10,
            },
        )
        assert alloc_resp.status_code == 200, alloc_resp.text
        alloc = alloc_resp.json()

        sim_resp = client.post(
            "/api/v1/simulator/run",
            json={"origin_week": "2024-08-05", "auto_crews": 10, "efficacy": "base"},
        )
        assert sim_resp.status_code == 200, sim_resp.text
        sim = sim_resp.json()

    alloc_crews = {w["ward_id"]: w["crews"] for w in alloc["wards"] if w["crews"] > 0}
    sim_crews = {w["ward_id"]: w["crews"] for w in sim["wards"]}

    assert sum(alloc_crews.values()) == 10
    assert sum(c["crews_assigned"] for c in alloc["cities"]) == 10
    assert alloc["crew_method"] in ("greedy", "greedy (approximate)")
    assert sim["totals"]["crews"] == 10
    assert sim_crews == alloc_crews


def test_wp3_6_ten_ward_latency_under_800ms_and_cache_not_polluted() -> None:
    """WP3-6: 10-ward deployment p95 < 800 ms locally and counterfactuals never write to predictions_cache."""
    with TestClient(create_app()) as client:
        wards_resp = client.get("/api/v1/wards")
        assert wards_resp.status_code == 200
        ten_wards = [w["ward_id"] for w in wards_resp.json()["wards"][:10]]
        deployments = [{"ward_id": wid, "crews": 2} for wid in ten_wards]

        engine = get_engine()
        with engine.connect() as conn:
            before_count = int(
                conn.execute(select(func.count()).select_from(PredictionCacheRow)).scalar_one()
            )

        # Warm call + 5 timed runs
        r0 = client.post(
            "/api/v1/simulator/run",
            json={"origin_week": "2024-08-05", "deployments": deployments, "efficacy": "base"},
        )
        assert r0.status_code == 200, r0.text

        latencies_ms: list[float] = []
        for _ in range(5):
            t0 = time.perf_counter()
            r = client.post(
                "/api/v1/simulator/run",
                json={"origin_week": "2024-08-05", "deployments": deployments, "efficacy": "base"},
            )
            assert r.status_code == 200
            latencies_ms.append((time.perf_counter() - t0) * 1000.0)

        with engine.connect() as conn:
            after_count = int(conn.execute(select(func.count()).select_from(PredictionCacheRow)).scalar_one())

        assert after_count == before_count
        p95 = sorted(latencies_ms)[-1]
        assert p95 < 800.0, f"10-ward simulator p95={p95:.1f}ms exceeded 800ms budget"


def test_wp3_unknown_ward_404_and_plan_save() -> None:
    """Unknown ward in deployments returns 404 problem+json; POST /api/v1/plans stores live simulation."""
    with TestClient(create_app()) as client:
        # Regression (Schemathesis S4kgeD / 8y8nuI): total_crews=1 and auto_crews=1 must succeed cleanly.
        r_alloc1 = client.post(
            "/api/v1/allocation/plan",
            json={
                "scope": "all",
                "origin_week": "2025-08-04",
                "h_start": 2,
                "h_end": 4,
                "stock_pct": 100,
                "total_crews": 1,
                "service_level": 0.5,
                "equity_floor_pct": 20,
            },
        )
        assert r_alloc1.status_code == 200, r_alloc1.text
        assert sum(w["crews"] for w in r_alloc1.json()["wards"]) == 1

        r_sim1 = client.post(
            "/api/v1/simulator/run",
            json={"origin_week": "2025-08-04", "auto_crews": 1, "efficacy": "base"},
        )
        assert r_sim1.status_code == 200, r_sim1.text
        assert r_sim1.json()["totals"]["crews"] == 1

        bad = client.post(
            "/api/v1/simulator/run",
            json={
                "origin_week": "2024-08-05",
                "deployments": [{"ward_id": "UNKNOWN_Ward_99", "crews": 1}],
            },
        )
        assert bad.status_code == 404
        assert bad.headers["content-type"].startswith("application/problem+json")

        plan_resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "simulation",
                "label": "WP3 live simulator check",
                "request": {
                    "origin_week": "2024-08-05",
                    "deployments": [{"ward_id": "DSCC_Ward_04", "crews": 2}],
                    "efficacy": "base",
                },
            },
        )
        assert plan_resp.status_code == 201, plan_resp.text
        plan = plan_resp.json()
        assert plan["headline"]["crews"] == 2
        assert plan["headline"]["cases_prevented"] >= 0.0
