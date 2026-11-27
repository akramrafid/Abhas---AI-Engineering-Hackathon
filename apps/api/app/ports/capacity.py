"""Port: ward hospital bed capacity source (contracts §3, §5; ADR-0012)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Protocol


class BedCapacitySource(Protocol):
    """Supplies derived per-ward bed capacities (adapter reads apps/api/config/ward_capacity.json)."""

    method: str

    def capacity(self, ward_ids: Sequence[str]) -> Mapping[str, int]:
        """Return positive integer capacities for every requested ward_id.

        Raises KeyError if any ward_id is unknown (services map KeyError to 404 unknown-ward).
        """
        ...
