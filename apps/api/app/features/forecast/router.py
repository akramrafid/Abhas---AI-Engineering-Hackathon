"""STUB router (LEAD skeleton): schema-valid sample data. CORE (core-forecast) replaces bodies with the service."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.core.errors import PROBLEM_RESPONSES

from .schemas import (
    Driver,
    ForecastRequest,
    ForecastResponse,
    HorizonForecast,
    ScenarioRequest,
    ScenarioResponse,
    WardForecast,
)

router = APIRouter(prefix="/api/v1", tags=["forecast"], responses=PROBLEM_RESPONSES)

STUB_VERSION = "stub-0"


def _stub_horizon(origin, h: int, bump: float = 1.0) -> HorizonForecast:  # type: ignore[no-untyped-def]
    mean = round(3.0 * h * bump, 2)
    return HorizonForecast(
        horizon=h,
        target_week=origin + timedelta(weeks=h),
        expected_cases=mean,
        p10=round(mean * 0.5, 2),
        p90=round(mean * 1.6, 2),
        risk_score=min(100, int(mean * 8)),
        tier="Low" if mean < 3 else "Medium" if mean < 8 else "High" if mean < 14 else "Critical",
        tier_escalated=False,
        drivers=[Driver(key="rain_2_4w", label="Rain 2–4 weeks ago", effect_pct=60.0, direction="up")],
    )


@router.post("/forecast", response_model=ForecastResponse, summary="Forecast cases, band, tier and drivers")
def forecast(req: ForecastRequest) -> ForecastResponse:
    fcs = []
    for wid in req.ward_ids:
        hs = [_stub_horizon(req.origin_week, h) for h in sorted(req.horizons)]
        peak = max(hs, key=lambda x: ["Low", "Medium", "High", "Critical"].index(x.tier)).tier
        fcs.append(WardForecast(ward_id=wid, city="Dhaka South", peak_tier=peak, horizons=hs))
    return ForecastResponse(
        origin_week=req.origin_week,
        source=req.source,
        weather_source="dataset",
        model_version=STUB_VERSION,
        generated_at=datetime.now(UTC),
        cached=False,
        forecasts=fcs,
    )


@router.post("/scenario", response_model=ScenarioResponse, summary="What-if weather for the origin week")
def scenario(req: ScenarioRequest) -> ScenarioResponse:
    hs = sorted(req.horizons)
    return ScenarioResponse(
        ward_id=req.ward_id,
        origin_week=req.origin_week,
        model_version=STUB_VERSION,
        weather=req.weather,
        baseline=[_stub_horizon(req.origin_week, h) for h in hs],
        scenario=[_stub_horizon(req.origin_week, h, bump=1.3) for h in hs],
    )
