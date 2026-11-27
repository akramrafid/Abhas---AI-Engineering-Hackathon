"""Offline resilience, circuit breaker, background probe, and plans decision-log tests (WP6-1..WP6-4)."""

from __future__ import annotations

import asyncio
import socket
import threading
import time
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.adapters.db.engine import create_db_engine
from app.adapters.db.models import ObservationRow, WardRow
from app.adapters.db.plan_store import SqlPlanStore
from app.adapters.db.repositories import SqlCallLog, SqlObservationRepository, SqlWeatherCache
from app.adapters.gemini_chat import GeminiChatAdapter
from app.adapters.llm import AnthropicLLM
from app.adapters.openmeteo import OpenMeteoWeatherSource
from app.core.config import API_DIR, Settings
from app.core.offline import (
    DEFAULT_CONNECT_TIMEOUT_S,
    DEFAULT_PROBE_INTERVAL_S,
    CircuitBreaker,
    OfflineController,
)
from app.core.types import CITIES
from app.features.plans.deps import get_plans_service
from app.features.plans.schemas import PlanComparison, PlanList, PlanRecord
from app.features.plans.service import PlansService
from app.main import create_app
from app.ports.chat_llm import ChatLLMUnavailableError, ChatTurnInput
from app.ports.llm import LLMUnavailableError

from .conftest import OfflineSocketBlockedError, SocketGuardState


def _migrated_db_engine(tmp_path: Path, name: str = "wp6_test.sqlite"):
    db_file = tmp_path / name
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    return create_db_engine(url)


def _seed_minimal_wards(engine: Any) -> None:
    prefixes = {
        "Dhaka North": "DNCC",
        "Dhaka South": "DSCC",
        "Chattogram": "CCC",
        "Gazipur": "GCC",
        "Narayanganj": "NCC",
    }
    wards = [
        {
            "ward_id": f"{prefixes[c]}_Ward_01",
            "city": c,
            "population_density_sqkm": 40000.0,
            "water_logging_risk_index": 0.65,
            "sanitation_score": 0.55,
        }
        for c in CITIES
    ]
    base_week = date(2023, 8, 7)
    obs = [
        {
            "ward_id": w["ward_id"],
            "week": base_week + timedelta(weeks=i),
            "avg_temp_c": 29.0,
            "max_temp_c": 33.0,
            "min_temp_c": 26.0,
            "rainfall_mm": 75.0,
            "relative_humidity_pct": 83.0,
            "dengue_cases": 8,
        }
        for w in wards
        for i in range(4)
    ]
    with engine.begin() as conn:
        conn.execute(WardRow.__table__.insert(), wards)
        conn.execute(ObservationRow.__table__.insert(), obs)


@pytest.mark.offline
def test_socket_guard_blocks_non_loopback_and_allows_loopback(socket_guard: SocketGuardState) -> None:
    """Socket guard rejects external TCP connections while permitting loopback sockets."""
    with pytest.raises(OfflineSocketBlockedError):
        socket.create_connection(("api.open-meteo.com", 443), timeout=0.5)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(OfflineSocketBlockedError):
            sock.connect(("1.1.1.1", 443))

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(OfflineSocketBlockedError):
            sock.connect_ex(("8.8.8.8", 53))

    assert len(socket_guard.blocked) == 3

    # Loopback listener + client must remain allowed
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        with socket.create_connection(("127.0.0.1", port), timeout=1.0) as cli:
            assert cli.getpeername()[0] == "127.0.0.1"


