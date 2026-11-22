# PLAN.md — Abhas (আভাস): Ward-Level Dengue Early Warning

_Last updated by LEAD: 2026-11-21 16:05 BST · LEAD_BRANCH: `lead` · Deadline: 2026-11-22 14:00 BST (Feature freeze 08:00 BST)_

Requirements live in `docs/PRD.md` (role 1, status: locked). This file is the execution plan: who builds what, when, and which gate proves it.

## 1. Golden path (from `docs/PRD.md`)
1. Officer opens `http://localhost:3000/?demo=1` → Dhaka South, the pinned demo origin week (three weeks after a heavy-rain week), and the 2–4-week window are preselected; the ward list shows every ward's tier.
2. Officer picks a ward → tier card shows peak-window tier (EN/BN label + 1–4 meter), per-horizon expected cases with 80% band, and 0–100 risk score (`POST /api/v1/forecast`).
3. Officer reads the top 4 drivers on the same screen (sign + percentage effect, e.g., "Rain 2–4 weeks ago: +60%").
4. Officer opens the Lags panel → rainfall shifted 0–8 weeks drawn against weekly cases, peaking at lag 3 (`GET /api/v1/wards/{ward_id}/lags`).
5. Officer moves the scenario slider to 120 mm rain this week → forecast for weeks 2–4 and tier card update (`POST /api/v1/scenario`).
6. (SHOULD / Bonus) Officer opens the city heatmap → ward × horizon tier matrix for the city (`GET /api/v1/heatmap`).
7. (SHOULD / Bonus) Epidemiologist opens the validation tab → MAE/RMSE by horizon and year vs baselines, 80% band coverage, confusion matrix (`GET /api/v1/validation`).

## 2. Architecture summary
- **Archetype:** Prediction service + analytics dashboard (modular monolith, vertical slices per capability, ports & adapters around weather, trained model, LLM, and DB; ADR-0001). No RAG, no vector DB, no deep learning, no auth.
- **Stack:** Python 3.12 + FastAPI + LightGBM (Poisson direct multi-horizon h=1..4 + NegBin conformal 80% band, joblib serialized) · SQLite (WAL mode) via SQLAlchemy + Alembic (Postgres-compatible for Stage 2) · Next.js 16 + TypeScript strict + Tailwind v4 + Recharts + TanStack Query + `openapi-typescript`. Optional LLM advisory (`COULD`): Claude Haiku 5.5 (`claude-haiku-5-5`) with deterministic template fallback when no key is set.
- **Design direction:** Abhas brand kit (`docs/brand/`): Ink `#0B0F14` / Navy `#0B1A5C` / Royal `#2F5BFF` / Paper `#F4F6FD` / Lime `#D4F53C` (only on Ink/Navy/Royal, never in data views); light-to-dark risk ramp (Low `#BFE3CC`, Medium `#F0B429`, High `#C2410C`, Critical `#7F1D1D`) with EN/BN labels + 1–4 bar meter; self-hosted Manrope + IBM Plex Mono (tabular nums) + Noto Sans Bengali.
- **Details:** `docs/architecture.md` · `docs/adr/0001..0008` · `docs/system-design.md` · `docs/data-model.md` · `docs/data-pipeline.md` · `docs/ai-design.md`.

## 3. Contracts (API locked 2026-11-21 16:05 BST; DB + eval lock on DATA + QA wave merge; changes only via LEAD)
- **API:** `contracts/openapi.json` (exported from `apps/api/app/features/*/schemas.py` via `npm run contracts`; TS types in `apps/web/src/lib/api/schema.d.ts` via `npm run web:types`).
- **Ports:** `apps/api/app/ports/{forecast_model,repositories,weather,llm}.py`.

| Method | Path | Purpose | Request | Response | Streaming | Errors |
|---|---|---|---|---|---|---|
| GET | `/healthz` | Liveness | — | `{status}` | no | — |
| GET | `/readyz` | Readiness (DB + model) | — | `{status, version}` | no | 503 |
| GET | `/api/v1/wards` | List 60 wards + date bounds | `?city=` | `WardList` | no | 422 |
| GET | `/api/v1/wards/{ward_id}/history` | Ward weekly weather & cases | `?start=&end=` | `WardHistory` | no | 404 `/unknown-ward`, 422 |
| GET | `/api/v1/wards/{ward_id}/lags` | Lags 0–8 correlations + series | `?weeks=` | `LagResponse` | no | 404 `/unknown-ward`, 422 |
| POST | `/api/v1/forecast` | Multi-ward, multi-horizon risk | `ForecastRequest` | `ForecastResponse` | no | 404 `/unknown-ward`, 422 |
| POST | `/api/v1/scenario` | What-if weather override | `ScenarioRequest` | `ScenarioResponse` | no | 404 `/unknown-ward`, 422 |
| GET | `/api/v1/heatmap` | City ward × horizon tiers | `?city=&origin_week=&source=` | `HeatmapResponse` | no | 422 |
| GET | `/api/v1/validation` | Stored backtest metrics & matrix | — | `ValidationResponse` | no | 503 |
| GET | `/api/v1/weather/status` | Weather mode, cache age, bias check | — | `WeatherStatus` | no | — |
| POST | `/api/v1/advisory` | EN/BN template or LLM briefing | `AdvisoryRequest` | `AdvisoryResponse` | no | 404, 422, 503 |
| GET | `/api/v1/ops` | Cost, cache hit rate, model loads | `X-Ops-Token` (if set) | `OpsResponse` | no | 401/403 (when token set) |

