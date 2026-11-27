"""Singleton factory for DB engine, repositories, and weather adapter.

Routers and slice deps obtain concrete adapters here so routers never import SQLAlchemy directly.
"""

from __future__ import annotations

import logging
from threading import RLock

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, func, inspect, select

from app.core.config import API_DIR, get_settings

from .engine import create_db_engine, normalize_database_url
from .facilities_repo import SqlFacilitiesStore, seed_hospitals_from_geojson
from .models import HospitalRow, WardRow
from .repositories import SqlCallLog, SqlObservationRepository, SqlPredictionCache, SqlWeatherCache

logger = logging.getLogger("abhas.db")

_lock = RLock()
_engines: dict[str, Engine] = {}
_bootstrapped_urls: set[str] = set()
_obs_repos: dict[str, SqlObservationRepository] = {}
_pred_caches: dict[str, SqlPredictionCache] = {}
_call_logs: dict[str, SqlCallLog] = {}
_weather_caches: dict[str, SqlWeatherCache] = {}
_facilities_stores: dict[str, SqlFacilitiesStore] = {}


def _default_url() -> str:
    return normalize_database_url(get_settings().database_url)


def get_engine(url: str | None = None) -> Engine:
    normalized = normalize_database_url(url) if url else _default_url()
    with _lock:
        engine = _engines.get(normalized)
        if engine is None:
            engine = create_db_engine(normalized)
            _engines[normalized] = engine
        return engine


def ensure_database_ready(url: str | None = None) -> Engine:
    """In dev/test, run Alembic migrations + idempotent seed once if the DB is empty."""
    normalized = normalize_database_url(url) if url else _default_url()
    engine = get_engine(normalized)
    if normalized in _bootstrapped_urls:
        return engine

    with _lock:
        if normalized in _bootstrapped_urls:
            return engine
        settings = get_settings()
        insp = inspect(engine)
        needs_migrate = (not insp.has_table("wards")) or (not insp.has_table("hospitals"))
        if needs_migrate and settings.app_env != "production":
            logger.info("Running Alembic upgrade head for database schema")
            cfg = Config(str(API_DIR / "alembic.ini"))
            cfg.attributes["url"] = normalized
            command.upgrade(cfg, "head")

        if inspect(engine).has_table("wards"):
            with engine.connect() as conn:
                ward_count = int(
                    conn.execute(select(func.count()).select_from(WardRow.__table__)).scalar_one()
                )
            if ward_count == 0 and settings.app_env != "production" and settings.raw_dataset_path.exists():
                logger.info("Seeding empty database from raw dataset")
                from scripts.seed import seed_database

                seed_database(engine=engine)

        if inspect(engine).has_table("hospitals"):
            with engine.connect() as conn:
                hosp_count = int(
                    conn.execute(select(func.count()).select_from(HospitalRow.__table__)).scalar_one()
                )
            if hosp_count == 0 and settings.app_env != "production":
                seeded_h = seed_hospitals_from_geojson(engine)
                if seeded_h > 0:
                    logger.info("Seeded %d OSM hospitals with labelled DEMO bed data", seeded_h)
        _bootstrapped_urls.add(normalized)
        return engine


def get_observation_repository(
    url: str | None = None, *, auto_bootstrap: bool = True
) -> SqlObservationRepository:
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    with _lock:
        repo = _obs_repos.get(normalized)
        if repo is None:
            repo = SqlObservationRepository(engine)
            _obs_repos[normalized] = repo
        return repo


def get_prediction_cache(url: str | None = None, *, auto_bootstrap: bool = True) -> SqlPredictionCache:
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    with _lock:
        cache = _pred_caches.get(normalized)
        if cache is None:
            cache = SqlPredictionCache(engine)
            _pred_caches[normalized] = cache
        return cache


def get_call_log(url: str | None = None, *, auto_bootstrap: bool = True) -> SqlCallLog:
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    with _lock:
        call_log = _call_logs.get(normalized)
        if call_log is None:
            call_log = SqlCallLog(engine)
            _call_logs[normalized] = call_log
        return call_log


def get_weather_cache(url: str | None = None, *, auto_bootstrap: bool = True) -> SqlWeatherCache:
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    with _lock:
        wcache = _weather_caches.get(normalized)
        if wcache is None:
            wcache = SqlWeatherCache(engine)
            _weather_caches[normalized] = wcache
        return wcache


def get_facilities_store(url: str | None = None, *, auto_bootstrap: bool = True) -> SqlFacilitiesStore:
    normalized = normalize_database_url(url) if url else _default_url()
    engine = ensure_database_ready(normalized) if auto_bootstrap else get_engine(normalized)
    with _lock:
        store = _facilities_stores.get(normalized)
        if store is None:
            store = SqlFacilitiesStore(engine)
            _facilities_stores[normalized] = store
        return store


def reset_factory() -> None:
    """Dispose all cached engines and clear singletons (primarily for tests)."""
    with _lock:
        for engine in _engines.values():
            engine.dispose()
        _engines.clear()
        _bootstrapped_urls.clear()
        _obs_repos.clear()
        _pred_caches.clear()
        _call_logs.clear()
        _weather_caches.clear()
