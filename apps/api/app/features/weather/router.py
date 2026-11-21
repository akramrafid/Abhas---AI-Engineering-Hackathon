"""Weather slice HTTP router: GET /api/v1/weather/status."""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Request, Response

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_weather_service
from .schemas import WeatherStatus
from .service import WeatherService

router = APIRouter(prefix="/api/v1/weather", tags=["weather"], responses=PROBLEM_RESPONSES)

CACHE_CONTROL_WEATHER = "public, max-age=60"


@router.get("/status", response_model=WeatherStatus, summary="Weather source, cache age and call count")
def weather_status(
    request: Request,
    response: Response,
    svc: WeatherService = Depends(get_weather_service),
) -> WeatherStatus | Response:
    result = svc.status()
    digest = hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest()[:16]
    etag = f'W/"{digest}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_WEATHER
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL_WEATHER})
    return result
