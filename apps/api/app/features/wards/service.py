"""Business logic for the wards vertical slice (framework-free)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import cast

from app.core.errors import AppError
from app.core.types import CITIES, City
from app.ports.repositories import ObservationRepository, WardRecord

from .schemas import Ward, WardHistory, WardList, WeekObservation

LAG_WARMUP_WEEKS = 8


def _to_ward(rec: WardRecord) -> Ward:
    return Ward(
        ward_id=rec.ward_id,
        city=cast(City, rec.city),
        population_density_sqkm=rec.population_density_sqkm,
        water_logging_risk_index=rec.water_logging_risk_index,
        sanitation_score=rec.sanitation_score,
    )


class WardsService:
    """Queries wards and weekly historical observations through ObservationRepository."""

    def __init__(self, repo: ObservationRepository) -> None:
        self._repo = repo

    def list_wards(self, city: City | None = None) -> WardList:
        records = self._repo.wards(city=city)
        data_start, data_end = self._repo.date_range()
        first_origin = data_start + timedelta(weeks=LAG_WARMUP_WEEKS)
        return WardList(
            wards=[_to_ward(r) for r in records],
            cities=[cast(City, c) for c in CITIES],
            data_start=data_start,
            data_end=data_end,
            first_forecast_origin=first_origin,
        )

    def ward_history(
        self,
        ward_id: str,
        start: date | None = None,
        end: date | None = None,
    ) -> WardHistory:
        if start is not None and end is not None and start > end:
            raise AppError(
                422,
                "validation-error",
                "Invalid date range",
                f"start ({start.isoformat()}) must be on or before end ({end.isoformat()})",
            )
        ward_rec = self._repo.ward(ward_id)
        if ward_rec is None:
            raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")

        rows = self._repo.history(ward_id, start=start, end=end)
        weeks = [
            WeekObservation(
                week=o.week,
                avg_temp_c=o.avg_temp_c,
                max_temp_c=o.max_temp_c,
                min_temp_c=o.min_temp_c,
                rainfall_mm=o.rainfall_mm,
                relative_humidity_pct=o.relative_humidity_pct,
                dengue_cases=o.dengue_cases,
            )
            for o in rows
        ]
        return WardHistory(ward=_to_ward(ward_rec), weeks=weeks)
