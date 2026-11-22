# Abhas API (`apps/api`)

FastAPI + LightGBM backend for ward-level dengue early warning across 60 wards in five Bangladesh city corporations (**Dhaka North, Dhaka South, Chattogram, Gazipur, Narayanganj**).

---

## Architecture Principles

- **Modular Monolith with Vertical Slices (ADR-0001):** Each capability lives in `app/features/<slice>/` (`router.py`, `service.py`, `schemas.py`, `deps.py`). Slices **never import another slice**; `service.py` stays free of FastAPI, SQLAlchemy, and external HTTP SDKs.
- **Hexagonal Ports & Adapters:** Domain code talks strictly to protocols in `app/ports/` (`repositories.py`, `forecast_model.py`, `weather.py`, `llm.py`, `chat_llm.py`). Concrete implementations live in `app/adapters/`.
- **Zero-Key Offline Default:** Boots out of the box with local SQLite WAL (`data/abhas.db`) and the committed 954 KiB LightGBM artifact (`ml/artifacts/current.joblib`).

## Directory Structure

```text
apps/api/
├── alembic/                 # Database migrations (0001_initial)
├── app/
│   ├── adapters/            # SQLAlchemy DB, LightGBM CPU, Open-Meteo, Claude, Gemini 2.5 Flash
│   ├── core/                # Typed config, RFC 9457 errors, rate limiter, security headers, logging
│   ├── features/            # 9 isolated slices: wards, lags, forecast, heatmap, validation, weather, advisory, chat, ops
│   ├── observability/       # Runtime metrics & SQLite call/trace logging
│   ├── ports/               # Protocol interfaces
│   ├── shared/              # Deterministic lag features, forecast engine, TreeSHAP drivers, risk tiers
│   └── main.py              # FastAPI app factory & middleware onion
├── config/city_centroids.json # 5 Bangladesh city centroids + ERA5 bias corrections
├── evals/                   # Locked hold-out eval, retrieval Recall@15, 30-vector security red-team
├── ml/                      # Training, Optuna tuning, backtest, artifact verifier & current.joblib
├── scripts/                 # Seeder (`seed.py`), DB check (`db_check.py`), bias checker
└── tests/                   # 133+ unit, integration, contract, fault & tracing tests
```

## Local Commands

Run from `apps/api` (using `uv`) or via root `package.json` scripts:

```bash
# Install dependencies (Python 3.12)
uv sync --python 3.12

# Run migrations & seed 60 wards / 31,320 weekly observations
uv run alembic upgrade head
uv run python -m scripts.seed
uv run python -m scripts.db_check

# Start API server (http://localhost:8000)
uv run python -m app

# Export locked OpenAPI 3.1 contract
uv run python -m app.export_openapi ../../contracts/openapi.json

# Lint, format check, typecheck & tests
uv run ruff check . && uv run ruff format --check .
uv run pyright
uv run pytest -q

# ML & Security evaluations
uv run python -m evals.run --split heldout
uv run python -m evals.retrieval
uv run python -m evals.redteam
```

## Security & Resilience Controls

- **Middleware Onion:** `CORS → SecurityHeaders → RequestId → RateLimit (120/min; 20/min LLM) → UnhandledException → BodySizeLimit (64 KiB) → Router`.
- **Error Format:** Strict `application/problem+json` (RFC 9457) across all 4xx/5xx responses.
- **Secret Hygiene:** `app/core/logging.py` redacts API keys (`sk-*`, `AIza*`, `AQ.*`, bearer tokens) before logs emit.
- **Fault Injection (Test Env Only):** Set `APP_ENV=test` with `FAULT_INJECT=openmeteo_timeout|openmeteo_5xx|db_down` to verify graceful degradation.
