"""Integration & offline socket-guard tests for ADR-0020/0021 endpoints and brief trigger rule."""

from __future__ import annotations

import html
import socket

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.shared.structural import STRUCTURAL_DISCLAIMER


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.mark.offline
def test_trigger_endpoint_returns_holdout_metrics_offline(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /api/v1/validation/trigger works 100% offline with zero external sockets."""

    def _deny_socket(*args: object, **kwargs: object) -> None:
        raise AssertionError("External network call forbidden on /validation/trigger")

    monkeypatch.setattr(socket, "create_connection", _deny_socket)

    res = client.get("/api/v1/validation/trigger")
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"]
    assert body["rule"]["rain_2w_gt_mm"] == 80.0
    assert body["rule"]["water_logging_gte"] == 0.3
    assert body["rule"]["fit_years"] == [2016, 2023]
    assert body["rule"]["holdout_years"] == [2024, 2025]
    assert body["holdout_rule"]["hit_rate"] >= 0.90
    assert body["holdout_model"]["false_alarm_ratio"] < body["holdout_rule"]["false_alarm_ratio"]
    assert body["holdout_model"]["peirce_skill_score"] > body["holdout_rule"]["peirce_skill_score"]
    assert "ETag" in res.headers

    # Conditional GET honors ETag -> 304
    res304 = client.get("/api/v1/validation/trigger", headers={"If-None-Match": res.headers["ETag"]})
    assert res304.status_code == 304


@pytest.mark.offline
def test_structural_endpoint_filters_by_city_and_enforces_disclaimer(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /api/v1/planning/structural serves all 60 wards or filtered city offline with disclaimer."""

    def _deny_socket(*args: object, **kwargs: object) -> None:
        raise AssertionError("External network call forbidden on /planning/structural")

    monkeypatch.setattr(socket, "create_connection", _deny_socket)

    res_all = client.get("/api/v1/planning/structural")
    assert res_all.status_code == 200
    body_all = res_all.json()
    assert body_all["disclaimer"] == STRUCTURAL_DISCLAIMER
    assert body_all["city_filter"] is None
    assert len(body_all["wards"]) == 60
    assert body_all["wards"][0]["build_vs_send"]["drainage_cases_per_yr_glm"] >= 28.0

    res_dscc = client.get("/api/v1/planning/structural", params={"city": "Dhaka South"})
    assert res_dscc.status_code == 200
    body_dscc = res_dscc.json()
    assert body_dscc["city_filter"] == "Dhaka South"
    assert len(body_dscc["wards"]) == 20
    assert all(w["city"] == "Dhaka South" for w in body_dscc["wards"])

    # Invalid city -> RFC 9457 422
    res_bad = client.get("/api/v1/planning/structural", params={"city": "Atlantis"})
    assert res_bad.status_code == 422


@pytest.mark.offline
def test_commissioner_brief_prints_early_action_trigger_rule_en_and_bn(
    client: TestClient,
) -> None:
    """Commissioner HTML brief includes zero-model trigger rule in EN & BN with zero external URLs."""
    for lang, expected_phrase in (
        ("en", "2-week rainfall > 80 mm"),
        ("bn", "২ সপ্তাহের মোট বৃষ্টিপাত > ৮০ মিমি"),
    ):
        res = client.get(
            "/api/v1/dispatch/brief/DSCC_Ward_04.html",
            params={"origin_week": "2024-08-05", "lang": lang, "stock_pct": 60, "total_crews": 10},
        )
        assert res.status_code == 200
        html_doc = res.text
        plain_doc = html.unescape(html_doc)
        assert expected_phrase in plain_doc
        assert "ADR-0020" in html_doc
        assert "http://" not in html_doc and "https://" not in html_doc


def test_readyz_reports_trigger_and_structural_checks(client: TestClient) -> None:
    res = client.get("/readyz")
    assert res.status_code == 200
    checks = res.json()["checks"]
    assert checks["trigger_evaluation"] is True
    assert checks["structural_planner"] is True
