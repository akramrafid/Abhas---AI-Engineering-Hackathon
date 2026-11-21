ROLE: DESIGN · role 4 System designer · hat design
LEAD_BRANCH: lead
TASK: design-system — System design + architecture critique          WAVE: 1A      FEATURE: —
MODEL: antigravity · Gemini 4 Neon (XHigh)
SKILLS: production-standards, verification-before-completion, system-design
GOAL: Write `docs/system-design.md` (so `gates.mjs resilience` passes) and a sharp read-only architecture critique in `.orca-team/reviews/arch-critique.md` (max 15 bullets) covering `docs/architecture.md` and `docs/adr/0001..0008.md` against `docs/PRD.md`.
OWNED PATHS (only these may be edited):
  - docs/system-design.md
  - .orca-team/reviews/arch-critique.md
READ-ONLY CONTEXT: TASK.md, docs/PRD.md, docs/architecture.md, docs/adr/0001..0008.md, docs/KICKOFF-PROMPT.md (§3, §5, §8), contracts/openapi.json, .orca-team/PLAN.md, apps/api/app/core/config.py, apps/api/app/ports/*.py
CONTRACT:
  - `docs/system-design.md` must follow skill `system-design` exactly:
    1. Mermaid `sequenceDiagram`s: (a) golden path (browser -> Next.js -> FastAPI -> SQLite/cache + joblib LightGBM -> response with X-Request-ID) and (b) live weather timeout/fallback (Open-Meteo timeout -> retry -> circuit breaker -> last cache -> ward climatology) + optional Anthropic advisory timeout/fallback -> deterministic template.
    2. `## Resilience register` markdown table with exact columns:
       `| Dependency | Call site | Timeout | Retries | Fallback | Idempotent | Test |`
       Cover: Open-Meteo Forecast API (`app/adapters/openmeteo.py`), Anthropic Advisory API (`app/adapters/llm.py`), SQLite DB (`app/adapters/db/session.py`), LightGBM joblib artifact (`app/adapters/lgbm_model.py`). No empty/`-`/`TBD`/`?` cells.
    3. Latency budget splitting NFR-1 (<50 ms p95 in-process inference) and NFR-2 (<300 ms p95 at 20 VUs).
    4. Caching plan (`weather_cache` 6 h TTL, in-process + SQLite `predictions_cache`, advisory cache by `(ward, week, horizon, model_version, language)`, ETag/Cache-Control on GET routes).
    5. Rate limits & quotas (120 req/min default, body/ward-count/horizon caps -> 422, LLM <= 400 output tokens and $1/day hard cap -> template fallback, Open-Meteo <= 1 multi-city call / 6 h).
    6. Capacity & cost estimate (demo load + one city health office monthly USD estimate for rubric R6).
    7. Failure modes (FMEA-lite) covering Open-Meteo down/slow/429, Anthropic timeout/429/malformed JSON/hallucinated number, SQLite locked under 20 VUs (WAL + busy_timeout), missing/corrupted model artifact (fail-fast SHA-256 at boot), unknown ward (404), non-Monday/out-of-range origin week (422), oversized payload (413/422).
    8. `FAULT_INJECT` specification (`APP_ENV=test` only: `openmeteo_timeout`, `openmeteo_5xx`, `llm_timeout`, `llm_bad_json`, `llm_bad_numbers`, `db_down`) for CORE/DATA `@pytest.mark.faults` tests.
  - `.orca-team/reviews/arch-critique.md`: first line `# Architecture critique — reviewer: antigravity/Gemini 4 Neon (XHigh)`. Max 15 concrete bullets covering missing NFR coverage, single points of failure, Windows/SQLite/180 s setup traps, slice boundary leaks, or simpler alternatives; no praise, no restating.
ACCEPTANCE CRITERIA (from docs/PRD.md):
  NFR-1, NFR-2, NFR-5, NFR-7, AC-8, AC-10, AC-15, AC-17 resilience/fallback/timeout specifications complete and consistent with ADRs 0001–0008.
GATE TO PASS: node .orca-team/tools/gates.mjs resilience   (+ npm run ci)
ENV VARS NEEDED: none
DEV PORT: —
OUT OF SCOPE: Do not edit any code, ADR, PRD, or schema files.
DONE WHEN: Both files committed on your branch (`docs(design): system design and architecture critique`), `node .orca-team/tools/gates.mjs resilience` and `npm run ci` are green, and `worker_done` is sent.
