"""Contract: advisory slice (LEAD owns). POST /api/v1/advisory — officer briefing, template or LLM (COULD)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.core.types import Horizon, IsoWeek, Tier, WardId


class AdvisoryRequest(BaseModel):
    ward_id: WardId
    origin_week: IsoWeek
    horizon: Horizon = 3
    language: Literal["en", "bn"] = "en"


class AdvisoryAction(BaseModel):
    action: str = Field(max_length=200)
    when: str = Field(max_length=60, examples=["this week"])


class AdvisoryResponse(BaseModel):
    ward_id: WardId
    origin_week: date
    horizon: int
    language: Literal["en", "bn"]
    tier: Tier
    headline: str = Field(max_length=160)
    summary: str = Field(max_length=800)
    actions: list[AdvisoryAction] = Field(max_length=5)
    source: Literal["template", "llm"]
    model: str | None = None
    cached: bool
    numbers_validated: bool = Field(description="Every number in the text appears in the forecast input")
