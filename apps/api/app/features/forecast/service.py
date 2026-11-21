"""Business logic for the forecast & scenario vertical slice (framework-free)."""

from __future__ import annotations

from typing import cast

from app.core.types import City, Tier
from app.shared.forecast_engine import EngineHorizonForecast, ForecastEngine

from .schemas import (
    Driver,
    ForecastRequest,
    ForecastResponse,
    HorizonForecast,
    ScenarioRequest,
    ScenarioResponse,
    WardForecast,
)


def _to_horizon_schema(hf: EngineHorizonForecast) -> HorizonForecast:
    return HorizonForecast(
        horizon=hf.horizon,
        target_week=hf.target_week,
        expected_cases=hf.expected_cases,
        p10=hf.p10,
        p90=hf.p90,
        risk_score=hf.risk_score,
        tier=cast(Tier, hf.tier),
        tier_escalated=hf.tier_escalated,
        drivers=[
            Driver(
                key=d.key,
                label=d.label,
                effect_pct=d.effect_pct,
                direction=d.direction,
            )
            for d in hf.drivers
        ],
    )


class ForecastService:
    """Thin slice service delegating domain computation to shared ForecastEngine."""

    def __init__(self, engine: ForecastEngine) -> None:
        self._engine = engine

    def forecast(self, req: ForecastRequest) -> ForecastResponse:
        batch = self._engine.forecast(
            ward_ids=req.ward_ids,
            origin_week=req.origin_week,
            horizons=req.horizons,
            source=req.source,
        )
        return ForecastResponse(
            origin_week=batch.origin_week,
            source=batch.source,
            weather_source=batch.weather_source,
            model_version=batch.model_version,
            generated_at=batch.generated_at,
            cached=batch.cached,
            forecasts=[
                WardForecast(
                    ward_id=wf.ward_id,
                    city=cast(City, wf.city),
                    peak_tier=cast(Tier, wf.peak_tier),
                    horizons=[_to_horizon_schema(hf) for hf in wf.horizons],
                )
                for wf in batch.forecasts
            ],
        )

    def scenario(self, req: ScenarioRequest) -> ScenarioResponse:
        override: dict[str, float] = {}
        if req.weather.rainfall_mm is not None:
            override["rainfall_mm"] = float(req.weather.rainfall_mm)
        if req.weather.avg_temp_c is not None:
            override["avg_temp_c"] = float(req.weather.avg_temp_c)
        if req.weather.relative_humidity_pct is not None:
            override["relative_humidity_pct"] = float(req.weather.relative_humidity_pct)

        res = self._engine.scenario(
            ward_id=req.ward_id,
            origin_week=req.origin_week,
            horizons=req.horizons,
            weather_override=override,
        )
        return ScenarioResponse(
            ward_id=res.ward_id,
            origin_week=res.origin_week,
            model_version=res.model_version,
            weather=req.weather,
            baseline=[_to_horizon_schema(hf) for hf in res.baseline],
            scenario=[_to_horizon_schema(hf) for hf in res.scenario],
        )