@pytest.mark.offline
def test_wp6_1_offline_kill_switch_zero_external_sockets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    socket_guard: SocketGuardState,
) -> None:
    """WP6-1: With ABHAS_OFFLINE=1 and socket guard, Phase 1+2 endpoints work with zero external calls and offline: true."""
    monkeypatch.setenv("ABHAS_OFFLINE", "1")
    monkeypatch.setenv("ABHAS_GIT_SHA", "075e81b")

    plan_engine = _migrated_db_engine(tmp_path, "wp6_1_plans.sqlite")
    try:
        app = create_app()
        store = SqlPlanStore(plan_engine)
        app.dependency_overrides[get_plans_service] = lambda: PlansService(store=store)

        with TestClient(app) as client:
            ready = client.get("/readyz")
            assert ready.status_code == 200
            assert ready.json()["offline"] is True

            # Phase 1 endpoints keep working cleanly offline
            assert client.get("/api/v1/wards").status_code == 200
            assert client.get("/api/v1/weather/status").status_code == 200
            fc = client.post(
                "/api/v1/forecast",
                json={
                    "ward_ids": ["DSCC_Ward_04"],
                    "origin_week": "2024-08-05",
                    "horizons": [2, 3, 4],
                    "source": "live",
                },
            )
            assert fc.status_code == 200
            assert fc.json()["weather_source"] in ("dataset", "cache", "climatology")

            adv = client.post(
                "/api/v1/advisory",
                json={"ward_id": "DSCC_Ward_04", "origin_week": "2024-08-05", "horizon": 3, "language": "en"},
            )
            assert adv.status_code == 200
            assert adv.json()["source"] == "template"

            chat = client.post(
                "/api/v1/chat",
                json={"message": "What is the forecast for DSCC_Ward_04?"},
            )
            assert chat.status_code == 200
            assert chat.json()["source"] == "grounded_fallback"

            # Every Phase 2 JSON endpoint reports offline: true
            p2_posts = [
                ("/api/v1/allocation/plan", {"origin_week": "2024-08-05", "stock_pct": 60}),
                ("/api/v1/overflow/route", {"origin_week": "2024-08-05", "horizon": 3}),
                ("/api/v1/simulator/run", {"origin_week": "2024-08-05", "auto_crews": 10}),
                ("/api/v1/dispatch/notices", {"origin_week": "2024-08-05", "scope": "Dhaka South"}),
            ]
            for path, payload in p2_posts:
                resp = client.post(path, json=payload)
                assert resp.status_code == 200, resp.text
                assert resp.json()["offline"] is True

            p1 = client.post(
                "/api/v1/plans",
                json={
                    "kind": "allocation",
                    "label": "Offline baseline",
                    "request": {"origin_week": "2024-08-05", "stock_pct": 60},
                },
            )
            p2 = client.post(
                "/api/v1/plans",
                json={
                    "kind": "overflow",
                    "label": "Offline overflow",
                    "request": {"origin_week": "2024-08-05", "horizon": 3},
                },
            )
            assert p1.status_code == 201 and p1.json()["offline"] is True
            assert p2.status_code == 201 and p2.json()["offline"] is True

            listed = client.get("/api/v1/plans")
            assert listed.status_code == 200 and listed.json()["offline"] is True

            compared = client.get(
                "/api/v1/plans/compare",
                params={"a": p1.json()["id"], "b": p2.json()["id"]},
            )
            assert compared.status_code == 200 and compared.json()["offline"] is True

            brief = client.get(
                "/api/v1/dispatch/brief/DSCC_Ward_04.html",
                params={"origin_week": "2024-08-05"},
            )
            assert brief.status_code == 200
            assert "offline=true" in brief.text

        assert socket_guard.blocked == []
    finally:
        plan_engine.dispose()