- **DB:** First Alembic revision in `apps/api/migrations/versions/` (`wards`, `observations`, `weather_cache`, `predictions_cache`, `api_calls`, `llm_traces`), ERD in `docs/data-model.md`.
- **Eval set:** `apps/api/evals/datasets/forecast.jsonl` (48 stratified golden hold-out cases, locked by SHA-256) and `apps/api/evals/datasets/retrieval.jsonl` (≥ 30 held-out in-season weeks).

## 4. Roles and seats (models: `.agents/skills/swarm-lead/references/model-routing.md`)
| Role | Seat | Hand-off | Gate |
|---|---|---|---|
| 1 Product owner | LEAD | `docs/PRD.md` (locked) | `prd` |
| 2 UX designer | UI (`ui-dashboard`) | `docs/ux/*` | `ux` |
| 3 Solution architect | LEAD | `docs/architecture.md`, `docs/adr/0001..0008` | `adr`, `contracts` |
| 4 System designer | DESIGN (`design-system`) | `docs/system-design.md`, `.orca-team/reviews/arch-critique.md` | `resilience` |
| 5 AI engineer | CORE (`core-forecast`) | `ml/train.py`, `ml/backtest.py`, `ml/artifacts/`, `docs/ai-design.md` | `baseline` |
| 6 Data engineer | DATA (`data-pipeline`) | `shared/features.py`, `seed.py`, `openmeteo.py`, `docs/data-pipeline.md` | `slices` |
| 7 Database engineer | DATA (`data-pipeline`) | `migrations/`, `adapters/db/`, `db_check.py`, `docs/data-model.md` | `migrations` |
| 8 Tech lead | LEAD | green `lead` branch, merges, pushes, root `ARCHITECTURE.md` | `merge`, `promote` |
| 9 Backend | CORE (`core-forecast`) + DATA (`data-pipeline`) | API feature implementations | `contract` |
| 10 Frontend | UI (`ui-dashboard`) + UI-2 (`ui-brand`) | `apps/web` + Playwright e2e + `/brand` | `e2e` |
| 11 Eval engineer | QA (`qa-evals`) | `evals/datasets/`, `evals/run.py`, `evals/retrieval.py` | `eval`, `retrieval` |
| 12 SQA | QA (`qa-sqa`) | `docs/test-plan.md`, `tests/load/smoke.js`, integration tests | `ci`, `load` |
| 13 AI red team | REVIEWER-SEC | `docs/threat-model.md`, `evals/redteam.py`, `.orca-team/reviews/r<N>-security.md` | `redteam` |
| 14 Deploy prep | QA (`qa-ship`) | `gates.mjs fresh-clone` (≤ 180 s); `deploy` skipped (localhost demo) | `fresh-clone` |
| 15 LLMOps | CORE (`core-forecast`) | `/api/v1/ops`, `docs/llmops.md`, tracing tests | `traces` |
| 16 Demo & docs | QA (`qa-ship`) + OUTSIDER | `README.md`, `docs/demo.md`, `docs/dry-run.md` | `dryrun` |

Skipped gates (`.orca-team/gates.json`): `deploy` (localhost demo per TASK.md).

## 5. Ports and ownership (vertical slices: disjoint paths)
| Seat / worker | Dev port(s) | Owns (may edit) |
|---|---|---|
| LEAD | api 8000, web 3000 | root `package.json`, `.env.example`, `contracts/`, `apps/api/app/{core,ports}/`, `apps/api/app/features/*/schemas.py`, `apps/api/app/{main,__main__,export_openapi,healthcheck}.py`, `apps/web/package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/lib/api/schema.d.ts`, `docs/PRD.md`, `docs/architecture.md`, `docs/adr/`, root `ARCHITECTURE.md`, `.orca-team/` |
| `design-system` | — | `docs/system-design.md`, `.orca-team/reviews/arch-critique.md` |
| `data-pipeline` | api 8001 | `apps/api/alembic.ini`, `apps/api/migrations/**`, `apps/api/app/adapters/db/**`, `apps/api/app/adapters/openmeteo.py`, `apps/api/app/shared/features.py`, `apps/api/app/features/{wards,lags,weather}/**` (except `schemas.py`), `apps/api/scripts/**`, `apps/api/config/**`, `apps/api/tests/features/{wards,lags,weather}/**`, `apps/api/tests/test_features_lags.py`, `apps/api/tests/test_openmeteo.py`, `docs/data-model.md`, `docs/data-pipeline.md` |
| `core-forecast` | api 8002 | `apps/api/ml/**`, `apps/api/app/shared/{tiers,drivers}.py`, `apps/api/app/adapters/{lgbm_model,llm,fake_llm}.py`, `apps/api/app/observability/**`, `apps/api/prompts/**`, `apps/api/app/features/{forecast,heatmap,validation,advisory,ops}/**` (except `schemas.py`), `apps/api/tests/features/{forecast,heatmap,validation,advisory,ops}/**`, `apps/api/tests/test_model*.py`, `apps/api/tests/test_faults.py`, `apps/api/tests/test_tracing.py`, `docs/ai-design.md`, `docs/llmops.md` |
| `ui-brand` | web 3002 | `apps/web/public/brand/**`, `apps/web/public/favicon*`, `apps/web/scripts/gen-tokens.mjs`, `apps/web/src/styles/tokens.css`, `apps/web/src/app/globals.css`, `apps/web/src/features/brand/**`, `apps/web/src/app/brand/**` |
| `ui-dashboard` | web 3001 | `apps/web/src/features/{ward-risk,scenario,heatmap,validation,lags}/**`, `apps/web/src/lib/api/client.ts`, `apps/web/src/components/**`, `apps/web/src/app/page.tsx`, `apps/web/e2e/**`, `apps/web/playwright.config.ts`, `docs/ux/**` |
| `qa-evals` / `qa-ship` | api 8003 | `apps/api/evals/**` (except `redteam*`), `tests/load/**`, `apps/api/tests/integration/**`, `docs/{test-plan,demo,dry-run}.md`, `README.md` |
| `reviewer-sec` | — | `docs/threat-model.md`, `apps/api/evals/redteam*`, `.orca-team/reviews/r<N>-security.md` |

