# Claude Opus r2 Review Request — Abhas (আভাস)

_Prepared by Antigravity LEAD (Gemini 4 Neon XHigh) · Target: Claude Opus 5.5 max_  
_Date: 2026-11-22 · Review range: `review-base-r2...lead` (`f2f2743...HEAD`)_  
_Swarm Constitution §2: Cross-family independent review (Gemini builders → Opus reviewer)_

---

## 1. Scope & Merged Branches

This review covers all work merged into `lead` since `review-base-r2` across three waves of implementation:

1. **Step 0.4 Remediation Merges:**
   - `akramrafid/reviewer-sec-lead-r1` (`9485ec7`): r1 security findings against initial LEAD code.
   - `akramrafid/fix-r1-lead` (`142adfa`): CR-1 (setup exe shell bypass), CR-3 (dataset-mode origin bounds), CR-10 (`prod` normalization), CR-16 (readiness registry).
   - `akramrafid/core-forecast-neon2` (`bbb8a3d`): SHA-256 matched `current.joblib` artifact and `validation.json` generation.
   - `akramrafid/fix-r1-ui` (`10b3ed6`): CR-2 (pinned dry baseline `2024-05-27`), CR-9 (sample data banner), CR-18 (axe WCAG A/AA scan).
2. **Wave 2A Core & Platform Merges:**
   - `akramrafid/wp4-data-fix` (`e474573`): CR-7 (non-consecutive week check), CR-8 (future leakage test), CR-12 (empty cutoff/override check), CR-13/CR-5 (stored rain normals in serving), CR-19 (negative lag cache + warmup).
   - `akramrafid/wp3-platform-sec` (`129ccd5`): SEC-1..SEC-12, automated red-team suite (30/30 attacks), `docs/threat-model.md`, Dockerfiles, and GitHub Actions CI.
   - `akramrafid/wp1-core-model` (`b64ac21`): NVIDIA RTX 3060 Optuna training, NegBin conformal 80% calibration, XGBoost CUDA challenger, locked hold-out evaluation (`40/48 = 83.33%`, 11/11 floors), `docs/ai-design.md`.
3. **Wave 2B Serving & UI Console Merges:**
   - `akramrafid/wp2-core-serve` (`b5060e3`): `HeatmapQuery` boundary validation, single-flight cold lock, live Dhaka origin check, AC-7 demo test, persisted `llm_traces` budget cap, `OpsService` telemetry.
   - `akramrafid/wp7-ui-brand` (`5d6c5d6`): CR-17 `BrandShowcase` split into 10 focused components (<300 lines each), outlined `<path>` wordmark SVGs, complete favicon set.
   - `akramrafid/wp6-ui-dashboard` (`d033a57`): Full §11 Operations Console, EN/BN toggle in `Noto Sans Bengali`, URL state sync, "Act by" dates, SHAP waterfall, Priority List + formula-safe CSV export, 1-page printable brief, About & Cost tab, CR-17 file size refactor (<450 lines).

---

## 2. Area → Files → Author Model Map

| Functional Area | Key Files Changed | Author Agent & Model |
|---|---|---|
| **Platform & Security (WP3)** | `apps/api/app/core/security.py`, `ratelimit.py`, `logging.py`, `scripts/setup.mjs`, `apps/api/evals/redteam.py`, `docs/threat-model.md` | Antigravity / Gemini 4 Neon (XHigh) |
| **Data & Feature Engineering (WP4)** | `apps/api/app/shared/features.py`, `apps/api/app/adapters/openmeteo.py`, `apps/api/app/adapters/db/`, `docs/data-pipeline.md` | Antigravity / Gemini 4 Neon (XHigh) |
| **ML Training & Hold-Out Eval (WP1)** | `apps/api/ml/`, `apps/api/app/adapters/lgbm_model.py`, `apps/api/app/shared/tiers.py`, `drivers.py`, `docs/ai-design.md` | Antigravity / Gemini 4 Neon (XHigh) |
| **Backend Serving & Telemetry (WP2)** | `apps/api/app/shared/forecast_engine.py`, `apps/api/app/features/forecast/`, `heatmap/`, `ops/`, `advisory/` | Antigravity / Gemini 4 Neon (XHigh) |
| **Brand Assets & Showcase (WP7)** | `apps/web/src/features/brand/`, `apps/web/public/brand/`, `apps/web/src/styles/tokens.css` | Antigravity / Gemini 4 Hydrogen (XHigh) |
| **Operations Console UI (WP6)** | `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/features/ward-risk/`, `scenario/`, `priority/`, `heatmap/`, `about/` | Antigravity / Gemini 4 Neon (XHigh) |
| **E2E Tests & Screenshots (WP6)** | `apps/web/e2e/dashboard.spec.ts`, `e2e/screenshots.spec.ts`, `docs/ux/screenshots/` | Antigravity / Gemini 4 Neon (XHigh) |
| **Architecture & Contracts (LEAD)** | `ARCHITECTURE.md`, `contracts/openapi.json`, `apps/api/app/core/types.py`, `.orca-team/STATUS.md` | Antigravity / Gemini 4 Neon (XHigh) |

---

## 3. Verification Gate Table & Reproduction Commands