@pytest.mark.offline
def test_wp6_3_background_probe_flips_offline_and_no_startup_network(
    monkeypatch: pytest.MonkeyPatch,
    socket_guard: SocketGuardState,
) -> None:
    """WP6-3: Startup makes zero network calls; cutting network without kill switch flips offline within <=30 s."""
    monkeypatch.setenv("ABHAS_OFFLINE", "0")
    assert DEFAULT_CONNECT_TIMEOUT_S == 2.0
    assert DEFAULT_PROBE_INTERVAL_S + DEFAULT_CONNECT_TIMEOUT_S <= 30.0

    # Startup under socket guard must make zero external connections
    with TestClient(create_app()) as client:
        ready = client.get("/readyz")
        assert ready.status_code == 200
        assert ready.json()["offline"] is False
    assert socket_guard.blocked == []

    # Simulate live network cut with background probe (no kill switch)
    network_up = threading.Event()
    network_up.set()
    seen_timeouts: list[float] = []

    def fake_probe(timeout_s: float) -> bool:
        seen_timeouts.append(timeout_s)
        return network_up.is_set()

    controller = OfflineController(
        connect_timeout_s=DEFAULT_CONNECT_TIMEOUT_S,
        probe_interval_s=0.02,
        probe_fn=fake_probe,
    )
    monkeypatch.setattr("app.core.offline.get_offline_controller", lambda: controller)
    controller.start()
    try:
        # Immediately after start(), startup probe count is 0 (probe sleeps before running)
        assert controller.is_offline() is False

        # Wait for at least one healthy probe
        deadline = time.monotonic() + 2.0
        while controller.probe_runs < 1 and time.monotonic() < deadline:
            time.sleep(0.01)
        assert controller.probe_runs >= 1
        assert controller.is_offline() is False
        assert seen_timeouts[0] == 2.0

        # Cut the network while running (still ABHAS_OFFLINE=0)
        network_up.clear()
        deadline = time.monotonic() + 2.0
        while not controller.is_offline() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert controller.is_offline() is True

        with TestClient(create_app()) as client:
            r_ready = client.get("/readyz")
            assert r_ready.status_code == 200
            assert r_ready.json()["offline"] is True

            r_alloc = client.post("/api/v1/allocation/plan", json={"origin_week": "2024-08-05"})
            assert r_alloc.status_code == 200
            assert r_alloc.json()["offline"] is True

        # Restore network -> probe recovers back to online
        network_up.set()
        deadline = time.monotonic() + 2.0
        while controller.is_offline() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert controller.is_offline() is False
    finally:
        controller.stop()


@pytest.mark.offline
def test_circuit_breaker_opens_after_3_and_half_open_after_60s() -> None:
    """Circuit breaker opens after 3 failures for 60 s, allows 1 half-open probe, and closes on success."""
    now = [100.0]
    breaker = CircuitBreaker(threshold=3, cooldown_s=60.0, clock=lambda: now[0])

    assert breaker.state == "closed"
    assert breaker.allow_request() is True

    # Failures 1 and 2 keep breaker closed
    breaker.record_failure()
    assert breaker.state == "closed"
    assert breaker.allow_request() is True
    breaker.record_failure()
    assert breaker.state == "closed"
    assert breaker.allow_request() is True

    # Failure 3 opens the breaker for 60 s
    breaker.record_failure()
    assert breaker.state == "open"
    assert breaker.allow_request() is False

    # Still open at +59.9 s
    now[0] = 159.9
    assert breaker.state == "open"
    assert breaker.allow_request() is False

    # Half-open at +60.0 s: permits exactly one probe request
    now[0] = 160.0
    assert breaker.state == "half_open"
    assert breaker.allow_request() is True
    assert breaker.allow_request() is False  # Concurrent second caller blocked while probe is in-flight

    # Failed probe immediately re-opens for another 60 s
    breaker.record_failure()
    assert breaker.state == "open"
    assert breaker.allow_request() is False

    now[0] = 219.9
    assert breaker.state == "open"
    assert breaker.allow_request() is False

    # Half-open again at +60.0 s -> success closes the breaker
    now[0] = 220.0
    assert breaker.state == "half_open"
    assert breaker.allow_request() is True
    breaker.record_success()
    assert breaker.state == "closed"
    assert breaker.consecutive_failures == 0
    assert breaker.allow_request() is True


