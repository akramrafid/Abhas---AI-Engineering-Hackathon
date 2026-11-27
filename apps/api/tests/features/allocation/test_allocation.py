"""API and service integration tests for WP1 allocation vertical slice."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.config_supply import (
    ConfigSupplyRatioSource,
    SupplyRatiosUnavailableError,
    check_supply_ratios_ready,
)
from app.main import create_app


def test_wp1_1_allocation_all_wards_100pct_stock() -> None:
    """WP1-1: scope='all', stock_pct=100 returns 60 wards across 5 cities with zero deficits."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/allocation/plan",
            json={"scope": "all", "origin_week": "2024-08-05", "stock_pct": 100, "equity_floor_pct": 20},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

    assert len(data["wards"]) == 60
    assert len(data["cities"]) == 5
    assert data["supply_ratios"] == {
        "saline_bags": 2.385,
        "diagnostic_kits": 1.164,
        "hospital_beds": 0.298,
    }
    assert data["service_levels"] == {
        "saline_bags": 0.8,
        "diagnostic_kits": 0.8,
        "hospital_beds": 0.9,
    }
    for w in data["wards"]:
        assert w["deficit_level"] == "none"
        assert w["deficit_reasons"] == []
        for res_key in ("saline_bags", "diagnostic_kits", "hospital_beds"):
            line = w[res_key]
            assert line["allocated"] == line["required"]
            assert line["deficit"] == 0
            assert line["fulfilment_pct"] == 100.0
    for c in data["cities"]:
        assert c["critical_wards"] == 0
        assert c["deficit_wards"] == 0
        for r in c["resources"]:
            assert r["allocated"] == r["required"]
            assert r["floors_scaled"] is False


def test_wp1_2_allocation_60pct_stock_conservation_and_priority() -> None:
    """WP1-2: stock_pct=60 obeys conservation, equity floor, and deficit classification."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/allocation/plan",
            json={
                "scope": "Dhaka South",
                "origin_week": "2024-08-05",
                "h_start": 2,
                "h_end": 4,
                "stock_pct": 60,
                "equity_floor_pct": 20,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

    assert len(data["cities"]) == 1
    assert data["cities"][0]["city"] == "Dhaka South"
    wards = data["wards"]
    assert len(wards) > 1

    # Conservation per resource
    totals_by_res = {r["resource"]: r for r in data["cities"][0]["resources"]}
    for res_key in ("saline_bags", "diagnostic_kits", "hospital_beds"):
        sum_req = sum(w[res_key]["required"] for w in wards)
        sum_alloc = sum(w[res_key]["allocated"] for w in wards)
        assert sum_req == totals_by_res[res_key]["required"]
        assert sum_alloc == totals_by_res[res_key]["allocated"]
        assert sum_alloc == min(totals_by_res[res_key]["available"], sum_req)
        assert totals_by_res[res_key]["floors_scaled"] is False

    # Every High/Critical ward with shortfall must be marked critical
    for w in wards:
        has_shortfall = any(
            w[rk]["allocated"] < w[rk]["required"]
            for rk in ("saline_bags", "diagnostic_kits", "hospital_beds")
        )
        if has_shortfall and w["tier"] in ("High", "Critical"):
            assert w["deficit_level"] == "critical"
            assert len(w["deficit_reasons"]) >= 1


def test_wp1_3_allocation_floor_scaling_30pct_stock_50pct_floor() -> None:
    """WP1-3: stock_pct=30 with equity_floor_pct=50 scales floors cleanly without error."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/allocation/plan",
            json={
                "scope": "Dhaka South",
                "origin_week": "2024-08-05",
                "stock_pct": 30,
                "equity_floor_pct": 50,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

    for r in data["cities"][0]["resources"]:
        if r["required"] > 0:
            assert r["floors_scaled"] is True
        assert r["allocated"] == min(r["available"], r["required"])


def test_wp1_4_supply_config_adapter_readiness_and_validation(tmp_path: Path) -> None:
    """WP1-4: ConfigSupplyRatioSource passes on committed config and rejects corrupted SHA/row_match."""
    assert check_supply_ratios_ready() is True

    bad_path = tmp_path / "supply_ratios.json"
    bad_path.write_text(
        json.dumps(
            {
                "dataset_sha256": "0" * 64,
                "ratios": {"saline_bags": 2.385, "diagnostic_kits": 1.164, "hospital_beds": 0.298},
                "row_match": {"saline_bags": 1.0, "diagnostic_kits": 1.0, "hospital_beds": 1.0},
            }
        ),
        encoding="utf-8",
    )
    src = ConfigSupplyRatioSource(path=bad_path)
    with pytest.raises(SupplyRatiosUnavailableError):
        src.ratios()
    assert check_supply_ratios_ready(src) is False


def test_wp1_5_warm_latency_and_plan_save() -> None:
    """WP1-5: Warm 60-ward allocation stays fast and POST /api/v1/plans persists live allocation output."""
    with TestClient(create_app()) as client:
        # Warm cache
        warm = client.post(
            "/api/v1/allocation/plan",
            json={"scope": "all", "origin_week": "2024-08-05", "stock_pct": 60},
        )
        assert warm.status_code == 200

        times_ms: list[float] = []
        for _ in range(5):
            t0 = time.perf_counter()
            r = client.post(
                "/api/v1/allocation/plan",
                json={"scope": "all", "origin_week": "2024-08-05", "stock_pct": 60},
            )
            assert r.status_code == 200
            times_ms.append((time.perf_counter() - t0) * 1000.0)
        assert sorted(times_ms)[len(times_ms) // 2] < 500.0

        plan_resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "allocation",
                "label": "WP1 live allocation test",
                "request": {"scope": "Dhaka South", "origin_week": "2024-08-05", "stock_pct": 60},
            },
        )
        assert plan_resp.status_code == 201, plan_resp.text
        plan = plan_resp.json()
        assert plan["headline"]["stock_pct"] == 60
        assert "mean_fulfilment_pct" in plan["headline"]
