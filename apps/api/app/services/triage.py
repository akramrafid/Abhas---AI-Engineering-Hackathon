"""Ticket triage. STUB — owned by core-triage (BUILDER-CORE)."""

import uuid
from datetime import UTC, datetime

from app.schemas import (
    BatchTriageResult,
    Category,
    Language,
    Sentiment,
    TriageHistoryItem,
    TriageRequest,
    TriageResult,
    Urgency,
    Usage,
)
from app.services.language import detect_language


async def triage(req: TriageRequest) -> TriageResult:
    return TriageResult(
        id=uuid.uuid4().hex,
        ticket_id=req.ticket_id,
        category=Category.other,
        urgency=Urgency.low,
        sentiment=Sentiment.neutral,
        language=Language(detect_language(req.text)),
        summary="(stub) triage not implemented yet",
        needs_human=True,
        injection_detected=False,
        suggested_reply="(stub)",
        citations=[],
        usage=Usage(model="mock"),
        created_at=datetime.now(UTC),
    )


async def triage_batch() -> BatchTriageResult:
    return BatchTriageResult(
        items=[], total=0, category_accuracy=0.0, urgency_accuracy=0.0, usage=Usage(model="mock")
    )


async def history(limit: int = 50) -> list[TriageHistoryItem]:
    return []
