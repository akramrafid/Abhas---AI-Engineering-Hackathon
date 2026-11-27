"""Pure constrained-allocation LP, rounding, deficit classification, and greedy crew assignment.

Contracts §4; ADR-0010 (HiGHS weighted LP) and ADR-0011 (greedy marginal crews).
Algorithm bodies are implemented in WP1 (allocation) and WP3 (greedy_crews);
WP0 locks the typed signatures, result dataclasses, and docstrings.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

DeficitLevel = Literal["none", "deficit", "critical"]

TIER_WEIGHTS: Mapping[str, float] = {
    "Low": 1.0,
    "Medium": 2.0,
    "High": 4.0,
    "Critical": 8.0,
}


@dataclass(frozen=True)
class AllocationResult:
    """Integer per-ward allocations for one city and one resource from HiGHS LP + rounding."""

    allocated: list[int]
    floors_scaled: bool


@dataclass(frozen=True)
class CrewAssignmentResult:
    """Greedy marginal spraying-crew placement per ward and concavity flag (ADR-0011)."""

    crews: dict[str, int]
    approximate: bool = False


def density_factors(densities: Sequence[float], city_median: float) -> list[float]:
    """Compute clipped density multipliers ``clip(density / city_median, 0.5, 2.0)``."""
    raise NotImplementedError("Implemented in WP1 (constrained allocation)")


def priority_weights(tiers: Sequence[str], density_factors: Sequence[float]) -> list[float]:
    """Compute priority weights ``tier_weight * density_factor`` (Low 1, Medium 2, High 4, Critical 8)."""
    raise NotImplementedError("Implemented in WP1 (constrained allocation)")


def allocate_city(
    demand: Sequence[int],
    weights: Sequence[float],
    stock_pct: int,
    floor_pct: int,
    ward_ids: Sequence[str],
) -> AllocationResult:
    """Allocate scarce regional stock inside one city using a weighted HiGHS linear programme.

    Invariants:
    - S = round(stock_pct / 100 * sum(demand)).
    - Equity floors l_i = (floor_pct / 100) * d_i; if sum(l_i) > S, floors scale proportionally
      by S / sum(l_i) and ``floors_scaled`` is True.
    - sum(allocated) == min(S, sum(demand)) and 0 <= allocated[i] <= demand[i] for every ward.
    - Deterministic tie-breaking by ``ward_id``.
    """
    raise NotImplementedError("Implemented in WP1 (constrained allocation)")


def largest_remainder_round(values: Sequence[float], total: int, ward_ids: Sequence[str]) -> list[int]:
    """Round non-negative floats to integers summing exactly to ``total`` (ties broken by ``ward_id``)."""
    raise NotImplementedError("Implemented in WP1 (constrained allocation)")


def classify_deficit(
    required: int | Mapping[str, int],
    allocated: int | Mapping[str, int],
    tier: str,
) -> tuple[DeficitLevel, list[str]]:
    """Classify ward deficit severity and human-readable reasons per ADR-0010.

    Rule:
    - ``deficit`` when allocated < required for any resource.
    - ``critical`` when (tier in {"High", "Critical"} and allocated < required) or fulfilment < 50 %.
    - ``none`` when every resource meets its required demand.
    """
    raise NotImplementedError("Implemented in WP1 (constrained allocation)")


def greedy_crews(
    marginal_fn: Callable[[str, int], float],
    wards: Sequence[str],
    total_crews: int,
    cap: int = 5,
    *,
    weights: Mapping[str, float] | None = None,
) -> CrewAssignmentResult:
    """Assign spraying crews one by one to the ward with highest marginal cases prevented (ADR-0011).

    Invariants:
    - Exact optimum when every ward's marginal benefit sequence is non-increasing;
      sets ``approximate=True`` if a non-concave marginal step is detected.
    - Total crews assigned equals ``min(total_crews, len(wards) * cap)``.
    - Ties break by priority weight descending, then ``ward_id`` ascending.
    """
    raise NotImplementedError("Implemented in WP3 (crew assignment)")
