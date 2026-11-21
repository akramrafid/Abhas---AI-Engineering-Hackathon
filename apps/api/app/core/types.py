"""Shared contract types used by every slice's schemas.py (LEAD owns this file)."""

from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints

CITIES: tuple[str, ...] = ("Dhaka North", "Dhaka South", "Chattogram", "Gazipur", "Narayanganj")
City = Literal["Dhaka North", "Dhaka South", "Chattogram", "Gazipur", "Narayanganj"]

WARD_ID_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"
WardId = Annotated[
    str, StringConstraints(pattern=WARD_ID_PATTERN, max_length=32), Field(examples=["DSCC_Ward_07"])
]

TIERS: tuple[str, ...] = ("Low", "Medium", "High", "Critical")
Tier = Literal["Low", "Medium", "High", "Critical"]
TIER_BN: dict[str, str] = {"Low": "নিম্ন", "Medium": "মাঝারি", "High": "উচ্চ", "Critical": "সংকটপূর্ণ"}

Horizon = Annotated[int, Field(ge=1, le=4, description="Weeks ahead of the origin week (1–4)")]
WeatherMode = Literal["dataset", "live"]
WeatherSourceUsed = Literal["dataset", "live", "cache", "climatology"]

DATA_START = date(2016, 1, 4)
DATA_END = date(2025, 12, 29)
FIRST_FORECAST_ORIGIN = DATA_START + timedelta(weeks=8)  # 2016-02-29: all 0–8-week lags exist


def _monday(d: date) -> date:
    if d.weekday() != 0:
        raise ValueError("must be a Monday (ISO week start), e.g. 2025-08-04")
    return d


def in_dataset_range(d: date) -> date:
    if not FIRST_FORECAST_ORIGIN <= d <= DATA_END:
        raise ValueError(f"must be between {FIRST_FORECAST_ORIGIN} and {DATA_END} in dataset mode")
    return d


IsoWeek = Annotated[date, AfterValidator(_monday), Field(examples=["2025-08-04"])]
DatasetOriginWeek = Annotated[IsoWeek, AfterValidator(in_dataset_range)]
