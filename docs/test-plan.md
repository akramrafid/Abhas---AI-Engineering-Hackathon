# Test Plan — Abhas (আভাস)

_Owner: QA (roles 11 & 12) · Updated: 2026-11-21 · Source of truth: `docs/PRD.md`, `.orca-team/gates.json`_

## 1. Scope and risks

| Risk (from PRD / ADRs) | Impact | Covered by |
|---|---|---|
| Temporal leakage in lags, normals, or expanding-window CV | Inflated backtest scores; broken live trust | `test_features_lags.py` (`AC-2`), locked 2024–2025 hold-out SHA-256 (`evals/run.py --lock`, `test_evals_lock.py`) |
| Under-calibrated 80% forecast bands or missed Critical peaks | Silent outbreak misses (5× asymmetric cost) | Global 2024–2025 hold-out floors (`coverage_80` in `[0.75, 0.90]`, `critical_recall >= 0.85`, `within_one_tier >= 0.95`) + 48 stratified golden cases (`npm run eval`) |
| SQLite lock contention or slow inference under concurrency | API p95 > 300 ms or 5xx during officer demos | k6 20-VU 30 s load test (`tests/load/smoke.js`, `npm run load`), in-process latency check (`p95 < 50 ms/ward` in `npm run eval`) |
| Per-IP rate limiter (default 120 req/min) firing during localhost load tests | False 429 failures in `npm run load` | Raise `RATE_LIMIT_PER_MINUTE` in test/load server config (tracked with LEAD) |
| Schema drift between FastAPI routes and `contracts/openapi.json` | Broken frontend client or contract violations | `test_contract_has_not_drifted` (`npm run test:api`) + Schemathesis (`npm run test:contract`) |
| Open-Meteo outage or unit/bias mismatch vs dataset | Bad or crashing live-mode forecasts | `test_openmeteo.py`, `test_faults.py`, historical bias check in `docs/data-pipeline.md` (`AC-15`) |
| LLM advisory hallucinating case counts or exceeding $1/day budget | Misleading field briefings or runaway API cost | Number validator + template fallback + tracing tests (`npm run check:traces`, `AC-17`) |
| Prompt / SQL / path / CSV formula injection & secret leaks | Security or data integrity breach | Red-team attack suite (`>= 25` attacks, `>= 95%` pass) + `gitleaks` (`npm run redteam`, `NFR-8`) |
| Fresh-clone setup exceeding 3 minutes on Windows/macOS | Rubric R1 score drop | Cold-clone automated timing check (`gates.mjs fresh-clone`, `AC-9`, `NFR-5`) |

## 2. Test levels

| Level | Tool | Owner | Command | Gate | When |
|---|---|---|---|---|---|
| Lint & format | Ruff + ESLint | All | `npm run lint` | `ci` | Every commit / merge |
| Static types | Pyright + `tsc --noEmit` | All | `npm run typecheck` | `ci` | Every commit / merge |
| Unit & integration (API + SQLite) | pytest + FastAPI TestClient | DATA / CORE / QA | `npm run test:api` | `ci` | Every commit / merge |
| DB migrations (up/down/up) | Alembic + `scripts.db_check` | DATA | `npm run db:check` | `migrations` | Schema changes, merge |
| Golden-path API smoke | `scripts/smoke.mjs` | QA / LEAD | `npm run smoke:local` | `ci` | Every merge |
| API contract fuzzing | Schemathesis | CORE | `npm run test:contract` | `contract` | Review rounds, promote |
| UI E2E + WCAG 2.2 AA a11y | Playwright + `@axe-core/playwright` | UI | `npm run e2e` | `e2e` | Review rounds, promote |
| Forecast hold-out eval (48 locked golden + global) | `evals.run` | QA | `npm run eval` (`eval:dev`, `eval:baseline`, `eval:lock`) | `eval`, `baseline`, `contracts` | Lock before tuning; baseline pre-tune; rounds & promote |
| Top-15 ward ranking eval | `evals.retrieval` | QA | `npm run eval:retrieval` | `retrieval` | Wave 1A, rounds, promote |
| Load & latency (20 VUs, 30 s) | k6 (`tests/load/smoke.js`) | QA | `npm run load` | `load` | Before feature freeze |
| Security, abuse & secret scan | `evals.redteam` + gitleaks | REVIEWER-SEC | `npm run redteam` | `redteam` | Review rounds, promote |
| LLMOps & call tracing | pytest `-m tracing` | CORE | `npm run check:traces` | `traces` | Before freeze, promote |
| Fresh-clone setup timing | `gates.mjs fresh-clone` | QA | `node .orca-team/tools/gates.mjs fresh-clone` | `fresh-clone` | Ship phase |
| Uncut demo & rubric dry run | OUTSIDER (cross-family) | QA + OUTSIDER | `node .orca-team/tools/gates.mjs dryrun` | `dryrun` | Before video recording |

