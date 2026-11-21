"""Tests for weather slice: GET /api/v1/weather/status + service unit test."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.types import CITIES, WeatherMode, WeatherSourceUsed
from app.features.weather.service import WeatherService
from app.main import create_app


@dataclass(frozen=True)
class _FakeCitySnap:
    city: str
    latitude: float
    longitude: float
    source: WeatherSourceUsed
    last_fetched_at: datetime | None
    cache_age_hours: float | None


@dataclass(frozen=True)
class _FakeStatusSnap:
    mode: WeatherMode
    provider: str
    attribution: str
    ttl_hours: float
    bias_check_passed: bool | None
    cities: list[_FakeCitySnap]


class _FakeProvider:
    def status_snapshot(self) -> _FakeStatusSnap:
        return _FakeStatusSnap(
            mode="live",
            provider="Open-Meteo (CC BY 4.0)",
            attribution="Weather data by Open-Meteo.com (CC BY 4.0)",
            ttl_hours=6.0,
            bias_check_passed=True,
            cities=[
                _FakeCitySnap(
                    city=c,
                    latitude=23.72,
                    longitude=90.41,
                    source="live",
                    last_fetched_at=datetime(2025, 8, 10, 6, 0, tzinfo=UTC),
                    cache_age_hours=1.25,
                )
                for c in CITIES
            ],
        )


class _FakeCallLog:
    def record(self, kind: str, ok: bool, latency_ms: float, cost_usd: float = 0.0, detail: str = "") -> None:
        return None

    def today(self, kind: str) -> tuple[int, float]:
        return (2, 0.0) if kind == "weather" else (0, 0.0)


def test_weather_service_with_fakes() -> None:
    svc = WeatherService(provider=_FakeProvider(), call_log=_FakeCallLog())
    status = svc.status()
    assert status.mode == "live"
    assert status.calls_today == 2
    assert status.ttl_hours == 6.0
    assert status.bias_check_passed is True
    assert len(status.cities) == 5
    assert all(c.source == "live" and c.cache_age_hours == 1.25 for c in status.cities)


def test_weather_status_route() -> None:
    with TestClient(create_app()) as c:
        r = c.get("/api/v1/weather/status")
        assert r.status_code == 200
        assert "etag" in r.headers
        assert "max-age=" in r.headers.get("cache-control", "")
        body = r.json()
        assert body["mode"] in ("dataset", "live")
        assert "Open-Meteo" in body["provider"]
        assert "CC BY 4.0" in body["attribution"]
        assert body["ttl_hours"] == 6.0
        assert len(body["cities"]) == 5
        assert {c_row["city"] for c_row in body["cities"]} == set(CITIES)

        r304 = c.get("/api/v1/weather/status", headers={"If-None-Match": r.headers["etag"]})
        assert r304.status_code == 304
