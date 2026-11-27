"""Dispatch slice HTTP router: POST /api/v1/dispatch/notices and GET /api/v1/dispatch/brief/{ward_id}.html."""

from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import HTMLResponse

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import WARD_ID_PATTERN, DatasetOriginWeek

from .deps import get_dispatch_service
from .schemas import DispatchRequest, DispatchResponse, Lang, UuidStr
from .service import DispatchService

router = APIRouter(prefix="/api/v1", tags=["dispatch"], responses=PROBLEM_RESPONSES)


def live_dispatch_runner(req: DispatchRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for dispatch plans."""
    resp = get_dispatch_service().notices(req)
    headline: dict[str, Any] = {
        "notices": len(resp.notices),
        "stock_pct": req.stock_pct,
        "crews": sum(n.facts.crews_assigned for n in resp.notices),
        "critical_wards": sum(1 for n in resp.notices if n.facts.deficit_level == "critical"),
        "deficit_wards": sum(1 for n in resp.notices if n.facts.deficit_level != "none"),
    }
    return resp.model_dump(mode="json"), headline


# Alias kept so app/main.py picks up the live runner without modifying main.py.
stub_dispatch_runner = live_dispatch_runner


@router.post(
    "/dispatch/notices",
    response_model=DispatchResponse,
    summary="Generate deterministic SMS, WhatsApp, and brief URL dispatch notices",
)
async def create_dispatch_notices(
    req: DispatchRequest,
    service: Annotated[DispatchService, Depends(get_dispatch_service)],
) -> DispatchResponse:
    return await asyncio.to_thread(service.notices, req)


@router.get(
    "/dispatch/brief/{ward_id}.html",
    response_class=HTMLResponse,
    summary="Self-contained printable A4 commissioner brief (HTML)",
    responses={
        200: {
            "description": "Self-contained A4 portrait printable HTML brief",
            "content": {"text/html": {"schema": {"type": "string"}}},
        },
        **PROBLEM_RESPONSES,
    },
)
async def get_commissioner_brief(
    service: Annotated[DispatchService, Depends(get_dispatch_service)],
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN, max_length=32)],
    origin_week: Annotated[
        DatasetOriginWeek,
        Query(description="Monday of the last observed week; 2016-02-29 … 2025-12-29"),
    ],
    lang: Annotated[Lang, Query()] = "en",
    plan_id: Annotated[UuidStr | None, Query()] = None,
    stock_pct: Annotated[int, Query(ge=30, le=100)] = 100,
    total_crews: Annotated[int, Query(ge=0, le=300)] = 0,
) -> HTMLResponse:
    doc = await asyncio.to_thread(
        service.brief_html,
        ward_id=ward_id,
        origin_week=origin_week,
        lang=lang,
        plan_id=plan_id,
        stock_pct=stock_pct,
        total_crews=total_crews,
    )
    return HTMLResponse(content=doc, status_code=200)
