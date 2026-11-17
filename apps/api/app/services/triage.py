"""Ticket triage: one LLM call per ticket, wrapped by deterministic guardrails.

Flow: detect language -> retrieve trusted KB snippets (optional) -> ONE structured LLM call -> guardrails
(injection, needs_human, reply safety, evidence grounding) -> persist -> TriageResult.
Mock mode (no LLM key) uses a deterministic keyword classifier so the UI and tests work offline.
"""

import asyncio
import json
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from app.adapters.llm import UsageMeter, get_llm
from app.core.config import get_settings
from app.core.errors import AppError, UpstreamError
from app.prompts.triage_mock import MOCK_BODY, MOCK_INTRO
from app.prompts.triage_prompt import build_messages
from app.schemas import (
    BatchTriageItem,
    BatchTriageResult,
    Category,
    Citation,
    Language,
    Sentiment,
    TriageHistoryItem,
    TriageRequest,
    TriageResult,
    Urgency,
    Usage,
)
from app.services import guardrails
from app.services import history as history_store
from app.services.language import detect_language

log = logging.getLogger("app.triage")

RETRIEVAL_TIMEOUT_S = 3.0
LLM_BUDGET_S = 25.0
BATCH_CONCURRENCY = 4
MAX_CITATIONS = 3


class LLMTriage(BaseModel):
    """What the model returns. Enums are validated here; everything else is repaired by guardrails."""

    category: Category
    urgency: Urgency
    sentiment: Sentiment
    summary: str = Field(min_length=1)
    suggested_reply: str = Field(min_length=1)
    urgency_evidence: str = ""
    injection_suspected: bool = False

    @field_validator("category", "urgency", "sentiment", mode="before")
    @classmethod
    def _lower(cls, v: object) -> object:
        return v.strip().lower().replace(" ", "_").replace("-", "_") if isinstance(v, str) else v


# --------------------------------------------------------------------------------------------------
# Retrieval (owned by another worker; optional here)
# --------------------------------------------------------------------------------------------------
async def _retrieve(text: str) -> list[Citation]:
    try:
        from app.services.retrieval import search  # lazy: module may not exist yet
    except ImportError:
        return []
    query = " ".join(text.split())[:500]
    try:
        hits = await asyncio.wait_for(search(query, k=MAX_CITATIONS), timeout=RETRIEVAL_TIMEOUT_S)
    except Exception:
        log.warning("retrieval unavailable, continuing without citations", exc_info=True)
        return []
    return [c.model_copy(update={"id": i}) for i, c in enumerate(list(hits)[:MAX_CITATIONS], start=1)]


# --------------------------------------------------------------------------------------------------
# Mock mode
# --------------------------------------------------------------------------------------------------
def _mock_output(text: str, language: Language, citations: list[Citation]) -> LLMTriage:
    h = guardrails.heuristic_triage(text)
    flat = " ".join(text.split())
    summary = f"{h.category.value.replace('_', ' ').title()} ticket: {flat[:200]}"
    cite = f" [{citations[0].id}]" if citations else ""
    reply = f"{MOCK_INTRO[language]} {MOCK_BODY[h.category][language]}{cite}"
    return LLMTriage(
        category=h.category,
        urgency=h.urgency,
        sentiment=h.sentiment,
        summary=summary,
        suggested_reply=reply,
        urgency_evidence=h.evidence,
        injection_suspected=False,
    )


async def _classify(
    req: TriageRequest, language: Language, citations: list[Citation], meter: UsageMeter
) -> LLMTriage:
    llm = get_llm()
    if llm.mock and llm.mock_fn is None:
        meter.add(0, 0)
        return _mock_output(req.text, language, citations)
    messages = build_messages(req.text, req.channel, language, citations, secrets.token_hex(6))
    try:
        return await asyncio.wait_for(
            llm.complete_json(messages, LLMTriage, meter, temperature=0.0, max_tokens=700),
            timeout=LLM_BUDGET_S,
        )
    except TimeoutError as exc:
        raise UpstreamError("The AI took too long to respond. Please try again.") from exc
    except AppError:
        raise
    except Exception as exc:
        log.exception("triage LLM call failed")
        raise UpstreamError() from exc


# --------------------------------------------------------------------------------------------------
# Public service API (signatures are part of the contract)
# --------------------------------------------------------------------------------------------------
def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


