"""Validation slice HTTP router: GET /api/v1/validation — stored chronological backtest results."""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Request, Response

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_validation_service
from .schemas import ValidationResponse
from .service import ValidationService

router = APIRouter(prefix="/api/v1", tags=["validation"], responses=PROBLEM_RESPONSES)

CACHE_CONTROL_VALIDATION = "public, max-age=3600"


@router.get("/validation", response_model=ValidationResponse, summary="Backtest metrics vs baselines")
def validation(
    request: Request,
    response: Response,
    svc: ValidationService = Depends(get_validation_service),
) -> ValidationResponse | Response:
    result = svc.get_validation()
    digest = hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_VALIDATION
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL_VALIDATION})
    return result
