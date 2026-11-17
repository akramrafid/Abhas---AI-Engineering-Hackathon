from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.ask import Citation
from app.schemas.common import Usage


class Category(StrEnum):
    billing = "billing"
    outage = "outage"
    technical = "technical"
    plan_change = "plan_change"
    account_security = "account_security"
    cancellation = "cancellation"
    other = "other"


class Urgency(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Sentiment(StrEnum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"
    angry = "angry"


class Language(StrEnum):
    en = "en"
    bn = "bn"
    banglish = "banglish"


class TriageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    channel: str = Field(default="chat", max_length=32)
    ticket_id: str | None = Field(default=None, max_length=64)


class TriageResult(BaseModel):
    id: str = Field(description="Server-generated triage id")
    ticket_id: str | None = None
    category: Category
    urgency: Urgency
    sentiment: Sentiment
    language: Language
    summary: str = Field(max_length=300)
    needs_human: bool
    injection_detected: bool
    suggested_reply: str
    urgency_evidence: str = Field(default="", description="Sentence from the ticket that drove urgency")
    reasons: list[str] = Field(default_factory=list, description="Why needs_human / injection were set")
    citations: list[Citation]
    usage: Usage
    created_at: datetime


class TriageHistoryItem(BaseModel):
    id: str
    ticket_id: str | None
    category: Category
    urgency: Urgency
    language: Language
    needs_human: bool
    injection_detected: bool
    summary: str
    created_at: datetime


class BatchTriageItem(BaseModel):
    ticket_id: str
    text: str
    result: TriageResult | None
    error: str | None = None
    label_category: Category
    label_urgency: Urgency
    category_correct: bool
    urgency_correct: bool


class BatchTriageResult(BaseModel):
    items: list[BatchTriageItem]
    total: int
    category_accuracy: float = Field(ge=0, le=1)
    urgency_accuracy: float = Field(ge=0, le=1)
    usage: Usage
