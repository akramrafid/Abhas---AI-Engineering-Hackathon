"""Offline resilience controller, kill switch, background probe, and circuit breaker (ADR-0015).

Guarantees:
- `ABHAS_OFFLINE=1` immediately forces every external adapter into offline mode.
- Background connectivity probe uses a strict 2 s TCP connect timeout, NEVER runs at startup,
  and NEVER executes on any HTTP request path.
- `CircuitBreaker` opens after 3 consecutive failures for 60 s, then transitions to half-open
  to allow a single probe request (deterministic with an injectable clock).
"""

from __future__ import annotations

import logging
import os
import socket
import threading
import time
from collections.abc import Callable
from typing import Literal

logger = logging.getLogger("abhas.offline")

_TRUTHY_OFFLINE = frozenset({"1", "true", "yes", "on"})
_FALSY_PROBE = frozenset({"0", "false", "no", "off"})

DEFAULT_CONNECT_TIMEOUT_S = 2.0
DEFAULT_BREAKER_THRESHOLD = 3
DEFAULT_BREAKER_COOLDOWN_S = 60.0
DEFAULT_PROBE_INTERVAL_S = 20.0
DEFAULT_PROBE_HOST = "api.open-meteo.com"
DEFAULT_PROBE_PORT = 443

BreakerState = Literal["closed", "open", "half_open"]
ProbeFn = Callable[[float], bool]


def offline_kill_switch_enabled() -> bool:
    """Return True when the ABHAS_OFFLINE kill switch environment variable is set."""
    return os.environ.get("ABHAS_OFFLINE", "").strip().lower() in _TRUTHY_OFFLINE


