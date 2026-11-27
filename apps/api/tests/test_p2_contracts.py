"""WP0 contract verification tests (WP0-1 through WP0-5, docs/contracts-phase2.md)."""

from __future__ import annotations

import json
import re
import socket
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.adapters.db.engine import create_db_engine
from app.core.command_requests import (
    AllocationRequest,
    DispatchRequest,
    OverflowRequest,
    SimulatorRequest,
)
from app.core.config import API_DIR
from app.core.run_meta import GIT_SHA_PATTERN
from app.features.allocation.schemas import AllocationResponse
from app.features.allocation.service import AllocationService
from app.features.dispatch.schemas import DispatchResponse
from app.features.dispatch.service import DispatchService
from app.features.overflow.schemas import OverflowResponse
from app.features.overflow.service import OverflowService
from app.features.plans.schemas import PlanComparison, PlanList, PlanRecord
from app.features.plans.service import PlansService
from app.features.simulator.schemas import SimulatorResponse
from app.features.simulator.service import SimulatorService
from app.main import create_app
from app.ports.supply import SupplyRatios
from app.shared.features import FEATURE_COLUMNS
from app.shared.intervention import (
    EFFICACY_PRESETS,
    MONOTONE_RAIN_FEATURES,
    apply_reduction,
    reduction,
    roi,
)
from app.shared.optimizer import (
    allocate_city,
    classify_deficit,
    density_factors,
    greedy_crews,
    largest_remainder_round,
    priority_weights,
)
from app.shared.plan_registry import registered_kinds
from app.shared.routing import derive_capacity, route_city, summarise_city
from app.shared.supply import fit_ratios, supply_for_cases, window_case_quantile
from ml.train import monotone_constraints_for_horizon

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPO_ROOT / "contracts" / "openapi.json"
GIT_SHA_RE = re.compile(GIT_SHA_PATTERN)


def _assert_run_meta(payload: dict[str, Any], *, expected_offline: bool | None = None) -> None:
    assert isinstance(payload.get("model_version"), str) and payload["model_version"]
    assert isinstance(payload.get("git_sha"), str) and GIT_SHA_RE.fullmatch(payload["git_sha"])
    assert payload.get("data_as_of") == "2025-12-29"
    assert isinstance(payload.get("offline"), bool)
    if expected_offline is not None:
        assert payload["offline"] is expected_offline
    assert isinstance(payload.get("generated_at"), str) and payload["generated_at"]


def test_wp0_1_openapi_lists_all_phase2_routes_and_matches_committed_contract() -> None:
    """WP0-1: /openapi.json lists every Phase 2 route and matches committed contracts/openapi.json."""
    with TestClient(create_app()) as client:
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        spec = resp.json()

    paths = spec["paths"]
    expected: list[tuple[str, str]] = [
        ("/api/v1/allocation/plan", "post"),
        ("/api/v1/overflow/route", "post"),
        ("/api/v1/simulator/run", "post"),
        ("/api/v1/dispatch/notices", "post"),
        ("/api/v1/dispatch/brief/{ward_id}.html", "get"),
        ("/api/v1/plans", "post"),
        ("/api/v1/plans", "get"),
        ("/api/v1/plans/compare", "get"),
    ]
    for path, method in expected:
        assert path in paths, f"Missing OpenAPI path: {path}"
        assert method in paths[path], f"Missing {method.upper()} on {path}"

    assert CONTRACT_PATH.exists(), "contracts/openapi.json missing — run npm run contracts"
    committed = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(create_app().openapi(), sort_keys=True))


