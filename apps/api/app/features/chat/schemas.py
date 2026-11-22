"""Contract: chat slice (LEAD owns). POST /api/v1/chat & /api/v1/chat/stream — Abhas AI Assistant."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import DatasetOriginWeek, WardId


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    message: str = Field(
        min_length=1,
        max_length=1200,
        description="User question about Abhas, dengue risk, wards, forecasts, or dashboard tools.",
    )
    history: list[ChatTurn] = Field(
        default_factory=list,
        max_length=12,
        description="Up to 12 prior conversation turns for multi-turn context.",
    )
    language: Literal["en", "bn", "auto"] = "auto"
    ward_id: WardId | None = Field(
        default=None,
        description="Optional currently selected ward_id from the dashboard for live grounding.",
    )
    origin_week: DatasetOriginWeek | None = Field(
        default=None,
        description="Optional active Monday origin week (2016-02-29 .. 2025-12-29) for live forecast grounding.",
    )

    @field_validator("message", mode="before")
    @classmethod
    def _strip_message(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class ChatResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "bn"]
    source: Literal["gemini", "grounded_fallback"]
    model: str | None = None
    cached: bool = False
    latency_ms: float = Field(ge=0.0)
    grounded_ward: str | None = None
    suggestions: list[str] = Field(default_factory=list, max_length=4)
