"""Chat slice HTTP router: POST /api/v1/chat & /api/v1/chat/stream (SSE)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_chat_service
from .schemas import ChatRequest, ChatResponse
from .service import ChatService

router = APIRouter(prefix="/api/v1", tags=["chat"], responses=PROBLEM_RESPONSES)


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Abhas AI Assistant (grounded Gemini Flash with offline fallback)",
)
async def chat(
    req: ChatRequest,
    svc: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    return await svc.reply(req)


@router.post(
    "/chat/stream",
    summary="Streaming Abhas AI Assistant over Server-Sent Events (text/event-stream)",
    response_class=StreamingResponse,
)
async def chat_stream(
    req: ChatRequest,
    svc: ChatService = Depends(get_chat_service),
) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        async for evt in svc.stream_reply(req):
            event_name = evt["event"]
            payload = json.dumps(evt["data"], ensure_ascii=False)
            yield f"event: {event_name}\ndata: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
        },
    )
