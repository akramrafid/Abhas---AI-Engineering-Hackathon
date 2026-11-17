import json
import logging

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.core.errors import AppError
from app.core.logging import request_id_var
from app.schemas import AskRequest, AskResponse, ErrorResponse
from app.services import ask

router = APIRouter(tags=["ask"])
log = logging.getLogger("app.ask")


@router.post("/ask", response_model=AskResponse, responses={503: {"model": ErrorResponse}})
async def ask_sync(req: AskRequest) -> AskResponse:
    """Non-streaming answer (evals, scripts)."""
    return await ask.answer(req)


@router.post(
    "/ask/stream",
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "SSE events: meta, citations, token (repeated), done (AskResponse) | error",
        }
    },
)
async def ask_stream(req: AskRequest) -> EventSourceResponse:
    rid = request_id_var.get()

    async def events():
        try:
            async for event, data in ask.stream_answer(req, rid):
                yield {"event": event, "data": json.dumps(data, ensure_ascii=False, default=str)}
        except AppError as exc:
            yield {"event": "error", "data": json.dumps({"code": exc.code, "message": exc.message})}
        except Exception:
            log.exception("stream_failed")
            err = {"code": "internal_error", "message": "Something went wrong. Please try again."}
            yield {"event": "error", "data": json.dumps(err)}

    return EventSourceResponse(events())
