"""HTTP router for GET /api/v1/planning/structural (ADR-0021)."""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import City

from .deps import get_planning_service
from .schemas import StructuralPlannerResponse
from .service import PlanningService

router = APIRouter(prefix="/api/v1", tags=["planning"], responses=PROBLEM_RESPONSES)

CACHE_CONTROL_STRUCTURAL = "public, max-age=3600"


@router.get(
    "/planning/structural",
    response_model=StructuralPlannerResponse,
    summary="Structural-fix planner (Poisson GLM + LightGBM PD + Build vs Send)",
)
def planning_structural(
    request: Request,
    response: Response,
    city: City | None = Query(default=None, description="Optional city filter"),
    svc: PlanningService = Depends(get_planning_service),
) -> StructuralPlannerResponse | Response:
    result = svc.get_structural(city=city)
    digest = hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_STRUCTURAL
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=304,
            headers={"ETag": etag, "Cache-Control": CACHE_CONTROL_STRUCTURAL},
        )
    return result
