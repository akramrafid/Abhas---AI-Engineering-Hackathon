"""Port: dataset-verified per-case supply conversion constants (contracts §3, §5; ADR-0009)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class SupplyRatios:
    """Verified per-case supply constants loaded from config/supply_ratios.json."""

    saline_bags: float
    diagnostic_kits: float
    hospital_beds: float
    dataset_sha256: str
    r2: Mapping[str, float] = field(default_factory=dict)
    fitted_years: tuple[int, int] = (2016, 2022)
    valid_interval: Mapping[str, tuple[float, float]] = field(default_factory=dict)
    row_match: Mapping[str, float] = field(default_factory=dict)
    method: str = "supply = round_half_up(c × dengue_cases); constants reproduce 31,320/31,320 rows"
    per_city: Mapping[str, Mapping[str, float]] = field(default_factory=dict)


class SupplyRatioSource(Protocol):
    """Supplies verified per-case resource ratios (adapter reads apps/api/config/supply_ratios.json)."""

    def ratios(self) -> SupplyRatios:
        """Return validated supply ratios and verification metadata."""
        ...
