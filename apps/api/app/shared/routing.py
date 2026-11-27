"""Pure intra-city hospital overflow routing and bed capacity derivation (contracts §4; ADR-0012).

Algorithm bodies are implemented in WP2; WP0 locks the typed signatures, result dataclasses,
and docstrings.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class TransferArc:
    """Directed intra-city patient transfer from a deficit ward to a headroom ward."""

    from_ward: str
    to_ward: str
    patients: int


@dataclass(frozen=True)
class RoutingResult:
    """Result of two-stage intra-city overflow routing (min-max LP + min-arcs MILP)."""

    transfers: list[TransferArc]
    loads: list[int]
    u_star: float


@dataclass(frozen=True)
class CityBedStats:
    """City-level bed utilisation and overflow summary fields matching CityBedSummary (§2.2)."""

    capacity_total: int
    required_total: int
    utilisation_before: float
    utilisation_after: float
    headroom_after: int
    unroutable_patients: int
    transfers: int


def derive_capacity(
    beds_history: Mapping[str, Sequence[tuple[int, float]]] | pd.DataFrame,
    years: tuple[int, int] = (2016, 2022),
    q: float = 0.95,
    margin: float = 1.10,
    minimum: int = 1,
) -> dict[str, int]:
    """Derive per-ward baseline bed capacities ``max(minimum, ceil(margin * quantile_q))`` on training years only."""
    raise NotImplementedError("Implemented in WP2 (bed capacity derivation)")


def route_city(
    required: Sequence[int],
    capacity: Sequence[int],
    ward_ids: Sequence[str],
) -> RoutingResult:
    """Route overflow patients strictly inside one city via two-stage LP + MILP (ADR-0012).

    Invariants:
    - Stage 1 LP minimises maximum post-transfer utilisation ``u`` while maximising patients placed.
    - Stage 2 MILP minimises the number of active transfer arcs subject to ``u <= u*`` and max placement.
    - Patients are conserved (sum transferred out == sum transferred in); no self-arcs; no ward both
      sends and receives; deterministic for identical inputs.
    """
    raise NotImplementedError("Implemented in WP2 (overflow routing)")


def summarise_city(
    required: Sequence[int],
    capacity: Sequence[int],
    loads: Sequence[int],
    *,
    transfers: int = 0,
) -> CityBedStats:
    """Compute city-level utilisation before/after, headroom after, and unroutable patients (§2.2)."""
    raise NotImplementedError("Implemented in WP2 (overflow routing)")
