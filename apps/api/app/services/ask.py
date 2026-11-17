"""Grounded KB answering.

`stream_answer` yields (event, data) tuples consumed by the SSE route, in this order:
  ("meta", {"request_id": str, "language": str})
  ("citations", [Citation...])     the numbered context chunks, sent BEFORE tokens so the UI can show sources
  ("token", {"text": str})         repeated; [n] markers match the early citations
  ("done", AskResponse)            AUTHORITATIVE final answer: only the chunks actually cited, renumbered 1..m
                                   in order of first use; answered=false and citations=[] when not covered
On failure the route emits ("error", {"code": str, "message": str}).

The retrieval layer refuses without calling the LLM when the KB has no evidence; otherwise the model answers
from numbered sources and may itself say the documents do not cover the question (NO_ANSWER_MARKER).
"""

import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from app.adapters.llm import LLMClient, UsageMeter, get_llm
from app.core.errors import UpstreamError
from app.core.logging import log_event, request_id_var
from app.prompts.ask_prompt import (
    NO_ANSWER_MARKER,
    PROMPT_VERSION,
    build_messages,
    refusal_text,
)
from app.schemas import AskRequest, AskResponse, Citation
from app.services.kb import linearize_tables
from app.services.language import detect_language
from app.services.retrieval import Retrieved, excerpt, retrieve, to_citation, tokenize

log = logging.getLogger("app.ask")

ASK_BUDGET_S = 90.0  # hard cap on one answer, whatever the provider does
SHORT_QUESTION_TOKENS = (
    5  # shorter follow-ups ("and for 48 hours?") borrow the previous question for retrieval
)
MOCK_ANSWER_CHARS = 650
_CITATION_RE = re.compile(r"\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]")


class _MarkerGate:
    """Detects a leading NO_ANSWER_MARKER in a token stream without leaking it to the client."""

    def __init__(self) -> None:
        self._buffer = ""
        self._decided = False
        self.refused = False

    def feed(self, delta: str) -> str:
        if self._decided:
            return delta
        self._buffer += delta
        head = self._buffer.lstrip()
        if head.startswith(NO_ANSWER_MARKER):
            self._decided = self.refused = True
            return head[len(NO_ANSWER_MARKER) :].lstrip()
        if len(head) < len(NO_ANSWER_MARKER) and NO_ANSWER_MARKER.startswith(head):
            return ""  # still could become the marker
        self._decided = True
        return self._buffer

    def flush(self) -> str:
        if self._decided:
            return ""
        self._decided = True
        return self._buffer


def renumber_citations(answer: str, citations: list[Citation]) -> tuple[str, list[Citation]]:
    """Keep only the citations the answer references, renumbered 1..m by first use; drop unknown [n]."""
    valid = {c.id for c in citations}
    mapping: dict[int, int] = {}
    for match in _CITATION_RE.finditer(answer):
        for raw in match.group(1).split(","):
            old = int(raw)
            if old in valid and old not in mapping:
                mapping[old] = len(mapping) + 1

    def rewrite(match: re.Match[str]) -> str:
        ids = [mapping[int(r)] for r in match.group(1).split(",") if int(r) in mapping]
        return f"[{', '.join(str(i) for i in ids)}]" if ids else ""

    text = re.sub(r"[ \t]{2,}", " ", _CITATION_RE.sub(rewrite, answer))
    text = re.sub(r"\s+([.,;:!?।])", r"\1", text).strip()  # a dropped marker must not leave " ."
    by_id = {c.id: c for c in citations}
    kept = [by_id[old].model_copy(update={"id": new}) for old, new in mapping.items()]
    return text, kept


def _retrieval_query(req: AskRequest) -> str:
    """Short follow-up questions are meaningless alone; prepend the previous user turn for retrieval only."""
    if len(tokenize(req.question)) <= SHORT_QUESTION_TOKENS:
        previous = [t.content for t in req.history if t.role == "user"]
        if previous:
            return f"{previous[-1]}\n{req.question}"
    return req.question


async def _mock_stream(chunks: list[Retrieved], meter: UsageMeter) -> AsyncIterator[str]:
    """Deterministic offline answer built from the best chunk (LLM_MOCK / no key)."""
    meter.add(0, 0)
    top = chunks[0]
    body = " ".join(linearize_tables(top.text).split())[:MOCK_ANSWER_CHARS]
    text = f"According to {top.title} ({top.section}): {body} [1]"
    for word in text.split(" "):
        yield word + " "


def _generate(
    llm: LLMClient, messages: list[dict], chunks: list[Retrieved], meter: UsageMeter
) -> AsyncIterator[str]:
    if llm.mock and llm.mock_fn is None:
        return _mock_stream(chunks, meter)
    return llm.stream_text(messages, meter)


def _response(
    text: str, answered: bool, language: str, citations: list[Citation], meter: UsageMeter
) -> dict[str, Any]:
    res = AskResponse(
        answer=text,
        answered=answered,
        language=language,
        citations=citations if answered else [],
        usage=meter.to_usage(),
    )
    log_event(
        log,
        "ask_done",
        prompt_version=PROMPT_VERSION,
        answered=res.answered,
        language=language,
        citations=[c.doc_id for c in res.citations],
        **res.usage.model_dump(),
    )
    return res.model_dump(mode="json")


async def _run(req: AskRequest, request_id: str) -> AsyncIterator[tuple[str, Any]]:
    llm = get_llm()
    meter = llm.meter()
    started = time.monotonic()
    language = detect_language(req.question)
    yield "meta", {"request_id": request_id, "language": language}

    result = await retrieve(_retrieval_query(req), lenient=not llm.mock)
    if not result.answerable:
        text = refusal_text(language)
        yield "citations", []
        yield "token", {"text": text}
        yield "done", _response(text, False, language, [], meter)
        return

    context = [to_citation(i, c, req.question) for i, c in enumerate(result.chunks, start=1)]
    yield "citations", [c.model_dump() for c in context]

    messages = build_messages(
        req.question, language, [(c.title, c.section, c.text) for c in result.chunks], req.history
    )
    gate = _MarkerGate()
    parts: list[str] = []
    async for delta in _generate(llm, messages, result.chunks, meter):
        if time.monotonic() - started > ASK_BUDGET_S:
            raise UpstreamError("The answer took too long. Please try again.")
        if out := gate.feed(delta):
            parts.append(out)
            yield "token", {"text": out}
    if tail := gate.flush():
        parts.append(tail)
        yield "token", {"text": tail}

    text = "".join(parts).replace(NO_ANSWER_MARKER, "").strip()
    if gate.refused or not text:
        text = text or refusal_text(language)
        yield "done", _response(text, False, language, [], meter)
        return
    # Re-pick each snippet with the answer too: the row/sentence that supports it, not just the question.
    context = [
        c.model_copy(update={"snippet": excerpt(chunk.text, f"{req.question} {text}")})
        for c, chunk in zip(context, result.chunks, strict=True)
    ]
    text, cited = renumber_citations(text, context)
    if not cited:
        log_event(log, "ask_uncited_answer", doc_ids=[c.doc_id for c in context])
    yield "done", _response(text, True, language, cited, meter)


def stream_answer(req: AskRequest, request_id: str) -> AsyncIterator[tuple[str, Any]]:
    return _run(req, request_id)


async def answer(req: AskRequest) -> AskResponse:
    final: dict[str, Any] | None = None
    async for event, data in _run(req, request_id_var.get()):
        if event == "done":
            final = data
    if final is None:  # unreachable: _run always ends with "done" or raises
        raise UpstreamError()
    return AskResponse.model_validate(final)