| Gate ID | Hat | Status | Measured Output / Notes | Command to Reproduce |
|---|---|---|---|---|
| `slices` | build | **PASS** | 8 API slices, 8 Web slices; zero cross-slice imports | `node .orca-team/tools/gates.mjs slices` |
| `ci` | build | **PASS** | 122/122 pytest in 25.21s; ruff/pyright/eslint/tsc clean; 6/6 smoke tests | `npm run ci` |
| `contract` | build | **PASS** | Schemathesis v4.33.4: 767/767 cases across 12 operations, 0 failures | `npm run test:contract` |
| `traces` | ship | **PASS** | 5/5 tracing tests pass; `docs/llmops.md` validated | `npm run check:traces` |
| `e2e` | build | **PASS** | Playwright + axe WCAG 2.2 AA against live API: 18 passed, 0 violations | `npm run e2e` |
| `baseline` | design | **PASS** | Baseline documented before Optuna tuning (`3f9766e`) | `node .orca-team/tools/gates.mjs baseline` |
| `retrieval` | design | **PASS** | Recall@15 = 0.6111 (target ≥ 0.55, climatology 0.5704), MRR = 0.8875 | `npm run eval:retrieval` |
| `eval` | ship | **PASS** | 11/11 AC-5 floors pass; 40/48 (83.33%) pass rate on 2024–2025 hold-out | `npm run eval` |
| `redteam` | ship | **PASS** | 30/30 attacks pass (100% pass rate, 0 high failures) | `npm run redteam` |
| `migrations`| design | **PASS** | Upgrade head → check → downgrade base → upgrade head (6 tables + WAL) | `npm run db:check` |
| `adr` | design | **PASS** | ADR-0001 through ADR-0008 committed and verified | `node .orca-team/tools/gates.mjs adr` |
| `contracts` | design | **PASS** | Zero drift between FastAPI schemas and `contracts/openapi.json` | `node .orca-team/tools/gates.mjs contracts` |
| `resilience`| design | **PASS** | 4 external dependency failure modes mapped and tested | `node .orca-team/tools/gates.mjs resilience` |
| `prd` | frame | **PASS** | PRD Given/When/Then acceptance criteria mapped | `node .orca-team/tools/gates.mjs prd` |

---

## 4. Top 10 Riskiest Spots (For Focused Opus Review)

1. **`apps/api/app/shared/forecast_engine.py:165-210`**: Single-flight cold lock mechanism. Ensure no deadlock or thread starvation can occur under high concurrency if an exception is raised inside the model evaluation block.
2. **`apps/api/app/core/types.py:38-46`**: Pydantic v2 `Annotated` validator ordering for `Horizon`. In Pydantic v2, `Field(ge=1, le=4)` must precede `BeforeValidator(_strict_int)` to ensure the generated OpenAPI JSON schema exports standard `minimum: 1` and `maximum: 4` rather than raw `ge/le` keys.
3. **`apps/api/app/shared/features.py:270-340`**: Deseasonalized rainfall lag calculation (`_safe_pearson`). Confirm that `rainfall_mm` lags 0–8 correctly group strictly per `ward_id` on date-sorted rows and never leak future observations into lag arrays.
4. **`apps/api/app/shared/forecast_engine.py:310-345`**: Counterfactual scenario generation. Verify that `predictions_cache` is strictly bypassed during what-if runs so synthetic weather overrides never pollute cached predictions.
5. **`apps/api/app/features/advisory/service.py:120-175`**: Grounding verification in LLM advisory outputs. Verify that any generated numbers not present in the input forecast payload trigger an immediate fallback to deterministic templates.
6. **`apps/api/evals/redteam.py:180-230`**: Prompt-injection defense. Verify that adversarial ward names or overrides (e.g. `{{7*7}}`, SQL fragments, system prompt leaks) are treated strictly as inert string data.
7. **`apps/web/src/features/priority/components/PriorityListView.tsx:90-125`**: Formula-injection neutralization in CSV export. Verify that all values starting with `=`, `+`, `-`, `@`, tab, or carriage return are properly escaped with a single quote (`'`).
8. **`scripts/setup.mjs:45-95`**: Safe child process execution without `shell: true`. Verify that Windows `py`/`python` and macOS/Linux executables resolve safely without shell metacharacter injection.
9. **`apps/api/app/core/security.py:75-110`**: Content-Security-Policy (CSP) and security headers middleware. Confirm headers do not break Next.js font loading or inline SVGs.
10. **`apps/web/src/app/page.tsx:85-150`**: URL parameter synchronization (`?ward=&origin=&window=&tab=&lang=&demo=1`). Ensure no hydration mismatches or infinite pushState loops occur on page load.

---

## 5. What Could Not Be Verified
- **`k6` CLI Load Testing:** `k6` is not installed on the Windows host path. The 20-VU in-process latency benchmark (`p95 = 0.591 ms/ward`) was validated via `npm run eval`.
- **`gitleaks` CLI Binary:** `gitleaks` is not installed on the Windows host path. Secrets hygiene was validated through the native `.orca-team/tools/envtool.mjs check` and manual repository audit.

---

## 6. Open Questions for Reviewer
1. Should `gates.mjs eval` regression check compare against only rows where `floors_passed: true` in `history.jsonl`?
2. Does the 1-page printable ward brief (`window.print()`) in `PriorityListView` render cleanly across all browser print engines?
3. Are the cost-weighted risk tier cutoffs (4.5, 9.0, 11.0) appropriately documented in the model card for municipal health officers?
