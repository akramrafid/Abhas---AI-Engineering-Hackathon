"""Shared pytest configuration, offline marker registration, and non-loopback socket guard (ADR-0015)."""

from __future__ import annotations

import socket
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.core.offline import offline_kill_switch_enabled, reset_offline_state

_LOOPBACK_HOSTS = frozenset({"", "127.0.0.1", "::1", "localhost"})

# Unit tests whose explicit purpose is exercising mocked online adapter transports
# (httpx.MockTransport, _FakeAnthropicClient, FAULT_INJECT=llm_*). When the entire suite runs
# under ABHAS_OFFLINE=1 (WP6-1), we keep the strict socket guard active on these tests while
# unsetting ABHAS_OFFLINE so their in-memory mocks run — still proving zero non-loopback sockets.
_MOCKED_ONLINE_ADAPTER_UNIT_TESTS = frozenset(
    {
        "tests/test_openmeteo.py::test_ac_15_openmeteo_cache_and_fallback",
        "tests/test_openmeteo.py::test_openmeteo_retries_and_circuit_breaker",
        "tests/test_openmeteo.py::test_corner_openmeteo_live_aggregation_dhaka_partial_week_units_and_bias",
        "tests/test_openmeteo.py::test_openmeteo_malformed_payloads_fall_back_and_trip_breaker",
        "tests/test_tracing.py::test_tracing_records_equal_sdk_invocations_on_success",
        "tests/test_tracing.py::test_tracing_records_every_retry_and_failure_attempt",
        "tests/test_tracing.py::test_tracing_bad_json_runs_one_repair_and_emits_validation_failed",
        "tests/test_faults.py::test_llm_timeout_bad_json_and_bad_numbers_fallback",
        "tests/features/chat/test_chat.py::test_gemini_adapter_dual_key_failover_on_429",
    }
)


class OfflineSocketBlockedError(RuntimeError):
    """Raised when code attempts a non-loopback network connection while the socket guard is active."""


@dataclass
class SocketGuardState:
    """Records allowed loopback targets and any blocked external connection attempts."""

    blocked: list[tuple[str, Any]] = field(default_factory=list)
    allowed: list[tuple[str, Any]] = field(default_factory=list)


def _is_loopback_target(family: int, address: Any) -> bool:
    if family not in (socket.AF_INET, socket.AF_INET6):
        return True
    if not isinstance(address, tuple) or not address:
        return True
    host = str(address[0]).strip().lower()
    if host in _LOOPBACK_HOSTS or host.startswith("127."):
        return True
    return False


def install_socket_guard(monkeypatch: pytest.MonkeyPatch) -> SocketGuardState:
    """Patch stdlib socket connect primitives so any non-loopback connection fails immediately."""
    state = SocketGuardState()
    real_connect = socket.socket.connect
    real_connect_ex = socket.socket.connect_ex
    real_create_connection = socket.create_connection

    def _guarded_connect(self: socket.socket, address: Any) -> Any:
        if not _is_loopback_target(self.family, address):
            state.blocked.append(("connect", address))
            raise OfflineSocketBlockedError(
                f"Blocked non-loopback socket.connect({address!r}) under offline socket guard"
            )
        state.allowed.append(("connect", address))
        return real_connect(self, address)

    def _guarded_connect_ex(self: socket.socket, address: Any) -> int:
        if not _is_loopback_target(self.family, address):
            state.blocked.append(("connect_ex", address))
            raise OfflineSocketBlockedError(
                f"Blocked non-loopback socket.connect_ex({address!r}) under offline socket guard"
            )
        state.allowed.append(("connect_ex", address))
        return real_connect_ex(self, address)

    def _guarded_create_connection(address: tuple[str, int], *args: Any, **kwargs: Any) -> socket.socket:
        if not _is_loopback_target(socket.AF_INET, address):
            state.blocked.append(("create_connection", address))
            raise OfflineSocketBlockedError(
                f"Blocked non-loopback socket.create_connection({address!r}) under offline socket guard"
            )
        state.allowed.append(("create_connection", address))
        return real_create_connection(address, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", _guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", _guarded_connect_ex)
    monkeypatch.setattr(socket, "create_connection", _guarded_create_connection)
    return state


def pytest_configure(config: pytest.Config) -> None:
    """Register the `offline` pytest marker without modifying pyproject.toml."""
    config.addinivalue_line(
        "markers",
        "offline: offline resilience, kill switch, circuit breaker, and socket-guard verification tests",
    )


@pytest.fixture
def socket_guard(monkeypatch: pytest.MonkeyPatch) -> SocketGuardState:
    """Block every non-loopback TCP/UDP connection for the duration of a test."""
    return install_socket_guard(monkeypatch)


@pytest.fixture(autouse=True)
def _offline_isolation_and_guard(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Reset offline controller between tests and enforce socket guard under ABHAS_OFFLINE=1 or -m offline."""
    reset_offline_state()
    kill_switch_active = offline_kill_switch_enabled()
    is_offline_marked = request.node.get_closest_marker("offline") is not None

    if (kill_switch_active or is_offline_marked) and "socket_guard" not in request.fixturenames:
        install_socket_guard(monkeypatch)

    if kill_switch_active:
        base_nodeid = request.node.nodeid.split("[", 1)[0]
        if base_nodeid in _MOCKED_ONLINE_ADAPTER_UNIT_TESTS:
            monkeypatch.setenv("ABHAS_OFFLINE", "0")

    try:
        yield
    finally:
        reset_offline_state()
