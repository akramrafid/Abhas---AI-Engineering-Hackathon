"""Port: counterfactual forecaster for vector-control simulation and crew assignment (contracts §5; ADR-0013)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Protocol

from app.ports.forecast_model import PointForecast

__all__ = ["CounterfactualForecaster", "PointForecast"]


class CounterfactualForecaster(Protocol):
    """ForecastEngine extension applying breeding-water reductions strictly at the feature level (ADR-0013)."""

    def window(
        self,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int],
    ) -> Mapping[tuple[str, int], PointForecast]:
        """Return baseline PointForecasts keyed by (ward_id, horizon)."""
        ...

    def counterfactual(
        self,
        ward_ids: Sequence[str],
        origin_week: date,
        horizons: Sequence[int],
        fractions: Mapping[str, float],
    ) -> Mapping[tuple[str, int], PointForecast]:
        """Return counterfactual PointForecasts with per-ward reduction fractions applied to monotone rain features.

        Must never mutate raw weather and must never write counterfactual results to predictions_cache.
        """
        ...

    def nb_size(self, horizon: int) -> float:
        """Return the calibrated negative-binomial dispersion size parameter r_h for the given horizon."""
        ...