def test_wp0_2_fixture_roundtrip_and_provenance_all_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    """WP0-2: Every Phase 2 stub endpoint returns schema-valid fixture with RunMeta provenance + /readyz."""
    monkeypatch.setenv("ABHAS_GIT_SHA", "075e81b")
    monkeypatch.setenv("ABHAS_OFFLINE", "0")

    with TestClient(create_app()) as client:
        # /readyz provenance
        r_ready = client.get("/readyz")
        assert r_ready.status_code == 200
        ready_body = r_ready.json()
        assert ready_body["git_sha"] == "075e81b"
        assert ready_body["offline"] is False
        assert ready_body["data_as_of"] == "2025-12-29"

        # 2.1 POST /api/v1/allocation/plan
        alloc_req = {
            "scope": "Dhaka South",
            "origin_week": "2024-08-05",
            "h_start": 2,
            "h_end": 4,
            "stock_pct": 60,
            "total_crews": 10,
            "service_level": None,
            "equity_floor_pct": 20,
        }
        r_alloc = client.post("/api/v1/allocation/plan", json=alloc_req)
        assert r_alloc.status_code == 200
        alloc_body = r_alloc.json()
        _assert_run_meta(alloc_body, expected_offline=False)
        assert alloc_body["git_sha"] == "075e81b"
        AllocationResponse.model_validate(alloc_body)

        # 2.2 POST /api/v1/overflow/route
        ovf_req = {"scope": "Dhaka North", "origin_week": "2024-08-05", "horizon": 3}
        r_ovf = client.post("/api/v1/overflow/route", json=ovf_req)
        assert r_ovf.status_code == 200
        ovf_body = r_ovf.json()
        _assert_run_meta(ovf_body, expected_offline=False)
        OverflowResponse.model_validate(ovf_body)

        # 2.3 POST /api/v1/simulator/run (deployments and auto_crews)
        sim_req = {
            "origin_week": "2024-08-05",
            "deployments": [{"ward_id": "DSCC_Ward_04", "crews": 2}],
            "efficacy": "base",
        }
        r_sim = client.post("/api/v1/simulator/run", json=sim_req)
        assert r_sim.status_code == 200
        sim_body = r_sim.json()
        _assert_run_meta(sim_body, expected_offline=False)
        SimulatorResponse.model_validate(sim_body)

        r_sim_auto = client.post(
            "/api/v1/simulator/run",
            json={"origin_week": "2024-08-05", "auto_crews": 10, "efficacy": "high"},
        )
        assert r_sim_auto.status_code == 200
        SimulatorResponse.model_validate(r_sim_auto.json())

        # 2.4 POST /api/v1/dispatch/notices (EN + BN)
        for lang, expected_enc in (("en", "GSM-7"), ("bn", "UCS-2")):
            disp_req = {
                "origin_week": "2024-08-05",
                "ward_ids": ["DSCC_Ward_04"],
                "channels": ["sms", "whatsapp", "brief"],
                "lang": lang,
                "stock_pct": 60,
                "total_crews": 10,
            }
            r_disp = client.post("/api/v1/dispatch/notices", json=disp_req)
            assert r_disp.status_code == 200
            disp_body = r_disp.json()
            _assert_run_meta(disp_body, expected_offline=False)
            parsed_disp = DispatchResponse.model_validate(disp_body)
            assert parsed_disp.notices[0].sms is not None
            assert parsed_disp.notices[0].sms.encoding == expected_enc

        # 2.5 GET /api/v1/dispatch/brief/{ward_id}.html
        r_brief = client.get(
            "/api/v1/dispatch/brief/DSCC_Ward_04.html",
            params={"origin_week": "2024-08-05", "lang": "en", "stock_pct": 60, "total_crews": 10},
        )
        assert r_brief.status_code == 200
        assert r_brief.headers["content-type"].startswith("text/html")
        assert "DSCC_Ward_04" in r_brief.text
        assert "075e81b" in r_brief.text
        assert "2025-12-29" in r_brief.text
        assert "http://" not in r_brief.text and "https://" not in r_brief.text

        # 2.6 POST /api/v1/plans (all 4 discriminated kinds)
        plan_payloads = [
            {"kind": "allocation", "label": "Dhaka South 60% stock", "request": alloc_req},
            {"kind": "overflow", "label": "Dhaka North h3 routing", "request": ovf_req},
            {"kind": "simulation", "label": "Ward 04 2 crews", "request": sim_req},
            {
                "kind": "dispatch",
                "label": "Dhaka South EN notices",
                "request": {"origin_week": "2024-08-05", "scope": "Dhaka South", "lang": "en"},
            },
        ]
        for body in plan_payloads:
            r_plan = client.post("/api/v1/plans", json=body)
            assert r_plan.status_code == 201, r_plan.text
            plan_json = r_plan.json()
            _assert_run_meta(plan_json, expected_offline=False)
            PlanRecord.model_validate(plan_json)

        # GET /api/v1/plans
        r_list = client.get("/api/v1/plans", params={"kind": "allocation", "limit": 10})
        assert r_list.status_code == 200
        list_body = r_list.json()
        _assert_run_meta(list_body, expected_offline=False)
        PlanList.model_validate(list_body)

        # GET /api/v1/plans/compare
        r_cmp = client.get(
            "/api/v1/plans/compare",
            params={
                "a": "550e8400-e29b-41d4-a716-446655440001",
                "b": "550e8400-e29b-41d4-a716-446655440002",
            },
        )
        assert r_cmp.status_code == 200
        cmp_body = r_cmp.json()
        _assert_run_meta(cmp_body, expected_offline=False)
        PlanComparison.model_validate(cmp_body)


