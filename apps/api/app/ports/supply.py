"""Port: fitted per-case supply conversion ratios (contracts §3, §5; ADR-0009)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class SupplyRatios:
    """Fitted OLS-through-origin per-case ratios loaded from config/supply_ratios.json."""

    saline_bags: float
    diagnostic_kits: float
    hospital_beds: float
    r2: Mapping[str, float]
    fitted_years: tuple[int, int]
    dataset_sha256: str
    method: str = "OLS through origin on 2016–2022 ward-weeks"
    per_city: Mapping[str, Mapping[str, float]] = field(default_factory=dict)


class SupplyRatioSource(Protocol):
    """Supplies fitted per-case resource ratios (adapter reads apps/api/config/supply_ratios.json)."""

    def ratios(self) -> SupplyRatios:
        """Return validated supply ratios and fit metadata."""
        ...
