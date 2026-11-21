# ADR-0005: Dataset mode by default; live mode from one cached Open-Meteo multi-city call
## Status
Accepted · 2026-11-21
## Context
R2 needs weather ingestion; R6 rewards minimal API calls. The dataset already holds ward-level weekly weather
for 2016–2025. A live system needs current and forecast weather; Open-Meteo is free, keyless, non-commercial,
< 10,000 calls/day, CC BY 4.0. Ward coordinates are not in the dataset.
## Decision
`WEATHER_MODE=dataset` (default) reads weather from the seeded observations. `live` makes **one** multi-location
request for the five city centroids (`past_days=92&forecast_days=16`), aggregates to ISO weeks (Mon–Sun,
Asia/Dhaka) in dataset units, stores it in `weather_cache` with a 6 h TTL. Timeout 5 s connect / 10 s read,
2 retries with jitter on 429/5xx, circuit breaker; fallback chain: last cache → ward climatology normals, labelled
on screen. Centroids live in a versioned config file with sources; all wards of a city share one grid point and
ward factors carry local differences. Live predictions are trusted only after the Open-Meteo-vs-dataset
historical bias check in `docs/data-pipeline.md`.
## Rejected options
- **One request per ward or per page view** — 60× the calls, slow, risks rate limits.
- **Paid weather APIs (Tomorrow.io, Visual Crossing)** — need keys; break the zero-key run.
- **Satellite rainfall (GPM IMERG)** — latency and processing far beyond 24 hours.
## Consequences
At most 4 weather calls a day per office. Live mode carries a centroid-approximation badge.
