"""Contract schemas for Nearest Bed & Ambulance control-room endpoints (ADR-0018).

Privacy invariants:
  - extra="forbid" on every request model prevents accidental user GPS or patient PII submission.
  - Strictly NO patient personal data fields exist anywhere in ambulance request schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.run_meta import RunMeta
from app.core.types import City, Tier
from app.shared.facilities import has_unsafe_control_chars

BedDataSource = Literal["demo", "board"]
AmbulanceSeverity = Literal["Moderate", "High", "Critical"]

BED_DATA_DISCLAIMER = "Demo bed data — replace with verified hospital bed-board feeds before clinical use."


class HospitalRecord(BaseModel):
    id: str
    name: str
    city: City
    lat: float
    lon: float
    address: str | None = None
    phone: str | None = None
    tel_href: str | None = None
    total_beds: int = Field(ge=1)
    free_beds: int = Field(ge=0)
    data_source: BedDataSource
    updated_at: datetime
    age_hours: float = Field(ge=0)
    is_stale: bool
    forecast_tier: Tier


class HospitalsResponse(RunMeta):
    snapshot_date: str
    attribution: str
    bed_data_disclaimer: str = BED_DATA_DISCLAIMER
    stale_after_hours: float = 6.0
    emergency_number: Literal["999"] = "999"
    city_filter: City | None = None
    city_forecast_tiers: dict[str, Tier]
    hospitals: list[HospitalRecord]


class BedUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    free_beds: int = Field(ge=0, le=2000)
    total_beds: int = Field(ge=1, le=2000)
    note: str | None = Field(default=None, max_length=160)

    @field_validator("note")
    @classmethod
    def _clean_note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        if has_unsafe_control_chars(stripped):
            raise ValueError("Note must not contain control or bidirectional override characters")
        return stripped

    @model_validator(mode="after")
    def _check_bounds(self) -> BedUpdateRequest:
        if self.free_beds > self.total_beds:
            raise ValueError("free_beds cannot exceed total_beds")
        return self


class BedUpdateResponse(RunMeta):
    hospital: HospitalRecord
    update_id: int = Field(ge=1)


class AmbulanceRequestCreate(BaseModel):
    """Control-room coordination log request — strictly ZERO patient personal data or user GPS."""

    model_config = ConfigDict(extra="forbid")

    hospital_id: str = Field(min_length=1, max_length=64)
    city: City
    severity: AmbulanceSeverity = "High"
    beds_requested: int = Field(default=1, ge=1, le=10)
    dispatcher_note: str | None = Field(default=None, max_length=200)

    @field_validator("dispatcher_note")
    @classmethod
    def _clean_dispatcher_note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        if has_unsafe_control_chars(stripped):
            raise ValueError("Dispatcher note must not contain control or bidirectional override characters")
        return stripped


class AmbulanceRequestRecord(RunMeta):
    id: str
    hospital_id: str
    hospital_name: str
    city: City
    severity: AmbulanceSeverity
    beds_requested: int = Field(ge=1, le=10)
    dispatcher_note: str | None = None
    status: Literal["logged"] = "logged"
    created_at: datetime


class AmbulanceRequestList(RunMeta):
    requests: list[AmbulanceRequestRecord]