@pytest.mark.offline
@pytest.mark.parametrize(("threshold", "cooldown_s"), [(1, 10.0), (3, 60.0), (5, 120.0)])
def test_circuit_breaker_parametrized_invariants(threshold: int, cooldown_s: float) -> None:
    """Breaker stays closed for < threshold failures, opens at threshold, half-opens at cooldown_s."""
    now = [500.0]
    breaker = CircuitBreaker(threshold=threshold, cooldown_s=cooldown_s, clock=lambda: now[0])
    for _ in range(threshold - 1):
        breaker.record_failure()
        assert breaker.state == "closed"
        assert breaker.allow_request() is True

    breaker.record_failure()
    assert breaker.state == "open"
    assert breaker.allow_request() is False

    now[0] += cooldown_s - 0.01
    assert breaker.state == "open"
    now[0] += 0.01
    assert breaker.state == "half_open"
    assert breaker.allow_request() is True


@pytest.mark.offline
def test_external_adapters_offline_short_circuit_and_breaker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    socket_guard: SocketGuardState,
) -> None:
    """Open-Meteo, Anthropic, and Gemini adapters short-circuit offline and open after 3 failures for 60 s."""
    engine = _migrated_db_engine(tmp_path, "wp6_adapters.sqlite")
    try:
        _seed_minimal_wards(engine)
        repo = SqlObservationRepository(engine)
        wcache = SqlWeatherCache(engine)
        call_log = SqlCallLog(engine)
        target_week = date(2025, 8, 4)

        # 1) Open-Meteo: ABHAS_OFFLINE=1 makes 0 HTTP calls and falls back to climatology
        monkeypatch.setenv("ABHAS_OFFLINE", "1")
        om_calls = 0

        def om_handler(_req: httpx.Request) -> httpx.Response:
            nonlocal om_calls
            om_calls += 1
            return httpx.Response(503)

        now_dt = [datetime(2025, 8, 10, 6, 0, tzinfo=UTC)]
        om_client = httpx.Client(transport=httpx.MockTransport(om_handler), timeout=2.0)
        om = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=wcache,
            call_log=call_log,
            mode="live",
            app_env="test",
            client=om_client,
            clock=lambda: now_dt[0],
            retry_base_s=0.0,
        )
        rows = om.weekly("Dhaka South", [target_week])
        assert rows[0].source == "climatology"
        assert om_calls == 0

        # Online mode: 3 failures (400 = non-retryable) open breaker for 60 s -> 4th call skips HTTP
        monkeypatch.setenv("ABHAS_OFFLINE", "0")
        bad_calls = 0

        def om_400(_req: httpx.Request) -> httpx.Response:
            nonlocal bad_calls
            bad_calls += 1
            return httpx.Response(400)

        om_client2 = httpx.Client(transport=httpx.MockTransport(om_400), timeout=2.0)
        om2 = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=None,
            call_log=call_log,
            mode="live",
            app_env="test",
            client=om_client2,
            clock=lambda: now_dt[0],
            retry_base_s=0.0,
        )
        for expected in (1, 2, 3):
            assert om2.weekly("Dhaka South", [target_week])[0].source == "climatology"
            assert bad_calls == expected
        # 4th call blocked by open breaker
        assert om2.weekly("Dhaka South", [target_week])[0].source == "climatology"
        assert bad_calls == 3
        # Advance 60 s -> half-open allows 1 probe
        now_dt[0] = now_dt[0] + timedelta(seconds=60)
        assert om2.weekly("Dhaka South", [target_week])[0].source == "climatology"
        assert bad_calls == 4
        om_client.close()
        om_client2.close()

        # 2) AnthropicLLM: ABHAS_OFFLINE=1 short-circuits with 0 SDK invocations; breaker opens after 3 failures
        class _FailingMessages:
            def __init__(self) -> None:
                self.calls = 0

            def create(self, **_kwargs: Any) -> Any:
                self.calls += 1
                raise httpx.TimeoutException("connect timeout")

        class _FailingAnthropic:
            def __init__(self) -> None:
                self.messages = _FailingMessages()

            def close(self) -> None:
                pass

        fake_anthropic = _FailingAnthropic()
        mono = [10.0]
        llm = AnthropicLLM(
            api_key="test-key",
            client=fake_anthropic,
            settings=Settings(app_env="test"),
            retry_base_s=0.0,
            clock=lambda: mono[0],
        )
        monkeypatch.setenv("ABHAS_OFFLINE", "1")
        with pytest.raises(LLMUnavailableError, match="Offline"):
            llm.complete_json("sys", "user", {}, 100)
        assert fake_anthropic.messages.calls == 0

        monkeypatch.setenv("ABHAS_OFFLINE", "0")
        for _ in range(3):
            with pytest.raises(LLMUnavailableError):
                llm.complete_json("sys", "user", {}, 100)
        calls_after_3 = fake_anthropic.messages.calls
        assert calls_after_3 > 0
        # 4th call short-circuits on open breaker (0 additional SDK calls)
        with pytest.raises(LLMUnavailableError, match="circuit breaker"):
            llm.complete_json("sys", "user", {}, 100)
        assert fake_anthropic.messages.calls == calls_after_3

        # 3) GeminiChatAdapter: ABHAS_OFFLINE=1 short-circuits complete & stream; breaker opens after 3 failures
        gem_calls = 0

        def gem_400(_req: httpx.Request) -> httpx.Response:
            nonlocal gem_calls
            gem_calls += 1
            return httpx.Response(400, json={"error": {"code": 400, "message": "bad request"}})

        async def _check_gemini() -> None:
            nonlocal gem_calls
            cfg = Settings(_env_file=None, gemini_api_key="AQ.TestKey123456789012345")  # type: ignore[call-arg,arg-type]
            g_mono = [20.0]
            async with httpx.AsyncClient(transport=httpx.MockTransport(gem_400), timeout=2.0) as gclient:
                adapter = GeminiChatAdapter(settings=cfg, client=gclient, clock=lambda: g_mono[0])
                monkeypatch.setenv("ABHAS_OFFLINE", "1")
                with pytest.raises(ChatLLMUnavailableError, match="Offline"):
                    await adapter.complete(
                        system="sys",
                        messages=[ChatTurnInput(role="user", content="Hi")],
                        max_output_tokens=32,
                    )
                with pytest.raises(ChatLLMUnavailableError, match="Offline"):
                    async for _chunk in adapter.stream(
                        system="sys",
                        messages=[ChatTurnInput(role="user", content="Hi")],
                        max_output_tokens=32,
                    ):
                        pass
                assert gem_calls == 0

                monkeypatch.setenv("ABHAS_OFFLINE", "0")
                for expected_g in (1, 2, 3):
                    with pytest.raises(ChatLLMUnavailableError):
                        await adapter.complete(
                            system="sys",
                            messages=[ChatTurnInput(role="user", content="Hi")],
                            max_output_tokens=32,
                        )
                    assert gem_calls == expected_g

                # 4th call blocked by open breaker (0 extra HTTP calls)
                with pytest.raises(ChatLLMUnavailableError, match="circuit breaker"):
                    await adapter.complete(
                        system="sys",
                        messages=[ChatTurnInput(role="user", content="Hi")],
                        max_output_tokens=32,
                    )
                assert gem_calls == 3

                # After 60 s -> half-open permits 1 probe
                g_mono[0] += 60.0
                with pytest.raises(ChatLLMUnavailableError):
                    await adapter.complete(
                        system="sys",
                        messages=[ChatTurnInput(role="user", content="Hi")],
                        max_output_tokens=32,
                    )
                assert gem_calls == 4

        asyncio.run(_check_gemini())
        assert socket_guard.blocked == []
    finally:
        engine.dispose()


