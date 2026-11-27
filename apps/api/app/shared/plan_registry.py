"""In-process runner registry allowing the plans slice to execute other slices without importing them.

ADR-0001 / contracts §1 & §4: ``app/main.py`` (the composition root) registers the four
runners (allocation, overflow, simulation, dispatch) at startup. ``features/plans`` calls
``run(kind, request)`` solely through this shared registry.
"""

from __future__ import annotations

from collections.abc import Callable
from threading import RLock
from typing import Any

from app.core.command_requests import PlanKind

PlanRunner = Callable[[Any], tuple[dict[str, Any], dict[str, Any]]]

_lock = RLock()
_runners: dict[PlanKind, PlanRunner] = {}


def register_runner(kind: PlanKind, fn: PlanRunner) -> None:
    """Register a callable ``(request) -> (outputs_dict, headline_dict)`` for a plan kind."""
    with _lock:
        _runners[kind] = fn


def run(kind: PlanKind, request: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Invoke the registered runner for ``kind`` and return ``(outputs_dict, headline_dict)``.

    Raises KeyError if no runner is registered for ``kind``.
    """
    with _lock:
        fn = _runners.get(kind)
    if fn is None:
        raise KeyError(f"No plan runner registered for kind={kind!r}")
    return fn(request)


def registered_kinds() -> frozenset[str]:
    """Return the set of currently registered plan kinds."""
    with _lock:
        return frozenset(_runners.keys())


def clear_runners() -> None:
    """Clear all registered runners (primarily for tests)."""
    with _lock:
        _runners.clear()
