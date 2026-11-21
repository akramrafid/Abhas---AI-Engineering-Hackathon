"""Tests for Open-Meteo adapter (AC-15): 1 call / 6h across 5 cities, retry, circuit breaker, fallback."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from alembic import command
from alembic.config import Config

from app.adapters.db.engine import create_db_engine
from app.adapters.db.models import ObservationRow, WardRow
from app.adapters.db.repositories import SqlCallLog, SqlObservationRepository, SqlWeatherCache
from app.adapters.openmeteo import OpenMeteoWeatherSource, aggregate_daily_to_iso_weeks
from app.core.config import API_DIR
from app.core.types import CITIES


def _migrated_test_db(tmp_path: Path):
    db_file = tmp_path / "openmeteo_test.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)

    # Seed one ward per city with 4 training-year observations so climatology is populated
    prefixes = {
        "Dhaka North": "DNCC",
        "Dhaka South": "DSCC",
        "Chattogram": "CCC",
        "Gazipur": "GCC",
        "Narayanganj": "NCC",
    }
    wards = [
        {
            "ward_id": f"{prefixes[c]}_Ward_01",
            "city": c,
            "population_density_sqkm": 40000.0,
            "water_logging_risk_index": 0.6,
            "sanitation_score": 0.5,
        }
        for c in CITIES
    ]
    obs = []
    base_week = date(2023, 8, 7)
    for w in wards:
        for i in range(4):
            obs.append(
                {
                    "ward_id": w["ward_id"],
                    "week": base_week + timedelta(weeks=i),
                    "avg_temp_c": 29.5,
                    "max_temp_c": 33.0,
                    "min_temp_c": 26.0,
                    "rainfall_mm": 88.0,
                    "relative_humidity_pct": 84.0,
                    "dengue_cases": 10,
                }
            )
    with engine.begin() as conn:
        conn.execute(WardRow.__table__.insert(), wards)
        conn.execute(ObservationRow.__table__.insert(), obs)
    return engine


def _openmeteo_5city_payload(start_monday: date, n_weeks: int = 3) -> list[dict[str, Any]]:
    days = [start_monday + timedelta(days=d) for d in range(n_weeks * 7)]
    times = [d.isoformat() for d in days]
    out: list[dict[str, Any]] = []
    for idx, _city in enumerate(CITIES):
        daily_rain = 10.0 + idx  # 7 days -> weekly sum = 70 + 7*idx
        out.append(
            {
                "latitude": 23.7,
                "longitude": 90.4,
                "daily": {
                    "time": times,
                    "temperature_2m_mean": [28.0 + idx * 0.5] * len(days),
                    "temperature_2m_max": [32.0 + idx * 0.5] * len(days),
                    "temperature_2m_min": [24.0 + idx * 0.5] * len(days),
                    "precipitation_sum": [daily_rain] * len(days),
                    "relative_humidity_2m_mean": [80.0] * len(days),
                },
            }
        )
    return out


def test_aggregate_daily_to_iso_weeks_sums_rain_and_averages_temp() -> None:
    daily = {
        "time": [f"2025-08-{d:02d}" for d in range(4, 11)],  # Mon 2025-08-04 .. Sun 2025-08-10
        "temperature_2m_mean": [28.0, 29.0, 30.0, 28.0, 29.0, 30.0, 28.0],
        "temperature_2m_max": [32.0, 33.0, 35.0, 32.0, 33.0, 34.0, 31.0],
        "temperature_2m_min": [25.0, 24.0, 26.0, 25.0, 24.0, 25.0, 23.0],
        "precipitation_sum": [10.0, 20.0, 0.0, 15.0, 5.0, 30.0, 20.0],
        "relative_humidity_2m_mean": [80.0] * 7,
    }
    weekly = aggregate_daily_to_iso_weeks(daily)
    assert date(2025, 8, 4) in weekly
    wk = weekly[date(2025, 8, 4)]
    assert wk["rainfall_mm"] == pytest.approx(100.0)
    assert wk["max_temp_c"] == pytest.approx(35.0)
    assert wk["min_temp_c"] == pytest.approx(23.0)
    assert wk["relative_humidity_pct"] == pytest.approx(80.0)


def test_ac_15_openmeteo_cache_and_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-15: At most 1 Open-Meteo call per 6h across all 5 cities;
    openmeteo_timeout / openmeteo_5xx falls back to cache then climatology and labels `source`."""
    engine = _migrated_test_db(tmp_path)
    try:
        repo = SqlObservationRepository(engine)
        wcache = SqlWeatherCache(engine)
        call_log = SqlCallLog(engine)

        target_week = date(2025, 8, 4)
        payload = _openmeteo_5city_payload(target_week, n_weeks=2)
        http_calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal http_calls
            http_calls += 1
            assert "past_days=92" in str(request.url)
            assert "forecast_days=16" in str(request.url)
            return httpx.Response(200, json=payload)

        now_box = [datetime(2025, 8, 10, 6, 0, tzinfo=UTC)]
        client = httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
        )
        src = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=wcache,
            call_log=call_log,
            mode="live",
            ttl_hours=6.0,
            app_env="test",
            client=client,
            clock=lambda: now_box[0],
            retry_base_s=0.0,
        )

        # Query ALL 5 cities within 6h TTL -> must trigger AT MOST 1 HTTP request total!
        # Versioned city_centroids.json applies per-city bias correction (e.g. Dhaka North rain_scale=1.011).
        first = src.weekly("Dhaka North", [target_week])
        assert len(first) == 1
        assert first[0].source == "live"
        assert first[0].rainfall_mm == pytest.approx(round(70.0 * 1.011, 2))

        expected_scales = [1.016, 0.797, 0.96, 0.959]
        for idx, (city, scale) in enumerate(zip(CITIES[1:], expected_scales, strict=True), start=1):
            rows = src.weekly(city, [target_week])
            assert len(rows) == 1
            assert rows[0].source == "cache"
            assert rows[0].rainfall_mm == pytest.approx(round((70.0 + 7.0 * idx) * scale, 2))

        assert http_calls == 1, f"Expected 1 multi-city call in 6h, got {http_calls}"
        calls_today, _ = call_log.today("weather")
        assert calls_today == 1

        # Advance past 6h TTL and inject openmeteo_timeout -> falls back to last cache!
        now_box[0] = now_box[0] + timedelta(hours=6, minutes=5)
        monkeypatch.setenv("FAULT_INJECT", "openmeteo_timeout")
        fallback_cached = src.weekly("Dhaka South", [target_week])
        assert len(fallback_cached) == 1
        assert fallback_cached[0].source == "cache"
        assert fallback_cached[0].rainfall_mm == pytest.approx(round(77.0 * 1.016, 2))
        assert http_calls == 1  # Fault injected before transport

        # Request an uncached week with FAULT_INJECT=openmeteo_5xx -> falls back to climatology!
        monkeypatch.setenv("FAULT_INJECT", "openmeteo_5xx")
        uncached_week = date(2025, 11, 10)
        fallback_clim = src.weekly("Dhaka South", [uncached_week])
        assert len(fallback_clim) == 1
        assert fallback_clim[0].source == "climatology"
        assert fallback_clim[0].rainfall_mm == pytest.approx(88.0)

        # Verify status snapshot reports all 5 cities and stale cache source cleanly
        snap = src.status_snapshot()
        assert snap.mode == "live"
        assert len(snap.cities) == 5
        assert all(c.source == "cache" and c.cache_age_hours is not None for c in snap.cities)
        client.close()
    finally:
        engine.dispose()


