"""Business logic for the weather status vertical slice (framework-free)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol, cast

from app.core.types import City, WeatherMode, WeatherSourceUsed
from app.ports.repositories import CallLog

from .schemas import CityWeatherStatus, WeatherStatus


class CityStatusLike(Protocol):
    @property
    def city(self) -> str: ...
    @property
    def latitude(self) -> float: ...
    @property
    def longitude(self) -> float: ...
    @property
    def source(self) -> WeatherSourceUsed: ...
    @property
    def last_fetched_at(self) -> datetime | None: ...
    @property
    def cache_age_hours(self) -> float | None: ...


class WeatherStatusSnapshotLike(Protocol):
    @property
    def mode(self) -> WeatherMode: ...
    @property
    def provider(self) -> str: ...
    @property
    def attribution(self) -> str: ...
    @property
    def ttl_hours(self) -> float: ...
    @property
    def bias_check_passed(self) -> bool | None: ...
    @property
    def cities(self) -> Sequence[CityStatusLike]: ...


class WeatherStatusProvider(Protocol):
    def status_snapshot(self) -> WeatherStatusSnapshotLike: ...


class WeatherService:
    """Assembles WeatherStatus from the WeatherSource status snapshot and CallLog."""

    def __init__(self, provider: WeatherStatusProvider, call_log: CallLog) -> None:
        self._provider = provider
        self._call_log = call_log

    def status(self) -> WeatherStatus:
        snap = self._provider.status_snapshot()
        calls_today, _spend = self._call_log.today("weather")
        return WeatherStatus(
            mode=snap.mode,
            provider=snap.provider,
            attribution=snap.attribution,
            ttl_hours=snap.ttl_hours,
            calls_today=calls_today,
            bias_check_passed=snap.bias_check_passed,
            cities=[
                CityWeatherStatus(
                    city=cast(City, c.city),
                    latitude=c.latitude,
                    longitude=c.longitude,
                    source=c.source,
                    last_fetched_at=c.last_fetched_at,
                    cache_age_hours=c.cache_age_hours,
                )
                for c in snap.cities
            ],
        )
