"""Contract: overflow routing slice (contracts §2.2; ADR-0012)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.core.command_requests import OverflowRequest, Scope
from app.core.run_meta import RunMeta
from app.core.types import City, WardId

__all__ = [
    "CapacitySource",
    "CityBedSummary",
    "OverflowRequest",
    "OverflowResponse",
    "Scope",
    "Transfer",
    "WardBedStatus",
]

CapacitySource = Literal["derived", "override"]


class WardBedStatus(BaseModel):
    ward_id: WardId
    city: City
    beds_required: int = Field(ge=0)
    capacity: int = Field(ge=1)
    capacity_source: CapacitySource
    local_deficit: int = Field(ge=0)
    headroom_before: int = Field(ge=0)
    transferred_out: int = Field(ge=0)
    transferred_in: int = Field(ge=0)
    net_deficit: int = Field(ge=0)
    utilisation_before: float = Field(ge=0.0)
    utilisation_after: float = Field(ge=0.0)


class Transfer(BaseModel):
    city: City
    from_ward: WardId
    to_ward: WardId
    patients: int = Field(ge=1)


class CityBedSummary(BaseModel):
    city: City
    capacity_total: int = Field(ge=1)
    required_total: int = Field(ge=0)
    utilisation_before: float = Field(ge=0.0)
    utilisation_after: float = Field(ge=0.0)
    headroom_after: int = Field(ge=0)
    unroutable_patients: int = Field(ge=0)
    transfers: int = Field(ge=0)


class OverflowResponse(RunMeta):
    """POST /api/v1/overflow/route response (contracts §2.2)."""

    request: OverflowRequest
    capacity_method: str
    wards: list[WardBedStatus]
    transfers: list[Transfer]
    cities: list[CityBedSummary]
    solve_ms: float = Field(ge=0.0)
