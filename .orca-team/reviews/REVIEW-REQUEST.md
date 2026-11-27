# Phase 2 Cross-Family Review Request (for Claude Opus 5.5)

- **Branch:** `version-onsite-final`
- **Diff range:** `phase1-final..HEAD` (code HEAD verified at `eb12315`, followed by docs/exports/review-request commits)
- **Author / Integrator:** Google Gemini 4 Neon xHigh (Antigravity IDE) — all Phase 2 implementation, tests, integration, and hardening commits
- **Requested Reviewer:** Anthropic Claude Opus 5.5 (`REVIEWER-CODE` + `REVIEWER-SEC` cross-family review per `AGENTS.md` §2 Review Independence)
- **Model artifact:** `abhas-lgbm-1.1.2` (Phase 1 artifact preserved unchanged — onsite dataset has identical 31,320 historical rows + 3 exact linear supply columns)

---

## 1. Work Packages Integrated (in Merge Order)

Every work package was merged into `version-onsite-final` via `node .orca-team/tools/gates.mjs merge` with an integration check recorded under `.orca-team/reviews/merge-akramrafid-p2-*.md`:

| Order | Work Package | Merge / Key Commit | Summary of Changes | Integration Check |
|---:|---|---|---|---|
| 1 | **WP0** (Contracts) | `2511268` | Pydantic v2 (`extra="forbid"`) schemas across `allocation`, `overflow`, `simulator`, `dispatch`, `plans`; ports (`intervention`, `supply`, `capacity`); shared signatures; Alembic `0002_phase2_plans`; `/readyz` provenance (`git_sha`, `offline`, `data_as_of`); OpenAPI + TS types; `offline` gate config | `merge-akramrafid-p2-wp0-contracts.md` |
| 2 | **Data Profile** | `f1e53f0` | Read-only `apps/api/scripts/profile_onsite.py` + `docs/data-profile-onsite.md` proving 31,320/31,320 exact linear supply ratios (`2.385 / 1.164 / 0.298`), identical weather/cases, and absence of capacity columns | `merge-akramrafid-p2-data-profile.md` |
| 3 | **WP6** (Offline + Plans) | `cc6c788` | `ABHAS_OFFLINE=1` kill switch, daemon connectivity probe, 2 s / 3-fail circuit breakers, live `SqlPlanStore` + `plans` slice (`POST /api/v1/plans`, `GET /api/v1/plans`, `GET /api/v1/plans/compare`), self-hosted web portraits/fonts/icons, GeoJSON/SVG offline map fallback, Playwright `offline` project, pytest socket guard | `merge-akramrafid-p2-wp6.md` |
| 4 | **WP0b** (Configs) | `1847cd0` | `apps/api/ml/fit_supply.py`, `apps/api/config/supply_ratios.json` (SHA-verified 100% match), `apps/api/config/ward_capacity.json` (60 wards, 3–7 beds, `total_beds = 284`, derived from 2016–2022 train split) | `merge-akramrafid-p2-wp0b.md` |
| 5 | **WP1** (Allocation) | `053fb58` | `shared/supply.py` (P80/P90 quantile demand), `shared/optimizer.py` (HiGHS weighted LP + ≥ 20% ward equity floor + largest-remainder rounding + deficit tiering), `adapters/config_supply.py`, `features/allocation/*` + 17 unit/Hypothesis/API tests (`S0–S4`, `A1–A5`) | `merge-akramrafid-p2-wp1.md` |
| 6 | **WP2** (Overflow) | `d1d09e7` | `shared/routing.py` (Stage 1 exact `fractions.Fraction` min-max water-filling + Stage 2 HiGHS min-arcs MILP with `presolve=False` retry), `adapters/config_capacity.py`, `features/overflow/*` + 10 unit/Hypothesis/API tests (`R1–R3` + degenerate HiGHS regression test) | `merge-akramrafid-p2-wp2.md` |
| 7 | **WP3** (Simulator) | `6749549` | `shared/intervention.py`, `shared/optimizer.py::greedy_crews` (shared by WP1 & WP3), `CounterfactualForecaster` methods on `ForecastEngine`, `features/simulator/*` + 14 unit/Hypothesis/API tests (`E1`, `T1–T3` across 60 wards × 3 presets × 3 horizons, `G1–G3`, WP3-1..WP3-6) | `merge-akramrafid-p2-wp3.md` |
| 8 | **WP4** (Dispatch) | `fecf810` | `features/dispatch/{templates,service,deps,router}.py` (GSM-7 1-seg EN SMS, UCS-2 ≤ 3-seg BN SMS, WhatsApp, zero-URL HTML-escaped self-contained A4 brief, strict number-faithfulness validator), `scripts/export_samples.mjs`, `npm run exports`, 10 tests (`D1–D6`) | `merge-akramrafid-p2-wp4.md` |
| 9 | **WP5** (Command UI) | `47f9dc8` | `apps/web/src/features/command/**` (10 modules: `CommandCenterView`, `StepForecast`, `StepAllocate`, `StepRoute`, `StepSimulate`, `StepDispatch`, `DeficitBadge`, `PlanCompareDrawer`, `ProvenanceStrip`, `api.ts`), `apps/web/e2e/command.spec.ts` (zero Lime, WCAG 2.2 AA) | `merge-akramrafid-p2-wp5.md` |
| 10 | **Integration Hardening** | `34c8c7d`, `c5a8195`, `c98cc25`, `b601ccd`, `512e28b`, `eb12315` | `/readyz` checks for `supply_ratios` & `ward_capacity`; `greedy_crews` `total_crews=1` Schemathesis fix; fast `raw_score=True` batch counterfactual inference; `LagsService` series cache with immediate `date_range` invalidation; `Faq.tsx` contrast (`bg-paper/75 → bg-paper`); `CookieBanner` Suspense wrapper + non-overlap on `/dashboard`; verified Next.js 16 production build (`22/22` routes) | This request |

