"""Business logic for the city heatmap vertical slice (framework-free)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import cast

from app.core.errors import AppError
from app.core.types import City, Tier, WeatherMode
from app.ports.repositories import ObservationRepository
from app.shared.features import VALID_HORIZONS
from app.shared.forecast_engine import ForecastEngine, validate_origin_week
from app.shared.tiers import TIER_TO_IDX

from .schemas import HeatmapCell, HeatmapResponse


class HeatmapService:
    """Computes ward × horizon tier grid for all wards in a city, sorted by peak risk."""

    def __init__(
        self,
        repo: ObservationRepository,
        engine: ForecastEngine,
        db_fault_hook: Callable[[], None] | None = None,
    ) -> None:
        self._repo = repo
        self._engine = engine
        self._db_fault_hook = db_fault_hook

    def heatmap(self, *, city: City, origin_week: date, source: WeatherMode = "dataset") -> HeatmapResponse:
        if self._engine is not None:
            self._engine.validate_origin(origin_week, source=source)
        else:
            validate_origin_week(origin_week, source=source)
        if self._db_fault_hook is not None:
            self._db_fault_hook()
        try:
            wards = self._repo.wards(city=city)
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                status=503,
                slug="db-unavailable",
                title="Database unavailable",
                detail="Could not load city wards.",
            ) from exc

        if not wards:
            raise AppError(
                status=404, slug="unknown-city", title="Unknown city", detail=f"No wards in {city}"
            )

        ward_ids = [w.ward_id for w in wards]
        batch = self._engine.forecast(
            ward_ids=ward_ids,
            origin_week=origin_week,
            horizons=VALID_HORIZONS,
            source=source,
        )

        # Sort wards by peak tier desc, then max risk_score desc, then max expected_cases desc, then ward_id asc
        sorted_fcs = sorted(
            batch.forecasts,
            key=lambda wf: (
                -TIER_TO_IDX.get(wf.peak_tier, 0),
                -max((hf.risk_score for hf in wf.horizons), default=0),
                -max((hf.expected_cases for hf in wf.horizons), default=0.0),
                wf.ward_id,
            ),
        )

        ordered_ward_ids = [wf.ward_id for wf in sorted_fcs]
        cells: list[HeatmapCell] = []
        for wf in sorted_fcs:
            for hf in wf.horizons:
                cells.append(
                    HeatmapCell(
                        ward_id=wf.ward_id,
                        horizon=hf.horizon,
                        target_week=hf.target_week,
                        tier=cast(Tier, hf.tier),
                        expected_cases=hf.expected_cases,
                        risk_score=hf.risk_score,
                    )
                )

        return HeatmapResponse(
            city=city,
            origin_week=origin_week,
            source=source,
            model_version=batch.model_version,
            ward_ids=ordered_ward_ids,
            horizons=list(VALID_HORIZONS),
            cells=cells,
        )