@pytest.mark.offline
def test_wp6_4_plans_roundtrip_list_compare_and_append_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    socket_guard: SocketGuardState,
) -> None:
    """WP6-4: POST/GET/compare plans round-trip in SQLite with exact metric deltas, 404 unknown-plan, and append-only."""
    monkeypatch.setenv("ABHAS_OFFLINE", "1")
    monkeypatch.setenv("ABHAS_GIT_SHA", "abcdef1")

    engine = _migrated_db_engine(tmp_path, "wp6_plans.sqlite")
    try:
        store = SqlPlanStore(engine)

        def deterministic_runner(kind: str, req: Any) -> tuple[dict[str, Any], dict[str, Any]]:
            if kind == "allocation":
                stock = int(req.stock_pct)
                crews = int(req.total_crews)
                fulfil = 78.4 if stock == 60 else 91.2
                crit = 7 if stock == 60 else 3
                deficits = 12 if stock == 60 else 6
                return (
                    {
                        "model_version": "abhas-lgbm-1.1.2",
                        "scope": req.scope,
                        "stock_pct": stock,
                        "total_crews": crews,
                        "mean_fulfilment_pct": fulfil,
                    },
                    {
                        "stock_pct": stock,
                        "mean_fulfilment_pct": fulfil,
                        "critical_wards": crit,
                        "deficit_wards": deficits,
                        "crews": crews,
                    },
                )
            if kind == "overflow":
                return (
                    {"model_version": "abhas-lgbm-1.1.2", "unroutable_patients": 4},
                    {"unroutable_patients": 4},
                )
            if kind == "simulation":
                crews_used = int(req.auto_crews or sum(d.crews for d in (req.deployments or [])))
                return (
                    {"model_version": "abhas-lgbm-1.1.2", "cases_prevented": round(crews_used * 2.5, 2)},
                    {"crews": crews_used, "cases_prevented": round(crews_used * 2.5, 2)},
                )
            return (
                {"model_version": "abhas-lgbm-1.1.2", "notices": 25},
                {"notices": 25},
            )

        app = create_app()
        app.dependency_overrides[get_plans_service] = lambda: PlansService(
            store=store, runner=deterministic_runner
        )

        with TestClient(app) as client:
            # Save two allocation plans (60% vs 80% stock), plus simulation, overflow, and dispatch plans
            r_a = client.post(
                "/api/v1/plans",
                json={
                    "kind": "allocation",
                    "label": "Dhaka South 60% stock",
                    "request": {
                        "scope": "Dhaka South",
                        "origin_week": "2024-08-05",
                        "stock_pct": 60,
                        "total_crews": 10,
                    },
                },
            )
            assert r_a.status_code == 201, r_a.text
            plan_a = PlanRecord.model_validate(r_a.json())
            assert plan_a.git_sha == "abcdef1"
            assert plan_a.offline is True
            assert plan_a.outputs["stock_pct"] == 60

            time.sleep(0.01)
            r_b = client.post(
                "/api/v1/plans",
                json={
                    "kind": "allocation",
                    "label": "Dhaka South 80% stock",
                    "request": {
                        "scope": "Dhaka South",
                        "origin_week": "2024-08-05",
                        "stock_pct": 80,
                        "total_crews": 14,
                    },
                },
            )
            assert r_b.status_code == 201, r_b.text
            plan_b = PlanRecord.model_validate(r_b.json())

            time.sleep(0.01)
            r_sim = client.post(
                "/api/v1/plans",
                json={
                    "kind": "simulation",
                    "label": "10 crews auto",
                    "request": {"origin_week": "2024-08-05", "auto_crews": 10, "efficacy": "base"},
                },
            )
            assert r_sim.status_code == 201
            plan_sim = PlanRecord.model_validate(r_sim.json())

            time.sleep(0.01)
            r_ovf = client.post(
                "/api/v1/plans",
                json={
                    "kind": "overflow",
                    "label": "Dhaka North overflow",
                    "request": {"scope": "Dhaka North", "origin_week": "2024-08-05", "horizon": 3},
                },
            )
            assert r_ovf.status_code == 201
            plan_ovf = PlanRecord.model_validate(r_ovf.json())

            # GET /api/v1/plans returns newest first & supports kind and limit filters
            r_all = client.get("/api/v1/plans", params={"limit": 10})
            assert r_all.status_code == 200
            all_list = PlanList.model_validate(r_all.json())
            assert [p.id for p in all_list.plans[:4]] == [plan_ovf.id, plan_sim.id, plan_b.id, plan_a.id]

            r_alloc_only = client.get("/api/v1/plans", params={"kind": "allocation", "limit": 1})
            assert r_alloc_only.status_code == 200
            alloc_list = PlanList.model_validate(r_alloc_only.json())
            assert len(alloc_list.plans) == 1
            assert alloc_list.plans[0].id == plan_b.id

            # WP6-4: Compare plan A (60% stock) vs plan B (80% stock)
            r_cmp = client.get("/api/v1/plans/compare", params={"a": plan_a.id, "b": plan_b.id})
            assert r_cmp.status_code == 200
            cmp_res = PlanComparison.model_validate(r_cmp.json())
            assert cmp_res.offline is True
            by_metric = {d.metric: d for d in cmp_res.diffs}

            assert by_metric["stock_pct"].a == 60
            assert by_metric["stock_pct"].b == 80
            assert by_metric["stock_pct"].delta == pytest.approx(20.0)

            assert by_metric["mean_fulfilment_pct"].a == pytest.approx(78.4)
            assert by_metric["mean_fulfilment_pct"].b == pytest.approx(91.2)
            assert by_metric["mean_fulfilment_pct"].delta == pytest.approx(12.8)

            assert by_metric["critical_wards"].a == 7
            assert by_metric["critical_wards"].b == 3
            assert by_metric["critical_wards"].delta == pytest.approx(-4.0)

            assert by_metric["deficit_wards"].delta == pytest.approx(-6.0)
            assert by_metric["crews"].delta == pytest.approx(4.0)
            assert by_metric["cases_prevented"].delta is None
            assert by_metric["unroutable_patients"].delta is None

            # Cross-kind comparison (simulation vs overflow) allowed; absent metrics have delta: None
            r_cross = client.get("/api/v1/plans/compare", params={"a": plan_sim.id, "b": plan_ovf.id})
            assert r_cross.status_code == 200
            cross_by_metric = {d.metric: d for d in PlanComparison.model_validate(r_cross.json()).diffs}
            assert cross_by_metric["cases_prevented"].a == pytest.approx(25.0)
            assert cross_by_metric["cases_prevented"].b is None
            assert cross_by_metric["cases_prevented"].delta is None
            assert cross_by_metric["unroutable_patients"].a is None
            assert cross_by_metric["unroutable_patients"].b == 4
            assert cross_by_metric["unroutable_patients"].delta is None

            # Unknown plan UUID -> 404 application/problem+json with slug unknown-plan
            r_404 = client.get(
                "/api/v1/plans/compare",
                params={"a": plan_a.id, "b": "00000000-0000-0000-0000-000000000000"},
            )
            assert r_404.status_code == 404
            assert r_404.headers["content-type"].startswith("application/problem+json")
            assert r_404.json()["type"].endswith("/unknown-plan")

            # Append-only invariant: PUT / DELETE are not exposed (405)
            assert client.put("/api/v1/plans", json={}).status_code == 405
            assert client.delete("/api/v1/plans").status_code == 405

        assert socket_guard.blocked == []
    finally:
        engine.dispose()