## 6. Waves and tasks
| Task | Wave | Seat | Feature | Role | Agent/model | Title | Deps | Gate | Needs creds | RACE |
|---|---|---|---|---|---|---|---|---|---|---|
| `design-prd-critique` | Frame | DESIGN | — | 1/4 | agy / Neon XHigh | PRD critique (DONE & applied) | — | `prd` | no | no |
| `design-system` | 1A (Design) | DESIGN | — | 4 | agy / Neon XHigh | System design + arch critique | skeleton | `resilience` | no | no |
| `data-pipeline` | 1A (Design+Build) | DATA | wards/lags/weather | 6, 7, 9 | agy / Neon XHigh | SQLite/Alembic + seed + features.py + Open-Meteo + slices | skeleton | `migrations`, `slices` | no | no |
| `qa-evals` | 1A (Design) | QA | evals/load | 11, 12 | agy / Neon XHigh | Locked 48-case hold-out + retrieval evals + k6 smoke + test plan | skeleton | `contracts` | no | no |
| `ui-brand` | 1A (Build) | UI-2 | brand | 10 | agy / Hydrogen XHigh | Abhas tokens, fonts, SVGs, favicons, `/brand` | skeleton | `slices`, `ci` | no | no |
| `ui-dashboard` | 1B (Build) | UI | dashboard | 2, 10 | agy / Neon XHigh | UX flow + dashboard (lags, forecast, scenario, heatmap, validation) + Playwright e2e | `design-system`, `ui-brand` | `ux`, `e2e` | no | no |
| `core-forecast` | 1B (Build) | CORE | forecast/ml/ops | 5, 9, 15 | agy / Neon XHigh | LightGBM Poisson h=1..4, NegBin bands, SHAP drivers, joblib, slices, traces | `data-pipeline`, `design-system` | `baseline`, `contract`, `traces` | no | no |
| `prove-r1` | 2 (Prove) | REVIEWER-CODE + REVIEWER-SEC | — | 13 | claude / Opus 5.5 (on reset ≥ 19:20) | Round 1 code + security review + redteam | Wave 1B merged | `redteam`, `eval`, `retrieval`, `load` | no | no |
| `ship-docs` | 3 (Ship) | QA + LEAD + OUTSIDER | — | 14, 16 | agy / Neon + claude / Opus | README, root `ARCHITECTURE.md`, `docs/demo.md`, `fresh-clone`, `dryrun` | Prove green | `fresh-clone`, `dryrun`, `promote` | GitHub usernames | no |

## 7. Risks and mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude 5-hour quota limit hit (16:00–19:20 BST) | H (active) | M | Gemini 4 Neon (XHigh) acts as LEAD until 19:20 reset; Opus takes back LEAD + cross-family reviews on reset |
| Fresh-clone setup > 180 s on Windows without `uv` | M | H | `--only-binary=:all:` wheels in `requirements.txt`, bulk SQLite seeding, cross-platform `scripts/py.mjs`, cold-cache timing in `fresh-clone` gate |
| SQLite `database is locked` under 20 VUs (k6) | M | H | WAL mode + `busy_timeout`, in-process hot prediction cache and ops counters, `asyncio.to_thread` for LightGBM |
| `h = 4` temporal leakage or `p90 < expected_cases` on zeros | M | H | `shared/features.py` enforces `data ≤ origin_week` + train-only normals (`≤ 2023`); `p90` clamped `≥ expected_cases` |
| Shared Antigravity quota across 4 concurrent builders | M | M | Keep concurrency ≤ 4; sequence Wave 1B behind short `design-system` + `ui-brand` tasks |