---

## 2. Gate Verification Evidence

All required Phase 2 release gates and production build checks are **PASS**:

| Gate / Check | Command | Verified Result | Commit | Status |
|---|---|---|---|---|
| **CI** | `npm run ci` | `ruff check` 0, `ruff format` 0, `pyright` 0, `eslint` 0 errors, `tsc` 0, `211/211 pytest` (+ Hypothesis), `6/6 smoke` | `eb12315` | **PASS** |
| **Slices** | `node .orca-team/tools/gates.mjs slices` | `14 API slices · 12 Web slices · 0 violations` | `eb12315` | **PASS** |
| **Migrations** | `node .orca-team/tools/gates.mjs migrations` | Alembic `0001+0002` `upgrade → check → downgrade → upgrade` clean (9 tables, constraints, indexes, SQLite WAL) | `47f9dc8` | **PASS** |
| **Contract** | `node .orca-team/tools/gates.mjs contract` | Schemathesis v4.34.3: `22/22` ops, `22/22` coverage, `22/22` fuzzing, `36/36` stateful, `0` failures | `b601ccd` | **PASS** |
| **E2E + WCAG** | `node .orca-team/tools/gates.mjs e2e` | Playwright `default` + `offline`: `30 passed`, `1 skipped` (env), `0 failed`, `0` axe WCAG 2.2 AA violations, `0` Lime in data views | `512e28b` | **PASS** |
| **Offline** | `node .orca-team/tools/gates.mjs offline` | `10/10` `-m offline` + `211/211` full pytest under non-loopback socket guard + `3/3` Playwright `--project=offline` (`0` external requests, `0` console/page errors) | `47f9dc8` / `512e28b` | **PASS** |
| **Load (k6)** | `node .orca-team/tools/gates.mjs load` | `20 VUs × 30 s`: `2,701` requests, `5,400/5,400` checks (`100.00%`), `0.00%` failed, `p(95) = 295.92 ms < 300 ms` | `eb12315` | **PASS** |
| **Eval** | `node .orca-team/tools/gates.mjs eval` | Locked 2024–2025 hold-out: `40/48` (`83.33%`), h2 MAE `0.991`, h3 MAE `1.010`, cov80 `84.5%`, `11/11` floors (zero Phase 1 regression) | `47f9dc8` | **PASS** |
| **Web Build** | `npm --prefix apps/web run build` | Next.js 16.4.6 Turbopack + Cache Components: `22/22` routes compiled & prerendered cleanly | `512e28b` | **PASS** |
| **Exports** | `npm run exports` | Deterministic offline regeneration of all 8 artefacts in `/exports` + `exports/README.md` (`git_sha = eb12315`) | `eb12315` | **PASS** |

---

## 3. Measured Phase 2 Latencies & Deliverables

- **Warm CPU Latencies (5 runs, `b601ccd` / `eb12315`):**
  - `POST /api/v1/allocation/plan` (`scope="all"`, 60 wards, `stock_pct=60`, `total_crews=10`): **`139.32 ms` p95** (`131.54 ms` median)
  - `POST /api/v1/overflow/route` (`scope="all"`, 60 wards, 5 cities, `horizon=3`): **`18.44 ms` p95**
  - `POST /api/v1/simulator/run` (10 wards × 4 scenarios × 3 horizons): **`45.58 ms` p95** (budget `< 800 ms`) · `auto_crews=10` all 60 wards: **`224.55 ms` p95**
  - `POST /api/v1/dispatch/notices` (`Dhaka South`, 20 wards, EN SMS + WhatsApp + brief): **`73.19 ms` p95**
