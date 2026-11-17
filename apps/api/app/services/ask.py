"""Grounded KB answering. STUB — owned by core-kb (BUILDER-CORE).

`stream_answer` yields (event, data) tuples consumed by the SSE route, in this order:
  ("meta", {"request_id": str, "language": str})
  ("citations", [Citation...])     sent BEFORE tokens so the UI can render sources early
  ("token", {"text": str})         repeated
  ("done", AskResponse)            final full answer + usage
On failure the route emits ("error", {"code": str, "message": str}).
"""

from collections.abc import AsyncIterator
from typing import Any

from app.schemas import AskRequest, AskResponse, Citation, Usage
from app.services.language import detect_language


async def answer(req: AskRequest) -> AskResponse:
    lang = detect_language(req.question)
    return AskResponse(
        answer="(stub) You get 5 days of credit for a 30-hour outage [1].",
        answered=True,
        language=lang,
        citations=[
            Citation(
                id=1,
                doc_id="outage-sla",
                title="Outage Credits and SLA",
                section="Outage credit table",
                snippet="More than 24 and up to 48 hours | 5 days of credit",
                score=0.9,
            )
        ],
        usage=Usage(model="mock"),
    )


async def stream_answer(req: AskRequest, request_id: str) -> AsyncIterator[tuple[str, Any]]:
    res = await answer(req)
    yield "meta", {"request_id": request_id, "language": res.language}
    yield "citations", [c.model_dump() for c in res.citations]
    for word in res.answer.split(" "):
        yield "token", {"text": word + " "}
    yield "done", res.model_dump(mode="json")