def test_wp0_3_validation_422_problem_json_names_fields() -> None:
    """WP0-3: The four invalid Phase 2 requests return 422 problem+json naming the offending field."""
    with TestClient(create_app()) as client:
        # 1. stock_pct = 20 (range 30..100)
        r1 = client.post(
            "/api/v1/allocation/plan",
            json={"origin_week": "2024-08-05", "stock_pct": 20},
        )
        assert r1.status_code == 422
        assert r1.headers["content-type"].startswith("application/problem+json")
        assert any("stock_pct" in e["field"] for e in r1.json()["errors"])

        # 2. h_end < h_start
        r2 = client.post(
            "/api/v1/allocation/plan",
            json={"origin_week": "2024-08-05", "h_start": 4, "h_end": 2},
        )
        assert r2.status_code == 422
        assert r2.headers["content-type"].startswith("application/problem+json")
        assert any("h_end" in e["field"] for e in r2.json()["errors"])

        # 3. Both deployments and auto_crews set (and neither set)
        r3_both = client.post(
            "/api/v1/simulator/run",
            json={
                "origin_week": "2024-08-05",
                "deployments": [{"ward_id": "DSCC_Ward_04", "crews": 2}],
                "auto_crews": 5,
            },
        )
        assert r3_both.status_code == 422
        assert r3_both.headers["content-type"].startswith("application/problem+json")
        errs3 = r3_both.json()["errors"]
        assert any("auto_crews" in e["field"] or "deployments" in e["field"] for e in errs3)

        r3_neither = client.post("/api/v1/simulator/run", json={"origin_week": "2024-08-05"})
        assert r3_neither.status_code == 422
        assert r3_neither.headers["content-type"].startswith("application/problem+json")
        assert any(
            "auto_crews" in e["field"] or "deployments" in e["field"] for e in r3_neither.json()["errors"]
        )

        # 4. Neither ward_ids nor scope set (and both set)
        r4_neither = client.post("/api/v1/dispatch/notices", json={"origin_week": "2024-08-05"})
        assert r4_neither.status_code == 422
        assert r4_neither.headers["content-type"].startswith("application/problem+json")
        assert any("scope" in e["field"] or "ward_ids" in e["field"] for e in r4_neither.json()["errors"])

        r4_both = client.post(
            "/api/v1/dispatch/notices",
            json={"origin_week": "2024-08-05", "ward_ids": ["DSCC_Ward_04"], "scope": "Dhaka South"},
        )
        assert r4_both.status_code == 422
        assert r4_both.headers["content-type"].startswith("application/problem+json")
        assert any("scope" in e["field"] or "ward_ids" in e["field"] for e in r4_both.json()["errors"])

        # Extra unknown field is forbidden (extra="forbid")
        r_extra = client.post(
            "/api/v1/overflow/route",
            json={"origin_week": "2024-08-05", "unexpected_field": 1},
        )
        assert r_extra.status_code == 422
        assert r_extra.headers["content-type"].startswith("application/problem+json")


