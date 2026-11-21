ROLE: CORE · roles 5, 9 & 15 AI + Backend + LLMOps engineer · hat build
LEAD_BRANCH: lead
TASK: core-forecast — LightGBM Poisson h=1..4, NegBin bands, SHAP drivers, joblib artifact, forecast/heatmap/validation/advisory/ops slices, traces          WAVE: 1B      FEATURE: forecast, heatmap, validation, advisory, ops
MODEL: antigravity · Gemini 4 Neon (XHigh)
SKILLS: production-standards, verification-before-completion, ai-engineering, backend-engineering, llmops-observability
GOAL: Train and serialize the Abhas LightGBM Poisson direct multi-horizon (h=1..4) forecaster using `app/shared/features.py`, wire real `forecast` (+ `scenario`), `heatmap`, `validation`, `advisory`, and `ops` API slices with in-process caching and `asyncio.to_thread` inference, record baseline + backtest artifacts, and pass `baseline`, `eval`, `retrieval`, `contract`, `traces`, and `slices` gates.
OWNED PATHS (only these may be edited):
  - apps/api/ml/**
  - apps/api/app/shared/tiers.py
  - apps/api/app/shared/drivers.py
  - apps/api/app/shared/forecast_engine.py
  - apps/api/app/adapters/lgbm_model.py
  - apps/api/app/adapters/llm.py
  - apps/api/app/adapters/fake_llm.py
  - apps/api/app/adapters/runtime.py
  - apps/api/app/observability/**
  - apps/api/app/features/advisory/prompts/**
  - apps/api/app/features/forecast/** (EXCEPT schemas.py)
  - apps/api/app/features/heatmap/** (EXCEPT schemas.py)
  - apps/api/app/features/validation/** (EXCEPT schemas.py)
  - apps/api/app/features/advisory/** (EXCEPT schemas.py)
  - apps/api/app/features/ops/** (EXCEPT schemas.py)
  - apps/api/tests/features/forecast/**
  - apps/api/tests/features/heatmap/**
  - apps/api/tests/features/validation/**
  - apps/api/tests/features/advisory/**
  - apps/api/tests/features/ops/**
  - apps/api/tests/test_model.py
  - apps/api/tests/test_faults.py
  - apps/api/tests/test_tracing.py
  - docs/ai-design.md
  - docs/llmops.md
READ-ONLY CONTEXT: TASK.md, docs/PRD.md (AC-3..AC-5, AC-7, AC-10, AC-13, AC-14, AC-17, NFR-1..NFR-4, NFR-7), docs/architecture.md, docs/system-design.md, docs/adr/0001..0008.md, docs/KICKOFF-PROMPT.md (§4, §5, §7, §8), contracts/openapi.json, .orca-team/PLAN.md, apps/api/app/shared/features.py, apps/api/app/ports/*.py, apps/api/evals/*.py
CONTRACT:
  - Model (`apps/api/ml/train.py`, `ml/backtest.py`, `ml/verify_artifact.py`, `ml/artifacts/current.joblib` + `metadata.json`):
    * Import feature generation exclusively from `app/shared/features.py` (ZERO train/serve skew; ALL features strictly `<= origin_week`).
    * Fit train-only normals (`<= 2023`) and store inside the joblib bundle alongside the 4 LightGBM Poisson models (`h = 1, 2, 3, 4`), NegBin dispersion + 2023 conformal scale factors, cost-sensitive tier cut-offs (missed Critical = 5x false alarm), and ward×ISO-week endemic channels (training-years mean + 2 SD, floor 5).
    * Apply monotone-increasing constraints on rainfall lag features so `AC-7` (setting `rainfall_mm=120` on a `<20 mm` non-Critical week) strictly increases `h=3` `expected_cases`.
    * `p10 <= expected_cases <= p90` invariant: `p10 = max(0, min(p10, expected_cases))` and `p90 = max(p90, expected_cases)`. If NegBin conformal coverage on 2023 misses `[0.75, 0.90]`, fall back to quantile LightGBM + CQR per ADR-0004.
    * Native SHAP (`pred_contrib=True` in log space) converted to multiplicative % effects (`(exp(contrib) - 1) * 100`) grouped into the 8 `DriverKey` buckets in `app/shared/drivers.py`, top 4 by absolute effect.
    * Backtest expanding-window folds (2019, 2020, 2021, 2022), tune on 2023, evaluate locked 2024–2025 hold-out ONCE (never tune on hold-out!) comparing `lightgbm`, `lightgbm_no_weather`, `negbin_glm` (statsmodels), `climatology`, `seasonal_naive`, and `persistence`. Write `apps/api/evals/results/validation.json` (served by `GET /api/v1/validation`).
    * Record `apps/api/evals/results/baseline.json` BEFORE final tuning (`npm run eval:baseline`), then run `npm run eval` and `npm run eval:retrieval` so all floors in `AC-5` and `NFR-4` pass!
  - Runtime & Slices:
    * `app/adapters/lgbm_model.py`: loads `current.joblib` ONCE (`model_loads = 1`), verifies SHA-256 against `metadata.json`, runs predictions off the async event loop (`asyncio.to_thread` in routers) with `< 50 ms` p95 per ward (`NFR-1`).
    * `app/shared/forecast_engine.py`: shared pure-Python forecast/scenario/heatmap scoring helpers (NO FastAPI/SQLAlchemy/httpx imports — `gates.mjs slices` enforces this!).
    * `features/forecast`, `features/heatmap`, `features/validation`, `features/advisory`, `features/ops`: clean `service.py` (framework-free) + `router.py` (no direct ORM/SDK imports).
    * `POST /api/v1/forecast` & `POST /api/v1/scenario`: return 404 problem+json (`/unknown-ward`) for unknown ward, 422 for non-Monday / out-of-range `origin_week` (`2016-02-29..2025-12-29`), and never write to `predictions_cache` on invalid requests (`AC-4`).
    * `POST /api/v1/advisory`: prompt file in `apps/api/app/features/advisory/prompts/advisory_v1.md` (checked by `gates.mjs baseline`!), deterministic EN/BN template default (`fake_llm.py`), optional Claude Haiku 5.5 (`llm.py`) with timeout (`settings.llm_timeout_s`), max 400 tokens, $1/day budget check, cache by `(ward, week, horizon, model_version, language)`, and numeric validator normalizing ASCII + Bangla digits (`AC-17`).
    * `GET /api/v1/ops`: open read-only on localhost when `OPS_TOKEN` is unset; requires `X-Ops-Token` (401/403 problem+json) when set; reports `model_loads = 1`, in-process + DB cache hit rate, weather & LLM counts/spend, and `est_monthly_cost_usd` (`AC-10`).
    * `FAULT_INJECT` support in `APP_ENV=test` + `@pytest.mark.faults` (`test_faults.py`) and `@pytest.mark.tracing` (`test_tracing.py`).
  - Docs:
    * `docs/ai-design.md` with exact headings: `## Model choice`, `## Pipeline`, `## Prompts`, `## Structured outputs`, `## Baseline`.
    * `docs/llmops.md` with exact headings: `## SLOs`, `## Budget`, `## Fallback chain`, `## Runbook`.
ACCEPTANCE CRITERIA (name tests after AC ids):
  AC-3, AC-4, AC-5, AC-7 (API), AC-10, AC-13 (API), AC-14 (API), AC-17, NFR-1, NFR-3, NFR-4, NFR-7.
GATE TO PASS: node .orca-team/tools/gates.mjs baseline eval retrieval traces slices && npm run ci
ENV VARS NEEDED: none (runs offline; ANTHROPIC_API_KEY optional -> template fallback)
DEV PORT: 8002
OUT OF SCOPE: Do not edit `app/main.py`, `app/core/`, `app/ports/`, any `schemas.py`, `app/shared/features.py`, `migrations/`, `apps/api/evals/datasets/`, or `apps/web/**`.
DONE WHEN: Artifact committed, `baseline`, `eval`, `retrieval`, `traces`, `slices`, and `npm run ci` are green, committed on your branch, and `worker_done` is sent.
