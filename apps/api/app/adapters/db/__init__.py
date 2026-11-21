"""Database adapter package (SQLAlchemy 2.0 + SQLite WAL / Postgres compatible)."""

from .engine import create_db_engine, normalize_database_url
from .factory import (
    ensure_database_ready,
    get_call_log,
    get_engine,
    get_observation_repository,
    get_prediction_cache,
    get_weather_cache,
    reset_factory,
)
from .models import (
    ApiCallRow,
    Base,
    LlmTraceRow,
    ObservationRow,
    PredictionCacheRow,
    WardRow,
    WeatherCacheRow,
)
from .repositories import (
    SqlCallLog,
    SqlObservationRepository,
    SqlPredictionCache,
    SqlWeatherCache,
    WeatherCacheEntry,
)

__all__ = [
    "ApiCallRow",
    "Base",
    "LlmTraceRow",
    "ObservationRow",
    "PredictionCacheRow",
    "SqlCallLog",
    "SqlObservationRepository",
    "SqlPredictionCache",
    "SqlWeatherCache",
    "WardRow",
    "WeatherCacheEntry",
    "WeatherCacheRow",
    "create_db_engine",
    "ensure_database_ready",
    "get_call_log",
    "get_engine",
    "get_observation_repository",
    "get_prediction_cache",
    "get_weather_cache",
    "normalize_database_url",
    "reset_factory",
]
