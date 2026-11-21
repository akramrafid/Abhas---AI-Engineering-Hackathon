"""Lags slice HTTP router: GET /api/v1/wards/{ward_id}/lags."""

from __future__ import annotations

import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import WARD_ID_PATTERN

from .deps import get_lags_service
from .schemas import LagResponse
from .service import LagsService

router = APIRouter(prefix="/api/v1/wards", tags=["lags"], responses=PROBLEM_RESPONSES)

CACHE_CONTROL_LAGS = "public, max-age=300"


@router.get("/{ward_id}/lags", response_model=LagResponse, summary="Rainfall lag 0–8 evidence for one ward")
def ward_lags(
    request: Request,
    response: Response,
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN)],
    weeks: Annotated[int, Query(ge=26, le=522)] = 156,
    svc: LagsService = Depends(get_lags_service),
) -> LagResponse | Response:
    result = svc.ward_lags(ward_id=ward_id, weeks=weeks)
    digest = hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_LAGS
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL_LAGS})
    return result
