"""API, privacy, security red-team, and offline socket-guard tests for ADR-0018 facilities."""

from __future__ import annotations

import logging
import socket

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.mark.offline
def test_hospitals_endpoint_offline_demo_labelled_and_city_filtered(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /api/v1/facilities/hospitals works 100% offline with ODbL attribution and DEMO label."""

    def _deny_socket(*args: object, **kwargs: object) -> None:
        raise AssertionError("External network forbidden on /facilities/hospitals")

    monkeypatch.setattr(socket, "create_connection", _deny_socket)

    res = client.get("/api/v1/facilities/hospitals")
    assert res.status_code == 200
    body = res.json()
    assert body["emergency_number"] == "999"
    assert "OpenStreetMap" in body["attribution"]
    assert "ODbL" in body["attribution"]
    assert "Demo bed data" in body["bed_data_disclaimer"]
    assert len(body["hospitals"]) >= 10

    cities_present = {h["city"] for h in body["hospitals"]}
    assert cities_present == {"Dhaka North", "Dhaka South", "Chattogram", "Gazipur", "Narayanganj"}

    # City filter works and invalid city returns 422
    res_ctg = client.get("/api/v1/facilities/hospitals", params={"city": "Chattogram"})
    assert res_ctg.status_code == 200
    assert len(res_ctg.json()["hospitals"]) >= 1
    assert all(h["city"] == "Chattogram" for h in res_ctg.json()["hospitals"])

    res_bad = client.get("/api/v1/facilities/hospitals", params={"city": "Narnia"})
    assert res_bad.status_code == 422


def test_manager_role_required_for_bed_board_updates(client: TestClient) -> None:
    """Red-team: POST /facilities/beds/{id} returns 403 without manager role, 200 with manager role."""
    hospitals = client.get("/api/v1/facilities/hospitals").json()["hospitals"]
    target = hospitals[0]
    hid = target["id"]

    # Missing role header -> 403
    r_no_role = client.post(
        f"/api/v1/facilities/beds/{hid}",
        json={"free_beds": 4, "total_beds": 20, "note": "No role check"},
    )
    assert r_no_role.status_code == 403

    # Non-manager role -> 403
    r_viewer = client.post(
        f"/api/v1/facilities/beds/{hid}",
        headers={"X-Facility-Role": "viewer"},
        json={"free_beds": 4, "total_beds": 20},
    )
    assert r_viewer.status_code == 403

    # Control chars in note rejected -> 422
    r_ctrl = client.post(
        f"/api/v1/facilities/beds/{hid}",
        headers={"X-Facility-Role": "manager"},
        json={"free_beds": 4, "total_beds": 20, "note": "bad\u202eoverride"},
    )
    assert r_ctrl.status_code == 422

    # Valid manager update -> 200 and flips data_source to "board"
    r_ok = client.post(
        f"/api/v1/facilities/beds/{hid}",
        headers={"X-Facility-Role": "manager"},
        json={"free_beds": 7, "total_beds": 24, "note": "Ward 2 dengue beds opened"},
    )
    assert r_ok.status_code == 200
    updated = r_ok.json()["hospital"]
    assert updated["free_beds"] == 7
    assert updated["total_beds"] == 24
    assert updated["data_source"] == "board"
    assert updated["is_stale"] is False


def test_ambulance_request_rejects_pii_and_gps_and_logs_zero_location(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Red-team privacy: extra PII/GPS fields return 422 and server logs never contain coordinates."""
    hospitals = client.get("/api/v1/facilities/hospitals", params={"city": "Dhaka South"}).json()["hospitals"]
    target = hospitals[0]

    # Rejects patient PII or GPS coordinates via extra="forbid"
    for forbidden_extra in (
        {"patient_name": "Jane Doe"},
        {"patient_phone": "+8801711000111"},
        {"nid": "1990123456789"},
        {"lat": 23.75123, "lon": 90.39123},
    ):
        payload = {
            "hospital_id": target["id"],
            "city": target["city"],
            "severity": "Critical",
            "beds_requested": 1,
            **forbidden_extra,
        }
        r = client.post("/api/v1/facilities/ambulance-requests", json=payload)
        assert r.status_code == 422, f"Expected 422 for forbidden field {forbidden_extra}"

    # Valid coordination request persists and logs zero location strings
    with caplog.at_level(logging.INFO, logger="abhas.http"):
        r_ok = client.post(
            "/api/v1/facilities/ambulance-requests",
            json={
                "hospital_id": target["id"],
                "city": target["city"],
                "severity": "High",
                "beds_requested": 1,
                "dispatcher_note": "Unit 5 inbound <script>safe</script>",
            },
        )
    assert r_ok.status_code == 201
    created = r_ok.json()
    assert created["hospital_id"] == target["id"]
    assert created["status"] == "logged"

    # Verify list endpoint returns logged item
    r_list = client.get("/api/v1/facilities/ambulance-requests", params={"city": target["city"]})
    assert r_list.status_code == 200
    assert any(item["id"] == created["id"] for item in r_list.json()["requests"])

    # Confirm no GPS coordinates appeared anywhere in HTTP logs
    joined_logs = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "23.75123" not in joined_logs
    assert "90.39123" not in joined_logs
