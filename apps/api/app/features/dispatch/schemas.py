"""Contract: dispatch slice (contracts §2.4, §2.5; ADR-0014)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.core.command_requests import Channel, DispatchRequest, Lang, Scope, UuidStr
from app.core.run_meta import RunMeta
from app.core.types import City, Tier, WardId

__all__ = [
    "Channel",
    "DeficitLevel",
    "DispatchRequest",
    "DispatchResponse",
    "Lang",
    "Notice",
    "NoticeFacts",
    "Scope",
    "SmsEncoding",
    "SmsMessage",
    "SupplyPair",
    "UuidStr",
]

SmsEncoding = Literal["GSM-7", "UCS-2"]
DeficitLevel = Literal["none", "deficit", "critical"]


class SupplyPair(BaseModel):
    required: int = Field(ge=0)
    allocated: int = Field(ge=0)


class NoticeFacts(BaseModel):
    """Single source of truth for every number rendered in SMS, WhatsApp, and brief HTML (ADR-0014)."""

    ward_id: WardId
    ward_name: str
    city: City
    window_start: date
    window_end: date
    tier: Tier
    predicted_cases: float = Field(ge=0.0, description="Window sum of expected cases, rounded to one decimal")
    saline_bags: SupplyPair
    diagnostic_kits: SupplyPair
    hospital_beds: SupplyPair
    crews_assigned: int = Field(ge=0)
    deficit_level: DeficitLevel
    action: str = Field(description="Tier action directive in the requested language")


class SmsMessage(BaseModel):
    text: str
    encoding: SmsEncoding
    characters: int = Field(ge=0)
    segments: int = Field(ge=1)


class Notice(BaseModel):
    facts: NoticeFacts
    sms: SmsMessage | None = None
    whatsapp: str | None = None
    brief_url: str | None = None


class DispatchResponse(RunMeta):
    """POST /api/v1/dispatch/notices response (contracts §2.4)."""

    request: DispatchRequest
    lang: Lang
    notices: list[Notice]
