"""Forecast slice HTTP router: POST /api/v1/forecast and POST /api/v1/scenario."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.core.errors import PROBLEM_RESPONSES

from .deps import get_forecast_service
from .schemas import ForecastRequest, ForecastResponse, ScenarioRequest, ScenarioResponse
from .service import ForecastService

router = APIRouter(prefix="/api/v1", tags=["forecast"], responses=PROBLEM_RESPONSES)


@router.post("/forecast", response_model=ForecastResponse, summary="Forecast cases, band, tier and drivers")
async def forecast(
    req: ForecastRequest,
    svc: ForecastService = Depends(get_forecast_service),
) -> ForecastResponse:
    return await asyncio.to_thread(svc.forecast, req)


@router.post("/scenario", response_model=ScenarioResponse, summary="What-if weather for the origin week")
async def scenario(
    req: ScenarioRequest,
    svc: ForecastService = Depends(get_forecast_service),
) -> ScenarioResponse:
    return await asyncio.to_thread(svc.scenario, req)
