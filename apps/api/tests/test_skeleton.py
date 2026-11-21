"""LEAD skeleton tests: health, problem+json errors and contract drift."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

CONTRACT = Path(__file__).resolve().parents[3] / "contracts" / "openapi.json"


def client() -> TestClient:
    return TestClient(create_app())


def test_healthz_and_readyz() -> None:
    with client() as c:
        assert c.get("/healthz").json() == {"status": "ok"}
        assert c.get("/readyz").status_code == 200


def test_validation_error_is_problem_json() -> None:
    with client() as c:
        r = c.post("/api/v1/forecast", json={"ward_ids": [], "origin_week": "2025-08-05"})
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    fields = {e["field"] for e in r.json()["errors"]}
    assert any("ward_ids" in f for f in fields) and any("origin_week" in f for f in fields)


def test_contract_has_not_drifted() -> None:
    """Fails when code and the committed contract differ: run `npm run contracts` and commit."""
    assert CONTRACT.exists(), "contracts/openapi.json missing — run npm run contracts"
    committed = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(create_app().openapi(), sort_keys=True))