def test_plans_store_direct_persistence_sequence(tmp_path: Path) -> None:
    """SqlPlanStore persists and retrieves plans cleanly across new connections."""
    engine = _migrated_db_engine(tmp_path, "wp6_direct_store.sqlite")
    try:
        store = SqlPlanStore(engine)
        assert store.list() == []
        assert store.get("550e8400-e29b-41d4-a716-446655440001") is None

        svc = PlansService(
            store=store,
            runner=lambda _k, _r: ({"ok": True}, {"crews": 4, "cases_prevented": 12.5}),
        )
        from app.core.command_requests import SimulationPlanCreate, SimulatorRequest

        rec = svc.create(
            SimulationPlanCreate(
                kind="simulation",
                label="Direct store test",
                request=SimulatorRequest(origin_week=date(2024, 8, 5), auto_crews=4, efficacy="base"),
            )
        )
        fetched = store.get(rec.id)
        assert fetched is not None
        assert fetched.id == rec.id
        assert fetched.label == "Direct store test"
        assert fetched.solve_ms >= 0.0
        listed: Sequence[Any] = store.list(kind="simulation", limit=5)
        assert len(listed) == 1
        assert listed[0].id == rec.id
    finally:
        engine.dispose()


def test_gemini_budget_checked_before_half_open_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    """L3: Budget check runs before breaker.allow_request(), so a budget error never consumes the half-open probe."""
    import asyncio

    from app.adapters.gemini_chat import GeminiChatAdapter
    from app.ports.chat_llm import ChatBudgetExceededError, ChatTurnInput

    monkeypatch.setenv("ABHAS_OFFLINE", "0")
    now = [100.0]

    class _OverBudgetLog:
        def today(self, kind: str) -> tuple[int, float]:
            return (10, 10.0)

        def record(self, *args: Any, **kwargs: Any) -> None:
            pass

    adapter = GeminiChatAdapter(
        api_key="test-fake-key",
        model="gemini-2.5-flash",
        daily_budget_usd=1.0,
        call_log=_OverBudgetLog(),  # type: ignore[arg-type]
        clock=lambda: now[0],
        breaker_threshold=3,
        breaker_cooldown_s=60.0,
    )
    for _ in range(3):
        adapter._breaker.record_failure()
    assert adapter._breaker.state == "open"

    # Advance past cooldown so the breaker is ready for a single half-open probe.
    now[0] = 161.0
    assert adapter._breaker.state == "half_open"

    with pytest.raises(ChatBudgetExceededError, match="budget"):
        asyncio.run(
            adapter.complete(
                system="sys",
                messages=[ChatTurnInput(role="user", content="hello")],
                max_output_tokens=64,
            )
        )

    # Probe slot must NOT have been consumed by the budget error!
    assert adapter._breaker.allow_request() is True


