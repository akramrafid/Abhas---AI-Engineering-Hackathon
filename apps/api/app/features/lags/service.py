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
        self._ward_series: dict[str, list[LagPoint]] = {}
        self._ward_city: dict[str, City] = {}
        self._missing_wards: set[str] = set()

    def _refresh_locked(self, sig: tuple[date, date]) -> int:
        obs = self._repo.all_observations()
        if not obs:
            self._cache_key = None
            self._dataset_corrs = []
            self._ward_corrs = {}
            self._ward_series = {}
            self._ward_city = {}
            self._missing_wards = set()
            return 0
        obs_df = observations_to_dataframe(obs)
        dataset_corrs, ward_corrs = compute_all_lag_correlations(obs_df, max_lag=MAX_RAIN_LAG)
        series_by_ward: dict[str, list[LagPoint]] = {}
        for o in obs:
            series_by_ward.setdefault(o.ward_id, []).append(
                LagPoint(week=o.week, rainfall_mm=o.rainfall_mm, dengue_cases=o.dengue_cases)
            )
        for pts in series_by_ward.values():
            pts.sort(key=lambda p: p.week)
        ward_cities: dict[str, City] = {w.ward_id: cast(City, w.city) for w in self._repo.wards()}

        self._cache_key = sig
        self._dataset_corrs = dataset_corrs
        self._ward_corrs = dict(ward_corrs)
        self._ward_series = series_by_ward
        self._ward_city = ward_cities
        self._missing_wards = set()
        return len(self._ward_corrs)

    def warm_cache(self) -> int:
        """Precompute and cache lag correlations for all wards once (CR-19). Returns warmed ward count."""
        sig = self._repo.date_range()
        with self._lock:
            if self._cache_key != sig:
                return self._refresh_locked(sig)
            return len(self._ward_corrs)

    def _ensure_cache_locked(self) -> None:
        sig = self._repo.date_range()
        if self._cache_key != sig:
            self._refresh_locked(sig)

    def ward_lags(self, ward_id: str, weeks: int = 156) -> LagResponse:
        with self._lock:
            self._ensure_cache_locked()
            city = self._ward_city.get(ward_id)
            w_corrs = self._ward_corrs.get(ward_id)
            series_all = self._ward_series.get(ward_id)
            dataset_corrs = list(self._dataset_corrs) if w_corrs is not None else None

        if city is None:
            ward_rec = self._repo.ward(ward_id)
            if ward_rec is None:
                raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")
            city = cast(City, ward_rec.city)

        if w_corrs is None or dataset_corrs is None or series_all is None:
            raise AppError(404, "unknown-ward", "Unknown ward", f"No observations for ward {ward_id}")

        correlations = [
            LagCorrelation(
                lag_weeks=k,
                ward_corr=w_corrs[k],
                dataset_corr=dataset_corrs[k],
            )
            for k in range(MAX_RAIN_LAG + 1)
        ]
        peak_ward = max(range(len(w_corrs)), key=lambda i: w_corrs[i])
        peak_dataset = max(range(len(dataset_corrs)), key=lambda i: dataset_corrs[i])
        tail = series_all[-weeks:] if weeks < len(series_all) else list(series_all)

        return LagResponse(
            ward_id=ward_id,
            city=city,
            max_lag=MAX_RAIN_LAG,
            peak_lag_ward=peak_ward,
            peak_lag_dataset=peak_dataset,
            correlations=correlations,
            series=tail,
        )


def warm_lags_cache(service: LagsService | None = None) -> int:
    """Warm the lag correlation cache at startup so the first lags request avoids cold-start latency (CR-19)."""
    if service is None:
        from .deps import get_lags_service

        service = get_lags_service()
    return service.warm_cache()