def test_openmeteo_retries_and_circuit_breaker(tmp_path: Path) -> None:
    engine = _migrated_test_db(tmp_path)
    try:
        repo = SqlObservationRepository(engine)
        wcache = SqlWeatherCache(engine)
        call_log = SqlCallLog(engine)
        target_week = date(2025, 8, 4)
        payload = _openmeteo_5city_payload(target_week, n_weeks=1)

        # 1) Retries 429 + 503 then succeeds on attempt 3
        responses = [
            httpx.Response(429, headers={"Retry-After": "0"}),
            httpx.Response(503, text="upstream down"),
            httpx.Response(200, json=payload),
        ]
        attempts = 0

        def retry_handler(_req: httpx.Request) -> httpx.Response:
            nonlocal attempts
            resp = responses[attempts]
            attempts += 1
            return resp

        c1 = httpx.Client(
            transport=httpx.MockTransport(retry_handler),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
        )
        src1 = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=wcache,
            call_log=call_log,
            mode="live",
            app_env="test",
            client=c1,
            retry_base_s=0.0,
        )
        res = src1.weekly("Dhaka South", [target_week])
        assert attempts == 3
        assert res[0].source == "live"
        c1.close()

        # 2) Never retries 400; circuit breaker opens after threshold=2 failures
        bad_attempts = 0

        def bad_handler(_req: httpx.Request) -> httpx.Response:
            nonlocal bad_attempts
            bad_attempts += 1
            return httpx.Response(400, text="bad request")

        now = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
        c2 = httpx.Client(
            transport=httpx.MockTransport(bad_handler),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
        )
        src2 = OpenMeteoWeatherSource(
            repo=repo,
            weather_cache=None,
            call_log=call_log,
            mode="live",
            app_env="test",
            client=c2,
            clock=lambda: now,
            retry_base_s=0.0,
            breaker_threshold=2,
            breaker_cooldown_s=300.0,
        )
        assert src2.weekly("Chattogram", [target_week])[0].source == "climatology"
        assert bad_attempts == 1  # No retries on 400
        assert src2.weekly("Chattogram", [target_week])[0].source == "climatology"
        assert bad_attempts == 2  # Circuit now open
        assert src2.weekly("Chattogram", [target_week])[0].source == "climatology"
        assert bad_attempts == 2  # Skipped HTTP while breaker open!
        c2.close()
    finally:
        engine.dispose()


def test_dataset_mode_never_calls_openmeteo(tmp_path: Path) -> None:
    engine = _migrated_test_db(tmp_path)
    try:
        repo = SqlObservationRepository(engine)

        def fail_handler(_req: httpx.Request) -> httpx.Response:
            raise AssertionError("HTTP must never be called in dataset mode")

        client = httpx.Client(
            transport=httpx.MockTransport(fail_handler),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
        )
        src = OpenMeteoWeatherSource(repo=repo, mode="dataset", client=client)
        observed = src.weekly("Dhaka South", [date(2023, 8, 7), date(2026, 8, 10)])
        assert observed[0].source == "dataset"
        assert observed[0].rainfall_mm == pytest.approx(88.0)
        assert observed[1].source == "climatology"
        client.close()
    finally:
        engine.dispose()