## 3. Acceptance-criteria & NFR traceability

### Acceptance criteria (`AC-1`..`AC-17`)

| ID | Priority | Verification artifact(s) | Command | Gate |
|---|---|---|---|---|
| AC-1 | MUST | `apps/api/tests/features/lags/`, `apps/web/e2e/` (lags shift + lag-3 peak) | `npm run test:api && npm run e2e` | `ci`, `e2e` |
| AC-2 | MUST | `apps/api/tests/test_features_lags.py` (`test_ac_2_lags_grouped_by_ward`), unknown-ward 404 test | `npm run test:api` | `ci`, `slices` |
| AC-3 | MUST | `apps/api/tests/features/forecast/`, `scripts/smoke.mjs`, Schemathesis | `npm run test:api && npm run test:contract` | `ci`, `contract` |
| AC-4 | MUST | `apps/api/tests/test_skeleton.py`, `apps/api/tests/features/forecast/` (404/422 problem+json, cache unchanged) | `npm run test:api && npm run test:contract` | `ci`, `contract` |
| AC-5 | MUST | `apps/api/evals/datasets/forecast.jsonl` (48 locked hold-out + 48 dev), `apps/api/evals/run.py`, `apps/api/tests/integration/test_evals_lock.py` | `npm run eval:lock && npm run eval` | `contracts`, `eval` |
| AC-6 | MUST | `apps/web/e2e/` (ward/week/window picker, EN/BN tier + 1–4 meter, 80% band, top drivers) | `npm run e2e` | `e2e` |
| AC-7 | MUST | `apps/api/tests/features/forecast/` (monotone 120 mm rain > baseline h=3, 422 bounds), `apps/web/e2e/` | `npm run test:api && npm run e2e` | `ci`, `e2e` |
| AC-8 | MUST | `apps/api/tests/test_faults.py`, `apps/web/e2e/` (API 5xx Retry state, unknown ward URL) | `npm run test:api && npm run e2e` | `ci`, `e2e` |
| AC-9 | MUST | `scripts/setup.mjs`, `scripts/smoke.mjs`, cold clone timing <= 180 s, zero keys | `npm run setup && npm run smoke:local` | `fresh-clone` |
| AC-10 | MUST | `apps/api/tests/features/ops/`, `apps/api/tests/test_tracing.py`, root `ARCHITECTURE.md` | `npm run test:api && npm run check:traces` | `ci`, `traces` |
| AC-11 | MUST | `apps/web/e2e/` (`/?demo=1`), `docs/demo.md`, `docs/dry-run.md` (OUTSIDER >= 85/100) | `npm run e2e` + `gates.mjs dryrun` | `e2e`, `dryrun` |
| AC-12 | MUST | `README.md` (AI/API disclosure, model card, launch commands), `git shortlog -sn` | `node .orca-team/tools/gates.mjs dryrun` | `dryrun` |
| AC-13 | SHOULD | `apps/api/tests/features/heatmap/`, `apps/web/e2e/` (city heatmap + schematic tile map label) | `npm run test:api && npm run e2e` | `ci`, `e2e` |
| AC-14 | SHOULD | `apps/api/tests/features/validation/`, `apps/web/e2e/` (metrics vs baselines, coverage, matrix) | `npm run test:api && npm run e2e` | `ci`, `e2e` |
| AC-15 | SHOULD | `apps/api/tests/test_openmeteo.py`, `apps/api/tests/test_faults.py`, `docs/data-pipeline.md` | `npm run test:api` | `ci`, `resilience` |
| AC-16 | SHOULD | `apps/web/e2e/` (tokens from `tokens.json`, zero Lime in data views, `/brand` route) | `npm run e2e` | `e2e` |
| AC-17 | COULD | `apps/api/tests/features/advisory/`, `apps/api/tests/test_tracing.py` (template fallback, number check, $1/day cap) | `npm run test:api && npm run check:traces` | `ci`, `traces` |

