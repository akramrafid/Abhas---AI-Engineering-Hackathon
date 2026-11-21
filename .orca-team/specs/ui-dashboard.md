ROLE: UI · roles 2 & 10 UX + Frontend engineer · hat frame/build
LEAD_BRANCH: lead
TASK: ui-dashboard — UX flow & wireframes, full Abhas dashboard (ward risk, lags, scenario, heatmap, validation), Playwright e2e + axe          WAVE: 1B      FEATURE: ward-risk, lags, scenario, heatmap, validation
MODEL: antigravity · Gemini 4 Neon (XHigh)
SKILLS: production-standards, verification-before-completion, ux-flow-design, frontend-engineering, frontend-design, vercel-react-best-practices, web-design-guidelines, webapp-testing
GOAL: Produce `docs/ux/flow.md` and `docs/ux/wireframes.md` (with all four states and test IDs), wire the typed Abhas dashboard to the FastAPI contract (`ward-risk`, `lags`, `scenario`, `heatmap`, `validation` + `/?demo=1` mode + error/retry states), and prove every UI AC + WCAG 2.2 AA with Playwright e2e + `@axe-core/playwright`.
OWNED PATHS (only these may be edited):
  - docs/ux/flow.md
  - docs/ux/wireframes.md
  - apps/web/src/lib/api/client.ts
  - apps/web/src/lib/demo-config.ts
  - apps/web/src/components/ui/**
  - apps/web/src/components/Providers.tsx
  - apps/web/src/features/ward-risk/**
  - apps/web/src/features/lags/**
  - apps/web/src/features/scenario/**
  - apps/web/src/features/heatmap/**
  - apps/web/src/features/validation/**
  - apps/web/src/app/page.tsx
  - apps/web/e2e/**
  - apps/web/playwright.config.ts
READ-ONLY CONTEXT: TASK.md, docs/PRD.md (Golden path, FR-1..FR-7, AC-1, AC-6, AC-7, AC-8, AC-11, AC-13, AC-14, AC-16, NFR-6), docs/architecture.md, docs/system-design.md, docs/adr/0007-dashboard-stack.md, docs/KICKOFF-PROMPT.md (§6, §10), contracts/openapi.json, apps/web/src/lib/api/schema.d.ts, apps/web/src/styles/tokens.css, apps/web/src/components/brand/*, .orca-team/PLAN.md
CONTRACT:
  - UX docs (checked by `gates.mjs ux`):
    * `docs/ux/flow.md`: Mermaid user flow covering officer weekly forecast + scenario + lags + heatmap + epidemiologist validation + error recovery.
    * `docs/ux/wireframes.md`: `### Screen:` sections for Dashboard (Ward Risk & Drivers), Lags Panel, What-If Scenario, City Heatmap, and Validation Tab — EVERY screen section MUST explicitly document `empty`, `loading`, `error`, and `success` states AND list `data-testid` attributes.
  - Vertical-slice discipline (`gates.mjs slices` enforces this!):
    * NO `src/features/<x>` file may import from any other `src/features/<y>`!
    * Shared brand UI (`AbhasLogo`, `RiskTierBadge`, `TIER_META`, `BrandRibbon`) comes from `@/components/brand/*`.
    * Shared API client + TanStack Query hooks/helpers live in `@/lib/api/client.ts` (typed from `@/lib/api/schema.d.ts`, using `NEXT_PUBLIC_API_BASE_URL` defaulting to `http://127.0.0.1:8000`, never hardcoding secrets, always sending/logging `X-Request-ID`, parsing RFC 9457 `problem+json` cleanly).
    * Shared UI primitives (Card, Tabs, Select, Slider, ErrorBanner, Skeleton) live in `@/components/ui/`.
  - Abhas brand & accessibility discipline (`AC-16`, `NFR-6`):
    * ZERO hardcoded hex colors in `apps/web/src/**` (except `tokens.css`); use ONLY Abhas Tailwind theme tokens (`bg-paper`, `text-navy`, `text-slate`, `border-mist`, `bg-royal`, `var(--color-risk-*)`, `var(--color-forecast-band)`).
    * Lime (`--color-lime`) appears ONLY on Ink/Navy/Royal hero/header surfaces and NEVER inside data views, charts, tables, or tier cards.
    * All numeric figures use `font-mono` with tabular numerals (`tabular-nums`).
    * Never add decorative animations; keep the interface calm, dense, and clinical for public-health officers.
  - Screens & Flows on `/` (using clean top navigation tabs: `Ward Forecast` | `Lags` | `Scenario` | `City Heatmap` | `Validation` + link to `/brand`):
    * `/?demo=1` (`AC-11`): preselects Dhaka South, the pinned demo origin week (recorded in `src/lib/demo-config.ts`, e.g., a monsoon heavy-rain +3w Monday week with a Critical DSCC ward), a Critical ward, and the 2–4-week window; works 100% offline in dataset mode.
    * **Ward Forecast (`ward-risk`, `AC-6`, `AC-8`)**: city selector, ward picker (also supports `?ward=<id>` URL param — unknown ward displays `"Ward not found"` instead of a blank chart!), origin week picker (Monday dates in dataset range), horizon window toggle (`1–4w` / `2–4w`), peak-window tier card (`RiskTierBadge` EN/BN + 1–4 meter + risk score 0–100 + action), per-horizon rows + Recharts forecast chart with 80% band (`var(--color-forecast-band)`), and top 4 drivers bar list with sign & `%`. When API is down or returns 5xx, displays error state with a Retry button and clears any stale tier (`AC-8`).
    * **Lags Panel (`lags`, `AC-1`)**: lag slider/selector `0–8` weeks shifting the ward's rainfall series by `k` weeks over its dengue cases (Recharts composed chart) + lag correlation bar chart (`0–8`) highlighting the lag-3 peak.
    * **What-If Scenario (`scenario`, `AC-7`)**: rainfall slider & numeric input (`0–500 mm`, client validation rejecting `<0` or `>500` + displaying API 422 problem+json errors) with quick preset `120 mm` button; calls `POST /api/v1/scenario` and renders side-by-side baseline vs scenario expected cases, 80% band, and tier change.
    * **City Heatmap (`heatmap`, `AC-13`)**: ward × horizon tier matrix for the selected city (`GET /api/v1/heatmap`) using `RiskTierBadge` / risk tokens + schematic ward tile grid explicitly labelled `"schematic, ward geometry not in the dataset"`.
    * **Validation Tab (`validation`, `AC-14`)**: MAE/RMSE table & chart by horizon and test year vs baselines (`climatology`, `seasonal_naive`, `lightgbm_no_weather`, `negbin_glm`), 80% band coverage summary, tier confusion matrix, and live `/api/v1/ops` summary metrics card (model loads, cache hit rate, API call counts).
  - Playwright E2E (`apps/web/e2e/dashboard.spec.ts`, `playwright.config.ts`, plus `"e2e": "playwright test"` check):
    * Name tests after AC IDs (`ac_1`, `ac_6`, `ac_7`, `ac_8`, `ac_11`, `ac_13`, `ac_14`, `ac_16`) so `gates.mjs prd --strict` tracks them!
    * Test golden path (`/?demo=1`), lag shift `k=3`, scenario `120 mm` + invalid `600 mm` rejection, API-503 error state with Retry and no stale tier, unknown ward `?ward=UNKNOWN_99` -> `"Ward not found"`, heatmap schematic label, validation tab, `/brand` page, zero Lime color in `[data-view="data"]`, and `@axe-core/playwright` WCAG 2.2 AA scan with zero serious/critical violations.
ACCEPTANCE CRITERIA:
  AC-1 (UI lag shift), AC-6, AC-7 (UI), AC-8, AC-11 (UI demo mode), AC-13 (UI), AC-14 (UI), AC-16, NFR-6.
GATE TO PASS: node .orca-team/tools/gates.mjs slices && npm run ci && npm --prefix apps/web run build && npm run e2e
ENV VARS NEEDED: none (works against local FastAPI on port 8000 / mock routes for error tests)
DEV PORT: 3001
OUT OF SCOPE: Do not edit `apps/api/**`, `contracts/`, `apps/web/package.json` (except ask LEAD if `"e2e"` script needs adding — we will add `"e2e": "playwright test"` on `lead`!), `apps/web/src/app/layout.tsx`, `apps/web/src/styles/tokens.css`, `apps/web/src/components/brand/**`, or `apps/web/src/features/brand/**`.
DONE WHEN: UX docs + dashboard slices + Playwright e2e + axe tests pass, `next build` & `gates.mjs slices` & `npm run ci` are green, committed on your branch, and `worker_done` is sent.
