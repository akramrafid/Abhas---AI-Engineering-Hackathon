"""Extensible readiness check registry for /readyz (LEAD owns; slices register checks without editing main.py)."""

import logging
from collections.abc import Callable, Mapping

ReadinessCheck = Callable[[], bool]

logger = logging.getLogger("abhas.readyz")
_checks: dict[str, ReadinessCheck] = {}


def register_readiness_check(name: str, check: ReadinessCheck) -> None:
    """Register a named readiness check evaluated by /readyz (e.g. CORE registers 'model')."""
    _checks[name] = check


def unregister_readiness_check(name: str) -> None:
    """Remove a previously registered readiness check."""
    _checks.pop(name, None)


def get_readiness_checks() -> dict[str, ReadinessCheck]:
    """Return a snapshot of all globally registered readiness checks."""
    return dict(_checks)


def evaluate_readiness_checks(checks: Mapping[str, bool | ReadinessCheck]) -> dict[str, bool]:
    """Evaluate bool or callable checks safely; exceptions mark that check unhealthy."""
    results: dict[str, bool] = {}
    for name, check in checks.items():
        if callable(check):
            try:
                results[name] = bool(check())
            except Exception:
                logger.exception("readiness check %s raised", name)
                results[name] = False
        else:
            results[name] = bool(check)
    return results