class CircuitBreaker:
    """Thread-safe 3-state circuit breaker (closed -> open -> half_open) with injectable clock."""

    def __init__(
        self,
        *,
        threshold: int = DEFAULT_BREAKER_THRESHOLD,
        cooldown_s: float = DEFAULT_BREAKER_COOLDOWN_S,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if threshold < 1:
            raise ValueError("threshold must be >= 1")
        if cooldown_s < 0:
            raise ValueError("cooldown_s must be >= 0")
        self._threshold = int(threshold)
        self._cooldown_s = float(cooldown_s)
        self._clock: Callable[[], float] = clock or time.monotonic
        self._lock = threading.RLock()
        self._consecutive_failures = 0
        self._open_until: float | None = None
        self._half_open_probe_in_flight = False

    @property
    def consecutive_failures(self) -> int:
        with self._lock:
            return self._consecutive_failures

    @property
    def state(self) -> BreakerState:
        with self._lock:
            if self._open_until is None:
                return "closed"
            if self._clock() < self._open_until:
                return "open"
            return "half_open"

    def allow_request(self) -> bool:
        """Return True if a call may proceed (closed, or first probe in half_open)."""
        with self._lock:
            if self._open_until is None:
                return True
            if self._clock() < self._open_until:
                return False
            if self._half_open_probe_in_flight:
                return False
            self._half_open_probe_in_flight = True
            return True

    def record_success(self) -> None:
        """Close the breaker and clear failure counters."""
        with self._lock:
            self._consecutive_failures = 0
            self._open_until = None
            self._half_open_probe_in_flight = False

    def record_failure(self) -> None:
        """Increment failures and open (or re-open from half_open) for cooldown_s seconds."""
        with self._lock:
            if self._half_open_probe_in_flight:
                self._half_open_probe_in_flight = False
                self._consecutive_failures = max(self._threshold, self._consecutive_failures + 1)
                self._open_until = self._clock() + self._cooldown_s
                return
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._threshold:
                self._open_until = self._clock() + self._cooldown_s

    def reset(self) -> None:
        """Reset breaker back to closed state (primarily for tests)."""
        self.record_success()


def _tcp_connect_probe(host: str, port: int, timeout_s: float) -> bool:
    """Attempt a single bounded TCP connect; never blocks longer than timeout_s."""
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


class OfflineController:
    """Tracks offline state via kill switch + optional non-startup background probe (ADR-0015)."""

    def __init__(
        self,
        *,
        probe_host: str = DEFAULT_PROBE_HOST,
        probe_port: int = DEFAULT_PROBE_PORT,
        connect_timeout_s: float = DEFAULT_CONNECT_TIMEOUT_S,
        probe_interval_s: float = DEFAULT_PROBE_INTERVAL_S,
        probe_fn: ProbeFn | None = None,
    ) -> None:
        self._probe_host = probe_host
        self._probe_port = int(probe_port)
        self._connect_timeout_s = float(connect_timeout_s)
        self._probe_interval_s = float(probe_interval_s)
        self._probe_fn: ProbeFn = probe_fn or (
            lambda timeout_s: _tcp_connect_probe(self._probe_host, self._probe_port, timeout_s)
        )
        self._lock = threading.RLock()
        self._network_down = False
        self._probe_runs = 0
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def network_down(self) -> bool:
        with self._lock:
            return self._network_down

    @property
    def probe_runs(self) -> int:
        with self._lock:
            return self._probe_runs

    def is_offline(self) -> bool:
        """Non-blocking read of current offline status (kill switch OR detected network outage)."""
        if offline_kill_switch_enabled():
            return True
        with self._lock:
            return self._network_down

    def mark_network_down(self) -> None:
        with self._lock:
            self._network_down = True

    def mark_network_up(self) -> None:
        with self._lock:
            self._network_down = False

    def probe_once(self) -> bool:
        """Run one 2 s connectivity probe (skips network when ABHAS_OFFLINE=1)."""
        if offline_kill_switch_enabled():
            with self._lock:
                self._network_down = True
            return False
        ok = False
        try:
            ok = bool(self._probe_fn(self._connect_timeout_s))
        except Exception:  # noqa: BLE001
            ok = False
        with self._lock:
            prev = self._network_down
            self._network_down = not ok
            self._probe_runs += 1
        if prev != (not ok):
            logger.info(
                "offline_probe_transition",
                extra={"event": "offline_probe_transition", "offline": not ok},
            )
        return ok

    def start(self) -> None:
        """Start daemon background probe. Sleeps first so startup makes zero network calls."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()

            def _loop() -> None:
                while not self._stop_event.wait(self._probe_interval_s):
                    self.probe_once()

            self._thread = threading.Thread(
                target=_loop,
                name="abhas-offline-probe",
                daemon=True,
            )
            self._thread.start()

    def stop(self, timeout_s: float = 2.0) -> None:
        """Stop the background probe thread cleanly."""
        self._stop_event.set()
        with self._lock:
            t = self._thread
            self._thread = None
        if t is not None and t.is_alive():
            t.join(timeout=timeout_s)

    def reset(self) -> None:
        self.stop()
        with self._lock:
            self._network_down = False
            self._probe_runs = 0


_controller_lock = threading.RLock()
_controller = OfflineController()


def _auto_probe_allowed() -> bool:
    """Allow lazy background probe startup in live server runs (never under kill switch or pytest)."""
    if offline_kill_switch_enabled():
        return False
    if "PYTEST_CURRENT_TEST" in os.environ:
        return False
    return os.environ.get("ABHAS_OFFLINE_PROBE", "").strip().lower() not in _FALSY_PROBE


def get_offline_controller() -> OfflineController:
    """Return the process-wide OfflineController singleton."""
    with _controller_lock:
        return _controller


def is_offline() -> bool:
    """Return True when ABHAS_OFFLINE=1 or the background probe has detected network loss."""
    if offline_kill_switch_enabled():
        return True
    controller = get_offline_controller()
    if _auto_probe_allowed():
        controller.start()
    return controller.is_offline()


def reset_offline_state() -> None:
    """Reset the process-wide OfflineController state (for tests)."""
    get_offline_controller().reset()
