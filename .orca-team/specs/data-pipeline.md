ROLE: DATA · roles 6 & 7 Data + Database engineer · hat design/build
LEAD_BRANCH: lead
TASK: data-pipeline — SQLite/Alembic schema, seed, canonical lag features, Open-Meteo adapter, wards/lags/weather slices          WAVE: 1A      FEATURE: wards, lags, weather
MODEL: antigravity · Gemini 4 Neon (XHigh)
SKILLS: production-standards, verification-before-completion, data-engineering, database-engineering, backend-engineering
GOAL: Lock the SQLite/Alembic database schema (`migrations/`), seed all 31,320 rows from `data/raw/hackathon_preli_dataset.xlsx` quickly (< 5 s via bulk insert), implement THE single canonical lag/feature builder (`app/shared/features.py`), wire real `wards`, `lags`, and `weather` slices plus the Open-Meteo adapter (`app/adapters/openmeteo.py`), and prove zero temporal/cross-ward leakage (`AC-1`, `AC-2`, `AC-15`).
OWNED PATHS (only these may be edited):
  - apps/api/alembic.ini
  - apps/api/migrations/**
  - apps/api/app/adapters/db/**
  - apps/api/app/adapters/openmeteo.py
  - apps/api/app/shared/features.py
  - apps/api/app/features/wards/** (EXCEPT schemas.py)
  - apps/api/app/features/lags/** (EXCEPT schemas.py)
  - apps/api/app/features/weather/** (EXCEPT schemas.py)
  - apps/api/scripts/**
  - apps/api/config/**
  - apps/api/tests/features/wards/**
  - apps/api/tests/features/lags/**
  - apps/api/tests/features/weather/**
  - apps/api/tests/test_features_lags.py
  - apps/api/tests/test_openmeteo.py
  - docs/data-model.md
  - docs/data-pipeline.md
READ-ONLY CONTEXT: TASK.md, docs/PRD.md (AC-1, AC-2, AC-4, AC-9, AC-15), docs/architecture.md, docs/adr/0001..0005.md, docs/KICKOFF-PROMPT.md (§3, §4, §8), contracts/openapi.json, .orca-team/PLAN.md, apps/api/app/core/*.py, apps/api/app/ports/*.py, apps/api/app/features/{wards,lags,weather}/schemas.py
CONTRACT:
  - Must implement `app/ports/repositories.py` (`ObservationRepository`, `PredictionCache`, `CallLog`) in `app/adapters/db/` using SQLAlchemy 2.0 + SQLite WAL mode (`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;`) while remaining Postgres-compatible (Alembic migrations).
  - Tables in first Alembic revision (`apps/api/migrations/versions/0001_initial.py`): `wards`, `observations` (PK or UNIQUE `(ward_id, week)`, indexed on `(ward_id, week)` and `week`), `weather_cache`, `predictions_cache`, `api_calls`, `llm_traces`.
  - `apps/api/scripts/db_check.py` (invoked by `npm run db:check` / `gates.mjs migrations`): creates a temp empty SQLite DB, runs `alembic upgrade head` -> `downgrade base` -> `upgrade head`, asserts all 6 tables & constraints exist, exits 0.
  - `apps/api/scripts/seed.py` (invoked by `npm run seed` and `npm run setup`): idempotently reads `data/raw/hackathon_preli_dataset.xlsx` (sheet `bangladesh_dengue_large_dataset`, verifies SHA-256 `3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405`, normalises `avg_temp_C` -> `avg_temp_c` case-insensitively), bulk-inserts 60 wards + 31,320 observations cleanly in < 10 s (use SQLite executemany / SQLAlchemy Core bulk insert; optionally also support fast path if already seeded with 31,320 rows so repeated setup is instant). NEVER modify `data/raw/`.
  - `apps/api/app/shared/features.py`: THE single feature builder imported by training, backtest, and serving. Must accept weekly observations + ward static attributes + optional fitted training-year (`<= 2023`) ward×ISO-week rain normals (`fit_rain_normals(df, max_year=2023)`). Computes:
    * `avg_temp_c`, `rainfall_mm`, `relative_humidity_pct` (asserting non-null)
    * `rainfall_lag_0..8` grouped strictly by `ward_id` on date-sorted rows (first k rows per ward MUST be NaN!)
    * rolling rain sums (`rain_sum_0_3`, `rain_sum_4_7`), rain anomaly vs training-year ward×ISO-week normal
    * `temp_lag_0..3`, `temp_mean_4w`, `humidity_lag_0..3`, `humidity_mean_4w`
    * static ward factors (`population_density_sqkm`, `water_logging_risk_index`, `sanitation_score`)
    * target-week seasonality (`iso_week_sin`, `iso_week_cos`, handling ISO week 53 cleanly) for any horizon `h in {1,2,3,4}`
    * STRICT temporal guarantee: features at `origin_week t` use ONLY observations with `week <= t`!
    * Helper `compute_lag_correlations(obs_df, ward_id, max_lag=8)` computing ward×ISO-week-demeaned rain (lagged k) vs demeaned cases Pearson correlation for both `ward_id` and pooled 60-ward dataset (must peak at lag 3!).
  - `apps/api/app/adapters/openmeteo.py`: implements `WeatherSource` with versioned `apps/api/config/city_centroids.json` (5 Bangladesh cities with lat/lon + sources), ONE multi-location `httpx.Client(timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0))` request (`past_days=92&forecast_days=16`), 2 retries with jitter on 429/5xx, simple circuit breaker, 6 h TTL in `weather_cache`, fallback chain `live -> last cache -> ward climatology`, and `FAULT_INJECT` support (`openmeteo_timeout`, `openmeteo_5xx`) when `APP_ENV=test`.
  - `apps/api/app/features/{wards,lags,weather}/`: clean `service.py` (NO FastAPI/SQLAlchemy/httpx imports — `gates.mjs slices` enforces this!) + `router.py` (NO direct SQLAlchemy imports — obtain repository/weather adapter via factory in `app/adapters/db/factory.py`!). Wire real DB queries to `GET /api/v1/wards`, `GET /api/v1/wards/{ward_id}/history`, `GET /api/v1/wards/{ward_id}/lags`, `GET /api/v1/weather/status`. Return 404 problem+json with `type` ending in `/unknown-ward` for unknown wards. Add ETag / `Cache-Control` headers on GET routes.
  - Write `docs/data-model.md` (ERD + table specs + indexes) and `docs/data-pipeline.md` (dataset measurements verified, lag correlation verification, Open-Meteo vs dataset historical bias check script `apps/api/scripts/check_openmeteo_bias.py` + recorded results or documented offline/network note if archive check runs).
ACCEPTANCE CRITERIA (name tests after AC ids so `gates.mjs prd` tracks them):
  AC-1 (`test_ac_1_ward_lags_route`): GET `/api/v1/wards/{ward_id}/lags` returns lags 0–8 with ward & dataset deseasonalized correlations; dataset-wide series peaks at lag 3; unknown ward returns 404 problem+json ending in `/unknown-ward`.
  AC-2 (`test_ac_2_lags_grouped_by_ward`): `avg_temp_c` (`avg_temp_C`), `rainfall_mm`, `relative_humidity_pct` ingested per `ward_id` with zero nulls; first k rows of every lag-k feature are NaN for every ward; zero cross-ward contamination; zero future (`> origin_week`) leakage.
  AC-15 (`test_ac_15_openmeteo_cache_and_fallback`): At most 1 Open-Meteo call per 6 h across all 5 cities; `openmeteo_timeout`/`openmeteo_5xx` falls back to cache then climatology and labels `source`.
GATE TO PASS: node .orca-team/tools/gates.mjs migrations slices   (+ npm run ci)
ENV VARS NEEDED: none (runs offline against data/raw xlsx + mocked httpx for Open-Meteo tests)
DEV PORT: 8001
OUT OF SCOPE: Do not edit `app/main.py`, `app/core/`, `app/ports/`, any `schemas.py`, `ml/`, `evals/`, or `features/{forecast,heatmap,validation,advisory,ops}/`. Note: `test_skeleton.py` and `smoke.mjs` must still pass (make sure `GET /api/v1/wards` and `/lags` auto-seed or handle unseeded DB gracefully in dev/test, or run `npm run db:migrate && npm run seed` cleanly in setup).
DONE WHEN: All ACs pass, `npm run db:check`, `npm run seed`, `node .orca-team/tools/gates.mjs migrations slices`, and `npm run ci` are green, committed on your branch, and `worker_done` is sent.