def test_plan_label_rejects_control_and_bidi(tmp_path: Path) -> None:
    """L7 (QA Q8): POST /api/v1/plans rejects control chars & bidi overrides with 422, accepts Bangla labels."""
    engine = _migrated_db_engine(tmp_path, "wp6_label_validation.sqlite")
    try:
        store = SqlPlanStore(engine)
        svc = PlansService(
            store=store,
            runner=lambda _k, _r: ({"ok": True}, {"stock_pct": 60}),
        )
        app = create_app()
        app.dependency_overrides[get_plans_service] = lambda: svc

        with TestClient(app) as client:
            for bad_label in ("a\u202eb", "bad\x00null", "line1\nline2", "iso\u2066override"):
                r = client.post(
                    "/api/v1/plans",
                    json={
                        "kind": "allocation",
                        "label": bad_label,
                        "request": {"origin_week": "2024-08-05", "stock_pct": 60},
                    },
                )
                assert r.status_code == 422, f"Expected 422 for {bad_label!r}, got {r.status_code}"
                assert r.headers["content-type"].startswith("application/problem+json")

            ok = client.post(
                "/api/v1/plans",
                json={
                    "kind": "allocation",
                    "label": "Monsoon plan ৬০%",
                    "request": {"origin_week": "2024-08-05", "stock_pct": 60},
                },
            )
            assert ok.status_code == 201, ok.text
            assert ok.json()["label"] == "Monsoon plan ৬০%"
    finally:
        engine.dispose()
