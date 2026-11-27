"""Port Protocol for the Nearest Bed & Ambulance facilities store (ADR-0018)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class HospitalEntity:
    id: str
    name: str
    city: str
    lat: float
    lon: float
    address: str | None
    phone: str | None
    total_beds: int
    free_beds: int
    data_source: str
    updated_at: datetime


@dataclass(frozen=True)
class AmbulanceRequestEntity:
    id: str
    hospital_id: str
    hospital_name: str
    city: str
    severity: str
    beds_requested: int
    dispatcher_note: str | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class SnapshotMetadata:
    snapshot_date: str
    attribution: str


class FacilitiesStore(Protocol):
    def snapshot_metadata(self) -> SnapshotMetadata: ...

    def list_hospitals(self, *, city: str | None = None) -> Sequence[HospitalEntity]: ...

    def get_hospital(self, hospital_id: str) -> HospitalEntity | None: ...

    def update_beds(
        self,
        *,
        hospital_id: str,
        free_beds: int,
        total_beds: int,
        note: str | None = None,
    ) -> tuple[HospitalEntity, int]: ...

    def create_ambulance_request(
        self,
        *,
        hospital_id: str,
        city: str,
        severity: str,
        beds_requested: int,
        dispatcher_note: str | None = None,
    ) -> AmbulanceRequestEntity: ...

    def list_ambulance_requests(
        self,
        *,
        city: str | None = None,
        limit: int = 20,
    ) -> Sequence[AmbulanceRequestEntity]: ...