### Non-functional requirements (`NFR-1`..`NFR-8`)

| ID | Target | Verification artifact(s) | Command | Gate |
|---|---|---|---|---|
| NFR-1 | In-process inference `< 50 ms` p95 per ward | `apps/api/evals/run.py` (`p95_ward_ms`), `/api/v1/ops` | `npm run eval` | `eval` |
| NFR-2 | API `p95 < 300 ms`, error rate `< 1%` at 20 VUs (30 s) | `tests/load/smoke.js` | `npm run load` | `load` |
| NFR-3 | Hold-out 2024–2025 MAE h=2,3 `<= 1.10` & `>= 10%` below clim; 80% cov `0.75–0.90` | `apps/api/evals/run.py` (`evals/results/eval.json`) | `npm run eval` | `eval` |
| NFR-4 | Top-15 ward ranking on held-out in-season weeks: `recall@15 >= 0.55` & `>= clim`, `n >= 30` | `apps/api/evals/datasets/retrieval.jsonl` (36 queries), `apps/api/evals/retrieval.py` | `npm run eval:retrieval` | `retrieval` |
| NFR-5 | Fresh-clone setup to usable dashboard `<= 180 s`, zero keys | `scripts/setup.mjs` | `node .orca-team/tools/gates.mjs fresh-clone` | `fresh-clone` |
| NFR-6 | WCAG 2.2 AA; tiers readable under colour-vision emulation (EN/BN + 1–4 meter) | `apps/web/e2e/` (`@axe-core/playwright`) | `npm run e2e` | `e2e` |
| NFR-7 | `<= 1` Open-Meteo call / 6 h; LLM `<= $1/day`, `<= 400` out tokens; `model_loads == 1` | `apps/api/tests/test_tracing.py`, `/api/v1/ops`, `docs/llmops.md` | `npm run check:traces` | `traces` |
| NFR-8 | `>= 25` red-team attacks, `>= 95%` pass; `gitleaks` clean | `apps/api/evals/redteam.py`, `docs/threat-model.md` | `npm run redteam` | `redteam` |

## 4. Quality, coverage & load-test policy

- **Coverage target:** `>= 80%` line coverage on business logic (`app/features/*/service.py` and `app/shared/`). Tests assert response schemas, error problem+json structure, and numerical invariants — never HTTP 200 alone.
- **Determinism:** Unit and integration tests use local SQLite, recorded/fake LLM adapters, and mocked Open-Meteo responses (`respx` / fakes). No live network calls, no `sleep()` waits, and no real secrets in fixtures.
- **Flaky-test policy:** Never retry-until-green. Quarantine any flaky test with `@pytest.mark.skip(reason="flaky: <issue>")` and open a fix task with the owning seat before feature freeze.
- **Hold-out integrity:** `apps/api/evals/datasets/forecast.jsonl` held-out lines (`HO-001`..`HO-048`, covering all 22 distinct 2024–2025 Critical target weeks + 10 High + 8 Medium + 8 Low) are SHA-256 locked in `apps/api/evals/config.json` before any model tuning. Any edit to held-out cases causes `python -m evals.run --split heldout` to exit with code **3**.
- **Load testing (k6):** Install k6 once (`winget install k6 --source winget` on Windows or `brew install k6` on macOS). `tests/load/smoke.js` drives 20 constant VUs for 30 s across `/healthz`, `/api/v1/wards`, `/api/v1/wards/{id}/lags`, `POST /api/v1/forecast`, and `POST /api/v1/scenario`. Ensure `RATE_LIMIT_PER_MINUTE` is raised in the test server invocation so localhost VUs do not trigger the 120 req/min per-IP limiter.

## 5. Entry and exit criteria

- **Entry:** API OpenAPI contract locked (`contracts/openapi.json`), Alembic initial migration committed, and 48-case hold-out eval set locked (`npm run eval:lock`, `gates.mjs contracts` green).
- **Exit:** Every applicable gate in `node .orca-team/tools/gates.mjs promote` is `PASS` (`deploy` skipped per `.orca-team/gates.json`), zero open `BLOCKER` or `HIGH` review findings, cross-family code & security reviews at `SHIP`, and OUTSIDER dry-run score `>= 85/100` with `Blocking issues: none`.
