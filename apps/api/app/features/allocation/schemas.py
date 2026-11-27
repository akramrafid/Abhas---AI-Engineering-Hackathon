"""Contract: allocation slice (contracts §2.1; ADR-0009, ADR-0010, ADR-0011)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.core.command_requests import AllocationRequest, Scope
from app.core.run_meta import RunMeta
from app.core.types import City, Tier, WardId

__all__ = [
    "AllocationRequest",
    "AllocationResponse",
    "CityAllocationSummary",
    "CityResourceTotals",
    "CrewMethod",
    "DeficitLevel",
    "ResourceKey",
    "ResourceLine",
    "Scope",
    "WardAllocation",
]

ResourceKey = Literal["saline_bags", "diagnostic_kits", "hospital_beds"]
CrewMethod = Literal["greedy", "greedy (approximate)"]
DeficitLevel = Literal["none", "deficit", "critical"]


class ResourceLine(BaseModel):
    required: int = Field(ge=0)
    allocated: int = Field(ge=0)
    deficit: int = Field(ge=0)
    fulfilment_pct: float = Field(ge=0.0, le=100.0)


class WardAllocation(BaseModel):
    ward_id: WardId
    city: City
    tier: Tier = Field(description="Peak tier across the planning window")
    expected_cases: float = Field(ge=0.0, description="Sum of forecast means across the window")
    planned_cases: float = Field(ge=0.0, description="Window case quantile used for supply sizing")
    density_factor: float = Field(ge=0.5, le=2.0)
    priority_weight: float = Field(gt=0.0)
    saline_bags: ResourceLine
    diagnostic_kits: ResourceLine
    hospital_beds: ResourceLine
    crews: int = Field(ge=0)
    deficit_level: DeficitLevel
    deficit_reasons: list[str]


class CityResourceTotals(BaseModel):
    resource: ResourceKey
    required: int = Field(ge=0)
    available: int = Field(ge=0)
    allocated: int = Field(ge=0)
    floors_scaled: bool


class CityAllocationSummary(BaseModel):
    city: City
    resources: list[CityResourceTotals]
    crews_assigned: int = Field(ge=0)
    critical_wards: int = Field(ge=0)
    deficit_wards: int = Field(ge=0)


class AllocationResponse(RunMeta):
    """POST /api/v1/allocation/plan response (contracts §2.1)."""

    request: AllocationRequest
    supply_ratios: dict[ResourceKey, float]
    service_levels: dict[ResourceKey, float]
    crew_method: CrewMethod
    wards: list[WardAllocation]
    cities: list[CityAllocationSummary]
    solve_ms: float = Field(ge=0.0)