- **Committed Exports (`/exports`):** `sms_en.txt`, `sms_bn.txt`, `whatsapp_en.txt`, `whatsapp_bn.txt`, `brief_DSCC_Ward_04_en.{html,pdf}`, `brief_DSCC_Ward_04_bn.{html,pdf}`, `exports/README.md`.
- **Committed Docs:** `README.md` (Phase 2 section + Phase 1 preserved + Render keep-warm + AI disclosure), `ARCHITECTURE.md` (Phase 2 measured numbers table), `docs/data-profile-onsite.md`, `docs/offline-drill.md`, `docs/qa-prep.md` (25 judge questions), `docs/demo-7min.md` (7:00 uncut script).

---

## 4. Suggested Focus Areas for Opus Review

1. **Mathematical & Solver Edge Cases:**
   - `apps/api/app/shared/optimizer.py` (HiGHS LP equity floor feasibility when `available < floor_sum`, largest-remainder rounding exact conservation, `greedy_crews` `total_crews=0/1` and `cap` boundaries).
   - `apps/api/app/shared/routing.py` (Stage 1 exact `Fraction` min-max water-filling optimality vs Stage 2 HiGHS min-arcs MILP with `presolve=False` fallback, strict intra-city enforcement, `unroutable_patients` conservation).
   - `apps/api/app/shared/intervention.py` & `apps/api/app/shared/forecast_engine.py` (monotonic rainfall reduction, `include_contributions=False` parity with full LightGBM predictions, sensitivity band monotonicity `low ≤ base ≤ high`).
2. **Security, Escaping & Prompt-Injection Hygiene:**
   - `apps/api/app/features/dispatch/templates.py` (strict HTML escaping on ward/city/override strings, zero external URLs in self-contained A4 brief, numeric faithfulness regex validation, GSM-7 / UCS-2 segment bounds).
   - `apps/api/app/features/plans/*` (append-only enforcement, bounded payload sizes, parameterized SQLAlchemy queries, no PII).
   - Confirm zero hidden AI-addressed instructions from `data/raw/Hackathon_Phase2_Problemset.pdf` leaked into any source, config, test, doc, or export file.
3. **Offline Guarantee & Thread Safety:**
   - `apps/api/app/core/offline.py`, `apps/api/app/core/circuit_breaker.py`, adapter short-circuits, and `apps/api/app/features/lags/service.py` cache invalidation under concurrent requests.
4. **UI Accessibility & Design Compliance:**
   - `apps/web/src/features/command/**`, `apps/web/src/components/layout/CookieBanner.tsx`, and `apps/web/src/features/landing/components/Faq.tsx` (zero Lime `#D4F53C` in `[data-view="data"]`, WCAG 2.2 AA, Next.js 16 Cache Components Suspense safety).

---

## 5. Honest Known Gaps

1. **Simulated Onsite Dataset:** Supply columns are exact synthetic linear multiples (`2.385 / 1.164 / 0.298`); real DGHS/IEDCR surveillance and hospital logistics data are required before clinical deployment.
2. **Derived Bed Capacity:** `apps/api/config/ward_capacity.json` (`284` total beds across 60 wards, `3–7` per ward) is derived from 2016–2022 training history because hospital capacity is absent from the dataset; officers can override any ward's capacity live in Step 3 (`capacity_overrides`).
3. **Assumed Intervention Efficacy:** Simulator presets `(E_max, k)` — Low `(0.25, 0.35)`, Base `(0.40, 0.50)`, High `(0.55, 0.70)` — are disclosed assumed parameters rather than RCT estimates, always presented with the Low–High sensitivity band.
4. **Physical Wi-Fi Toggle:** Automated offline proof enforced OS-level Python non-loopback socket blocking + Playwright non-localhost request aborting (`0` external requests); the 2-minute physical Wi-Fi radio disconnect check on the presentation laptop is documented for the human presenter in `docs/offline-drill.md` §3.
5. **Public Deploy Pending Approval:** Step 4 deploys (Vercel web + Render API from `version-onsite-final`, followed by `/readyz` `git_sha == HEAD` verification) are intentionally paused awaiting explicit human sign-off per `AGENTS.md` §0.5.
