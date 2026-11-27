"""Ports for precomputed ADR-0020 (early-action trigger) and ADR-0021 (structural-fix planner) JSON."""

from __future__ import annotations

from typing import Any, Protocol


class TriggerEvaluationSource(Protocol):
    """Read-only port returning the precomputed ADR-0020 trigger evaluation payload."""

    def load_trigger(self) -> dict[str, Any]: ...


class StructuralPlannerSource(Protocol):
    """Read-only port returning the precomputed ADR-0021 structural-fix planner payload."""

    def load_structural(self) -> dict[str, Any]: ...
