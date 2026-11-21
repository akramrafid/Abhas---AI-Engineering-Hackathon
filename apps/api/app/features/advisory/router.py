"""Advisory slice HTTP router: POST /api/v1/advisory — EN/BN template or optional LLM briefing."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_advisory_service
from .schemas import AdvisoryRequest, AdvisoryResponse
from .service import AdvisoryService

router = APIRouter(prefix="/api/v1", tags=["advisory"], responses=PROBLEM_RESPONSES)


@router.post("/advisory", response_model=AdvisoryResponse, summary="Short officer advisory for one ward")
async def advisory(
    req: AdvisoryRequest,
    svc: AdvisoryService = Depends(get_advisory_service),
) -> AdvisoryResponse:
    return await asyncio.to_thread(svc.advisory, req)