async def triage(req: TriageRequest) -> TriageResult:
    meter = get_llm().meter()
    language = Language(detect_language(req.text))

    if not req.text.strip():  # whitespace-only ticket: nothing to classify, hand to a human
        result = TriageResult(
            id=uuid.uuid4().hex,
            ticket_id=req.ticket_id,
            category=Category.other,
            urgency=Urgency.low,
            sentiment=Sentiment.neutral,
            language=language,
            summary="Empty ticket",
            needs_human=True,
            injection_detected=False,
            suggested_reply=guardrails.safe_reply(language),
            urgency_evidence="",
            reasons=["The ticket is empty: a human agent must follow up"],
            citations=[],
            usage=meter.to_usage(),
            created_at=datetime.now(UTC),
        )
        await history_store.save(result)
        return result

    citations = await _retrieve(req.text)
    out = await _classify(req, language, citations, meter)
    guarded = guardrails.apply_guardrails(
        text=req.text,
        language=language,
        category=out.category,
        urgency=out.urgency,
        injection_suspected=out.injection_suspected,
        reply=out.suggested_reply,
        evidence=out.urgency_evidence,
        n_citations=len(citations),
    )
    result = TriageResult(
        id=uuid.uuid4().hex,
        ticket_id=req.ticket_id,
        category=guarded.category,
        urgency=guarded.urgency,
        sentiment=out.sentiment,
        language=language,
        summary=_clip(out.summary, 300),
        needs_human=guarded.needs_human,
        injection_detected=guarded.injection_detected,
        suggested_reply=guarded.reply,
        urgency_evidence=guarded.urgency_evidence,
        reasons=guarded.reasons,
        citations=citations,
        usage=meter.to_usage(),
        created_at=datetime.now(UTC),
    )
    await history_store.save(result)
    return result


def _load_tickets() -> list[dict]:
    path = get_settings().tickets_file
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        log.error("tickets file unreadable: %s", path)
        raise AppError("tickets_unavailable", "The sample tickets file could not be read.", 503) from exc
    tickets: list[dict] = []
    for n, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            Category(row["label_category"])
            Urgency(row["label_urgency"])
            row["id"], row["text"]  # noqa: B018 - required keys
            tickets.append(row)
        except (ValueError, KeyError, TypeError):
            log.warning("skipping malformed ticket line %d", n)
    return tickets


async def triage_batch() -> BatchTriageResult:
    started = time.perf_counter()
    tickets = _load_tickets()
    sem = asyncio.Semaphore(BATCH_CONCURRENCY)

    async def run(row: dict) -> BatchTriageItem:
        label_cat, label_urg = Category(row["label_category"]), Urgency(row["label_urgency"])
        text = str(row["text"])
        result: TriageResult | None = None
        error: str | None = None
        try:
            async with sem:
                req = TriageRequest(
                    text=text[:8000] or " ",
                    channel=str(row.get("channel", "chat"))[:32],
                    ticket_id=str(row["id"])[:64],
                )
                result = await triage(req)
        except AppError as exc:
            error = exc.message
        except Exception:
            log.exception("batch ticket failed", extra={"data": {"ticket_id": row.get("id")}})
            error = "Triage failed for this ticket."
        return BatchTriageItem(
            ticket_id=str(row["id"]),
            text=text,
            result=result,
            error=error,
            label_category=label_cat,
            label_urgency=label_urg,
            category_correct=bool(result and result.category == label_cat),
            urgency_correct=bool(result and result.urgency == label_urg),
        )

    items = list(await asyncio.gather(*(run(t) for t in tickets)))
    total = len(items)
    usages = [i.result.usage for i in items if i.result]
    usage = Usage(
        model=usages[0].model if usages else get_llm().meter().model,
        llm_calls=sum(u.llm_calls for u in usages),
        prompt_tokens=sum(u.prompt_tokens for u in usages),
        completion_tokens=sum(u.completion_tokens for u in usages),
        cost_usd=round(sum(u.cost_usd for u in usages), 6),
        latency_ms=round((time.perf_counter() - started) * 1000, 1),
    )
    return BatchTriageResult(
        items=items,
        total=total,
        category_accuracy=round(sum(i.category_correct for i in items) / total, 4) if total else 0.0,
        urgency_accuracy=round(sum(i.urgency_correct for i in items) / total, 4) if total else 0.0,
        usage=usage,
    )


async def history(limit: int = 50) -> list[TriageHistoryItem]:
    return await history_store.list_recent(limit)
