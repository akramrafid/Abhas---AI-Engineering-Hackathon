"""API and service integration tests for WP2 overflow routing vertical slice."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.config_capacity import check_ward_capacity_ready
from app.main import create_app


def test_wp2_1_overflow_all_cities_pool_isolation_and_conservation() -> None:
    """WP2-1: scope='all' routes all 60 wards strictly within each of the 5 city pools."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/overflow/route",
            json={"scope": "all", "origin_week": "2024-08-05", "horizon": 3, "service_level": 0.9},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

    assert len(data["wards"]) == 60
    assert len(data["cities"]) == 5
    assert data["solve_ms"] < 500.0
    assert data["capacity_method"]

    ward_city = {w["ward_id"]: w["city"] for w in data["wards"]}
    for t in data["transfers"]:
        assert ward_city[t["from_ward"]] == t["city"]
        assert ward_city[t["to_ward"]] == t["city"]
        assert t["from_ward"] != t["to_ward"]
        assert t["patients"] >= 1

    # Conservation per ward & city
    for w in data["wards"]:
        assert w["transferred_out"] == 0 or w["transferred_in"] == 0
        load_after = w["beds_required"] - w["transferred_out"] + w["transferred_in"]
        assert w["net_deficit"] == max(load_after - w["capacity"], 0)
        assert w["capacity_source"] == "derived"


def test_wp2_2_capacity_override_and_unknown_ward_404() -> None:
    """WP2-2: capacity_overrides applies override capacity and rejects unknown ward IDs with 404."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/overflow/route",
            json={
                "scope": "Dhaka South",
                "origin_week": "2024-08-05",
                "horizon": 3,
                "capacity_overrides": {"DSCC_Ward_04": 1},
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        w04 = next(w for w in data["wards"] if w["ward_id"] == "DSCC_Ward_04")
        assert w04["capacity"] == 1
        assert w04["capacity_source"] == "override"

        bad = client.post(
            "/api/v1/overflow/route",
            json={
                "scope": "Dhaka South",
                "origin_week": "2024-08-05",
                "horizon": 3,
                "capacity_overrides": {"UNKNOWN_Ward_99": 2},
            },
        )
        assert bad.status_code == 404
        assert bad.headers["content-type"].startswith("application/problem+json")

        out_of_scope = client.post(
            "/api/v1/overflow/route",
            json={
                "scope": "Dhaka North",
                "origin_week": "2024-08-05",
                "horizon": 3,
                "capacity_overrides": {"CCC_Ward_01": 5},
            },
        )
        assert out_of_scope.status_code == 422, out_of_scope.text
        assert out_of_scope.headers["content-type"].startswith("application/problem+json")
        body = out_of_scope.json()
        assert body["type"].endswith("/override-out-of-scope")
        assert "CCC_Ward_01" in body["detail"]


def test_wp2_3_capacity_adapter_readiness(tmp_path: Path) -> None:
    """WP2-3: check_ward_capacity_ready validates committed ward_capacity.json and rejects invalid JSON."""
    assert check_ward_capacity_ready() is True

    bad = tmp_path / "bad_capacity.json"
    bad.write_text(
        json.dumps({"method": "p95", "dataset_sha256": "0" * 64, "wards": {"W1": 3}}), encoding="utf-8"
    )
    assert check_ward_capacity_ready(bad) is False


def test_wp2_4_plan_save_uses_live_overflow_runner() -> None:
    """WP2-4: POST /api/v1/plans with kind='overflow' executes live overflow runner."""
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "overflow",
                "label": "WP2 live overflow check",
                "request": {"scope": "Dhaka North", "origin_week": "2024-08-05", "horizon": 3},
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert "unroutable_patients" in body["headline"]
        assert len(body["outputs"]["cities"]) == 1
