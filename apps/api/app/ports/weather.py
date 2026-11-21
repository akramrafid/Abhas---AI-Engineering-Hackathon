"""Port: where weekly weather comes from (dataset rows, Open-Meteo, cache, climatology)."""

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class WeekWeather:
    """One ISO week (Monday start, Asia/Dhaka) in dataset units."""

    week: date
    avg_temp_c: float
    max_temp_c: float
    min_temp_c: float
    rainfall_mm: float  # weekly total, mm
    relative_humidity_pct: float
    source: str  # dataset | live | cache | climatology


class WeatherSource(Protocol):
    name: str

    def weekly(self, city: str, weeks: list[date]) -> list[WeekWeather]:
        """Weather for each requested week. Never raises for a missing week: fall back and label `source`."""
        ...