def test_monotone_rain_features_matches_ml_train() -> None:
    """MONOTONE_RAIN_FEATURES equals ml/train.py monotone_constraints_for_horizon for h = 2, 3, 4."""
    assert set(MONOTONE_RAIN_FEATURES.keys()) == {2, 3, 4}
    for h in (2, 3, 4):
        flags = monotone_constraints_for_horizon(h)
        expected = {col for col, flag in zip(FEATURE_COLUMNS, flags, strict=True) if flag == 1}
        assert set(MONOTONE_RAIN_FEATURES[h]) == expected

    assert EFFICACY_PRESETS == {
        "low": (0.25, 0.35),
        "base": (0.40, 0.50),
        "high": (0.55, 0.70),
    }


def test_wp0_shared_and_service_stubs_raise_not_implemented() -> None:
    """WP0 locks signatures and leaves algorithm/service bodies raising NotImplementedError for WP1-WP6."""
    create_app()
    assert registered_kinds() >= {"allocation", "overflow", "simulation", "dispatch"}

    ratios = SupplyRatios(
        saline_bags=2.384,
        diagnostic_kits=1.158,
        hospital_beds=0.295,
        r2={"saline_bags": 0.9997, "diagnostic_kits": 0.9988, "hospital_beds": 0.9806},
        fitted_years=(2016, 2022),
        dataset_sha256="24fac543",
    )

    with pytest.raises(NotImplementedError):
        window_case_quantile([4.0, 6.0], [3.0, 3.0], 0.8)
    with pytest.raises(NotImplementedError):
        supply_for_cases(10, ratios)
    with pytest.raises(NotImplementedError):
        fit_ratios(None)  # type: ignore[arg-type]
    with pytest.raises(NotImplementedError):
        density_factors([40000.0], 40000.0)
    with pytest.raises(NotImplementedError):
        priority_weights(["Critical"], [1.0])
    with pytest.raises(NotImplementedError):
        allocate_city([100], [8.0], 60, 20, ["DSCC_Ward_04"])
    with pytest.raises(NotImplementedError):
        largest_remainder_round([2.4, 1.6], 4, ["a", "b"])
    with pytest.raises(NotImplementedError):
        classify_deficit(10, 5, "Critical")
    with pytest.raises(NotImplementedError):
        greedy_crews(lambda _w, _c: 1.0, ["DSCC_Ward_04"], 2)
    with pytest.raises(NotImplementedError):
        derive_capacity({})
    with pytest.raises(NotImplementedError):
        route_city([9, 2], [5, 6], ["W1", "W2"])
    with pytest.raises(NotImplementedError):
        summarise_city([9, 2], [5, 6], [5, 6])
    with pytest.raises(NotImplementedError):
        reduction(2, 0.40, 0.50)
    with pytest.raises(NotImplementedError):
        apply_reduction({}, 2, 0.25, 100.0)
    with pytest.raises(NotImplementedError):
        roi(6.0, 2)

    with pytest.raises(NotImplementedError):
        AllocationService().plan(AllocationRequest(origin_week=date(2024, 8, 5)))
    with pytest.raises(NotImplementedError):
        OverflowService().route(OverflowRequest(origin_week=date(2024, 8, 5)))
    with pytest.raises(NotImplementedError):
        SimulatorService().run(SimulatorRequest(origin_week=date(2024, 8, 5), auto_crews=4))
    with pytest.raises(NotImplementedError):
        DispatchService().notices(DispatchRequest(origin_week=date(2024, 8, 5), scope="Dhaka South"))
    with pytest.raises(NotImplementedError):
        PlansService().list_plans()


