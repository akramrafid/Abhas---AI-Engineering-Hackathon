"""Business logic for the lags vertical slice (framework-free)."""

from __future__ import annotations

from datetime import date
from threading import RLock
from typing import cast

from app.core.errors import AppError
from app.core.types import City
from app.ports.repositories import ObservationRepository
from app.shared.features import (
    MAX_RAIN_LAG,
    compute_all_lag_correlations,
    observations_to_dataframe,
)

from .schemas import LagCorrelation, LagPoint, LagResponse


class LagsService:
    """Computes ward & pooled deseasonalized rainfall lag 0..8 correlations + weekly series."""

    def __init__(self, repo: ObservationRepository) -> None:
        self._repo = repo
        self._lock = RLock()
        self._cache_key: tuple[date, date] | None = None
        self._dataset_corrs: list[float] = []
        self._ward_corrs: dict[str, list[float]] = {}

    def _get_correlations(self, ward_id: str) -> tuple[list[float], list[float]]:
        sig = self._repo.date_range()
        with self._lock:
            if self._cache_key != sig or ward_id not in self._ward_corrs:
                obs = self._repo.all_observations()
                obs_df = observations_to_dataframe(obs)
                dataset_corrs, ward_corrs = compute_all_lag_correlations(obs_df, max_lag=MAX_RAIN_LAG)
                self._cache_key = sig
                self._dataset_corrs = dataset_corrs
                self._ward_corrs = ward_corrs
            w_corrs = self._ward_corrs.get(ward_id)
            if w_corrs is None:
                raise AppError(404, "unknown-ward", "Unknown ward", f"No observations for ward {ward_id}")
            return list(self._dataset_corrs), list(w_corrs)

    def ward_lags(self, ward_id: str, weeks: int = 156) -> LagResponse:
        ward_rec = self._repo.ward(ward_id)
        if ward_rec is None:
            raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")

        dataset_corrs, ward_corrs = self._get_correlations(ward_id)
        correlations = [
            LagCorrelation(
                lag_weeks=k,
                ward_corr=ward_corrs[k],
                dataset_corr=dataset_corrs[k],
            )
            for k in range(MAX_RAIN_LAG + 1)
        ]
        peak_ward = max(range(len(ward_corrs)), key=lambda i: ward_corrs[i])
        peak_dataset = max(range(len(dataset_corrs)), key=lambda i: dataset_corrs[i])

        history = self._repo.history(ward_id)
        tail = history[-weeks:] if weeks < len(history) else history
        series = [
            LagPoint(
                week=o.week,
                rainfall_mm=o.rainfall_mm,
                dengue_cases=o.dengue_cases,
            )
            for o in tail
        ]

        return LagResponse(
            ward_id=ward_rec.ward_id,
            city=cast(City, ward_rec.city),
            max_lag=MAX_RAIN_LAG,
            peak_lag_ward=peak_ward,
            peak_lag_dataset=peak_dataset,
            correlations=correlations,
            series=series,
        )
