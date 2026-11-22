"""Heatmap slice HTTP router: GET /api/v1/heatmap — ward × horizon tiers for one city."""

from __future__ import annotations

import asyncio
import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import City, IsoWeek, WeatherMode

from .deps import get_heatmap_service
from .schemas import HeatmapQuery, HeatmapResponse
from .service import HeatmapService

router = APIRouter(prefix="/api/v1", tags=["heatmap"], responses=PROBLEM_RESPONSES)


def _parse_heatmap_query(
    request: Request,
    city: Annotated[City, Query()],
    origin_week: Annotated[IsoWeek, Query()],
    source: Annotated[WeatherMode, Query()] = "dataset",
) -> HeatmapQuery:
    """Validate GET /api/v1/heatmap query params through HeatmapQuery (CR-3 bounds + extra='forbid').

    Preserves the committed OpenAPI query parameter schema/order while enforcing HeatmapQuery
    at the FastAPI boundary before entering HeatmapService.
    """
    raw: dict[str, object] = {
        **dict(request.query_params),
        "city": city,
        "origin_week": origin_week,
        "source": source,
    }
    try:
        return HeatmapQuery.model_validate(raw)
    except ValidationError as exc:
        errs = [{**err, "loc": ("query", *err.get("loc", ()))} for err in exc.errors()]
        raise RequestValidationError(errs) from exc


@router.get("/heatmap", response_model=HeatmapResponse, summary="Tier per ward × horizon for a city")
async def heatmap(
    request: Request,
    response: Response,
    query: Annotated[HeatmapQuery, Depends(_parse_heatmap_query)],
    svc: HeatmapService = Depends(get_heatmap_service),
) -> HeatmapResponse | Response:
    result = await asyncio.to_thread(
        svc.heatmap, city=query.city, origin_week=query.origin_week, source=query.source
    )
    cache_ctrl = "public, max-age=300" if query.source == "dataset" else "public, max-age=60"
    digest = hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_ctrl
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": cache_ctrl})
    return result
