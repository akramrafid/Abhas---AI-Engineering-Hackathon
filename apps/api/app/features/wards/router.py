"""Wards slice HTTP router: GET /api/v1/wards and GET /api/v1/wards/{ward_id}/history."""

from __future__ import annotations

import hashlib
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import WARD_ID_PATTERN, City

from .deps import get_wards_service
from .schemas import WardHistory, WardList
from .service import WardsService

router = APIRouter(prefix="/api/v1/wards", tags=["wards"], responses=PROBLEM_RESPONSES)

CACHE_CONTROL_STATIC = "public, max-age=300"


def _apply_cache_headers(request: Request, response: Response, payload_json: str) -> Response | None:
    digest = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_STATIC
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL_STATIC})
    return None


@router.get("", response_model=WardList, summary="List wards (optionally for one city)")
def list_wards(
    request: Request,
    response: Response,
    city: Annotated[City | None, Query()] = None,
    svc: WardsService = Depends(get_wards_service),
) -> WardList | Response:
    result = svc.list_wards(city=city)
    not_modified = _apply_cache_headers(request, response, result.model_dump_json())
    if not_modified is not None:
        return not_modified
    return result


@router.get("/{ward_id}/history", response_model=WardHistory, summary="Weekly observations for one ward")
def ward_history(
    request: Request,
    response: Response,
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN)],
    start: Annotated[date | None, Query()] = None,
    end: Annotated[date | None, Query()] = None,
    svc: WardsService = Depends(get_wards_service),
) -> WardHistory | Response:
    result = svc.ward_history(ward_id=ward_id, start=start, end=end)
    not_modified = _apply_cache_headers(request, response, result.model_dump_json())
    if not_modified is not None:
        return not_modified
    return result