def test_wp0_5_migration_0002_tables_constraints_and_reversibility(tmp_path: Path) -> None:
    """WP0-5: Alembic 0002 creates plans, plan_runs, dispatch_log with indexes, CHECK, FK cascade, and clean downgrade."""
    db_file = tmp_path / "p2_migration.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url

    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        assert {"plans", "plan_runs", "dispatch_log"} <= tables
        assert "ix_plans_kind_created" in {ix["name"] for ix in insp.get_indexes("plans")}
        assert "ix_dispatch_log_ward_created" in {ix["name"] for ix in insp.get_indexes("dispatch_log")}

        # Invalid plan kind must be rejected by CHECK constraint
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO plans (id, kind, label, origin_week, model_version, git_sha, data_as_of, offline) "
                        "VALUES (:id, :kind, :label, :origin_week, :mv, :sha, :dao, :off)"
                    ),
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440099",
                        "kind": "invalid_kind",
                        "label": "Bad",
                        "origin_week": "2024-08-05",
                        "mv": "abhas-lgbm-1.1.2",
                        "sha": "075e81b",
                        "dao": "2025-12-29",
                        "off": 0,
                    },
                )

        # Valid insert + ON DELETE CASCADE from plans -> plan_runs
        plan_id = "550e8400-e29b-41d4-a716-446655440010"
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO plans (id, kind, label, origin_week, model_version, git_sha, data_as_of, offline) "
                    "VALUES (:id, 'allocation', 'Test plan', '2024-08-05', 'abhas-lgbm-1.1.2', '075e81b', '2025-12-29', 0)"
                ),
                {"id": plan_id},
            )
            conn.execute(
                text(
                    "INSERT INTO plan_runs (plan_id, inputs_json, outputs_json, headline_json, solve_ms) "
                    "VALUES (:id, '{}', '{}', '{}', 5.0)"
                ),
                {"id": plan_id},
            )
            conn.execute(text("DELETE FROM plans WHERE id = :id"), {"id": plan_id})
            remaining = conn.execute(
                text("SELECT COUNT(*) FROM plan_runs WHERE plan_id = :id"), {"id": plan_id}
            ).scalar_one()
            assert remaining == 0
    finally:
        engine.dispose()

    # Reversible downgrade to 0001_initial and re-upgrade to head
    command.downgrade(cfg, "0001_initial")
    engine2 = create_db_engine(url)
    try:
        tables_after_down = set(inspect(engine2).get_table_names())
        assert not ({"plans", "plan_runs", "dispatch_log"} & tables_after_down)
        assert "wards" in tables_after_down
    finally:
        engine2.dispose()

    command.upgrade(cfg, "head")
    engine3 = create_db_engine(url)
    try:
        assert {"plans", "plan_runs", "dispatch_log"} <= set(inspect(engine3).get_table_names())
    finally:
        engine3.dispose()


def test_offline_socket_guard_phase2_stubs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Offline placeholder check: ABHAS_OFFLINE=1 + socket guard fails any non-loopback connect."""
    loopback = {"127.0.0.1", "::1", "localhost"}
    real_connect = socket.socket.connect

    def _guarded_connect(self: socket.socket, address: Any) -> Any:
        host = address[0] if isinstance(address, tuple) and address else ""
        if host and str(host) not in loopback:
            raise AssertionError(f"Non-loopback socket connection attempted in offline mode: {address!r}")
        return real_connect(self, address)

    monkeypatch.setenv("ABHAS_OFFLINE", "1")
    monkeypatch.setattr(socket.socket, "connect", _guarded_connect)

    with TestClient(create_app()) as client:
        ready = client.get("/readyz")
        assert ready.status_code == 200
        assert ready.json()["offline"] is True

        for endpoint, payload in (
            ("/api/v1/allocation/plan", {"origin_week": "2024-08-05"}),
            ("/api/v1/overflow/route", {"origin_week": "2024-08-05"}),
            ("/api/v1/simulator/run", {"origin_week": "2024-08-05", "auto_crews": 5}),
            ("/api/v1/dispatch/notices", {"origin_week": "2024-08-05", "scope": "Dhaka South"}),
            (
                "/api/v1/plans",
                {
                    "kind": "allocation",
                    "label": "Offline plan",
                    "request": {"origin_week": "2024-08-05"},
                },
            ),
        ):
            r = client.post(endpoint, json=payload)
            assert r.status_code in (200, 201)
            assert r.json()["offline"] is True

        assert client.get("/api/v1/plans").json()["offline"] is True
        assert (
            client.get(
                "/api/v1/plans/compare",
                params={
                    "a": "550e8400-e29b-41d4-a716-446655440001",
                    "b": "550e8400-e29b-41d4-a716-446655440002",
                },
            ).json()["offline"]
            is True
        )
        r_html = client.get(
            "/api/v1/dispatch/brief/DSCC_Ward_04.html",
            params={"origin_week": "2024-08-05"},
        )
        assert r_html.status_code == 200
        assert "offline=true" in r_html.text
        assert datetime.now(UTC).tzinfo is not None
