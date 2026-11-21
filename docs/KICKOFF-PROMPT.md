ROLE: LEAD (Claude Code · Opus 5.5 · effort max). Read and follow `.claude/commands/kickoff.md`, `AGENTS.md`
and `TASK.md`, using the claude skills v4 in `.claude/skills/`. The problem, rubric, dataset facts and
deadline are in TASK.md — do not restate them to workers; point to them.

Do not use GSD or the superpowers planning/worktree skills: Orca owns worktrees and the plan. Write every
document in normal prose (not caveman mode).

# 0. What we are building
**Abhas** — a ward-level dengue early-warning system. A health officer picks a city, ward(s), a forecast week
and a window of 1–4 weeks ahead. Abhas shows each ward's risk tier (Low / Medium / High / Critical), expected
cases with an 80 % band, and the drivers behind it ("rain 3 weeks ago: +60 %"). The officer can also type a
weather scenario ("what if 120 mm falls this week?") and see the risk change.

Build it as Stage 1 of a production system, graded by the rubric in TASK.md. Go deeper, not bigger: every
item below either earns rubric points or protects them.

# 1. Seats and where each coding agent works
**Models allowed in this project: Claude Code · Opus 5.5 max and Antigravity · Gemini 4 Neon (xhigh;
max only for DESIGN) / Gemini 4 Hydrogen xhigh.** Not used: Sonnet 5.5, Kimi K3.1 Pro, Muse Wonder (no
OpenCode). Every builder seat runs on Neon xhigh, except the brand seat UI-2 (Hydrogen xhigh). Claude Opus
is kept for LEAD and for checking Gemini-written work. In Phase 0, update the project's `.agents/skills/swarm-lead/references/model-routing.md` and the
AGENTS.md seat table to match this table (run `sync-skills.mjs`), so every skill points at the right model.
**Any model out of quota → Gemini 4 Neon xhigh**; if Neon is also out → Gemini 4 Hydrogen xhigh → Claude
Opus 5.5 (only when the Claude slot is free). A checker never shares the author's model family — so all
review of Gemini-written code is done by Opus.

| Seat · worker | Agent · model | Work in this project |
|---|---|---|
| LEAD | Claude Code · Opus 5.5 max | PRD, ADRs, contracts (OpenAPI, `features/*/schemas.py`, `ports/`), `gates.json`, merges, pushes, final ARCHITECTURE.md |
| DESIGN | Antigravity · Gemini 4 Neon max | `docs/system-design.md` (sequences, failure modes, caching, rate limits); critiques of the PRD and architecture |
| CORE · `core-forecast` | Antigravity · Gemini 4 Neon xhigh | model training, tiers, intervals, drivers; slices forecast, scenario, validation, advisory; `docs/ai-design.md`; traces |
| DATA · `data-pipeline` | Antigravity · Gemini 4 Neon xhigh | xlsx → SQLite (Alembic), lag feature pipeline + leakage tests, Open-Meteo client and cache, weather-source check |
| UI · `ui-dashboard` | Antigravity · Gemini 4 Neon xhigh | UX flow and wireframes; dashboard slices (ward risk, scenario, heatmap, validation); Playwright e2e |
| UI-2 · `ui-brand` | Antigravity · Gemini 4 Hydrogen xhigh | brand guideline, logo SVGs, design tokens, fonts, `/brand` page, brand PDF (§6) |
| QA · `qa-*` | Antigravity · Gemini 4 Neon xhigh | backtest harness and locked hold-out, unit/integration/contract tests, k6, fresh-clone timing, README, demo script |
| REVIEWER-CODE | Claude Code · Opus 5.5 max | every merge (all builder code is Gemini-written); review rounds. When the Claude slot is busy, LEAD reviews the merge itself — LEAD is not the author |
| REVIEWER-SEC | Claude Code · Opus 5.5 max (Neon xhigh only for LEAD-written contracts and core) | threat model, abuse tests, gitleaks, `pip-audit`, `npm audit` |
| OUTSIDER | Claude Code · Opus 5.5 max, fresh session with no project context | hallway test of the UX; scored dry run with the real rubric. Must be Claude: the UI and docs are Gemini-written, and the `dryrun` gate fails when tester and author share a family |

Concurrency: Claude = LEAD + 1 Opus worker (REVIEWER-CODE / REVIEWER-SEC / OUTSIDER, one at a time) ·
**Antigravity ≤ 4** (raise the cap in AGENTS.md). Waves: Frame/Design = DESIGN + DATA + UI-2 · Build = CORE +
DATA + UI + UI-2, then QA replaces UI-2 · Prove = CORE + UI + QA (fix tasks).

Quota risk: six builder seats now draw on one Antigravity quota (Neon and Hydrogen may share it), and Opus
max carries LEAD plus every review. LEAD records each `LIMIT HIT` in STATUS.md, keeps Neon max for DESIGN
short, batches reviews per wave instead of per commit when Opus runs low, and queues work rather than
over-booking either quota.

**MCPs:** shadcn (install primitives), 21st.dev Magic (component search and inspiration for the dashboard and
`/brand`; generation only if credits exist), Playwright (e2e, screenshots, brand PDF export), Chrome DevTools
(performance, console, colour-vision emulation), Context7 (current docs for LightGBM, FastAPI, Next.js,
Recharts, Alembic), Next.js DevTools. Skills to pair: frontend-design, web-design-guidelines, webapp-testing.

# 2. Timeline (BST; plan backwards from 14:00 Sat 22 Nov)
| By | Exit condition |
|---|---|
| 15:30 | Frame: `docs/PRD.md` (≤ 5 MUST), UX flow, credentials message sent, repo connected |
| 17:00 | Design: ADRs, contracts locked, `gates.mjs prd adr contracts resilience slices` green, skeleton runs |
| 19:00 | Thin slice end to end: one ward, one week, real model → tier + drivers in the browser |
| 01:00 | All MUST slices merged; baseline recorded; brand kit merged |
| 06:00 | Prove: hold-out eval, tests, k6, red team, two review rounds closed |
| 08:00 | **Feature freeze.** Ship: README, ARCHITECTURE.md, fresh-clone ≤ 3 min verified, demo mode |
| 11:30 | Human records the video from `docs/demo.md` (OUTSIDER dry run before this) |
| 13:00 | Submitted. 13:00–14:00 buffer only |

# 3. Architecture (ADR-0001 — vertical slices, ports & adapters)
```
apps/api  (FastAPI, Python 3.12, uv + exported requirements.txt)
  app/core/        config, logging, problem+json errors, rate limits          LEAD
  app/ports/       WeatherSource, ForecastModel, LLM, Repositories            LEAD
  app/features/    wards · forecast (incl. scenario) · heatmap · lags · validation · weather · advisory · ops
  app/shared/      features.py (THE lag/feature builder, used by training and serving), tiers.py, drivers.py
  app/adapters/    openmeteo.py, lgbm_model.py (joblib), llm.py + fake_llm.py, db/ (SQLAlchemy)
  ml/              train.py, backtest.py, model card; artifacts/abhas-<version>.joblib + metadata.json
  migrations/      Alembic: observations, wards, weather_cache, predictions_cache, api_calls, llm_traces
apps/web  (Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui, Recharts, TanStack Query, openapi-typescript)
  src/features/    ward-risk · scenario · heatmap · validation · brand
```
- **One feature builder** (`shared/features.py`) is imported by training, backtest and serving, so there is
  no train/serve skew. Lags are `groupby("ward_id")` on date-sorted rows; a test proves the first k rows of
  every ward are NaN and that no value comes from another ward.
- **No server database.** SQLite file created by `alembic upgrade head` and seeded from the xlsx at setup.
  The same migrations run on Postgres for the final sprint (`DATABASE_URL`).
- **Rejected (write these into the ADRs):** Streamlit (fastest, but no path to the Stage-2 live system and no
  custom brand); Neon/Postgres for 31 k rows (needs credentials, breaks the 3-minute run); a vector DB or RAG
  (no documents to retrieve); deep learning (§4).
- One command after clone: `npm run setup` (uv if present, else `python -m venv` + `pip install -r
  apps/api/requirements.txt`; `npm ci`; migrate + seed; check the model artifact's SHA-256) then
  `npm run dev` (API on 8000 + web on 3000 via `concurrently`). Optional `docker compose up` as a second
  path. The trained model is committed (small), so setup never trains.

# 4. Model (roles 5, 6, 11) — decided from the data spike in TASK.md
- **Primary: LightGBM, Poisson objective, one global model across all 60 wards, direct multi-horizon
  (h = 1, 2, 3, 4 weeks; one model per h).** Count target, zero-inflated seasonal data, 31 k rows, strong
  known lags: gradient boosting with a Poisson loss is the tabular forecasting standard. LightGBM also
  serializes with joblib, predicts in milliseconds, and gives exact per-prediction SHAP values natively
  (`pred_contrib=True`), so no `shap` dependency.
- **Interpretable benchmark:** negative-binomial GLM with rainfall lags 0–8 and ward effects (statsmodels) —
  the epidemiology-standard distributed-lag approach. Keep it if it wins; report it either way.
- **Baselines** (must be in every results table): ward × ISO-week climatology, seasonal naive (same week last
  year), persistence, and the same LightGBM with weather removed (proves the lag pipeline earns its place).
- **Rejected:** LSTM / TFT / Chronos / TimesFM — torch adds gigabytes, which breaks the 3-minute setup and
  the joblib requirement, and 60 short series give no evidence they would win. Prophet/ARIMA per ward —
  60 separate models with no shared learning and weak handling of exogenous lags.
- **Features at forecast origin t** (only data ≤ t): rainfall lags 0–8 weeks, rolling sums (0–3, 4–7), rain
  anomaly against the ward's week-of-year normal (training years only), temperature and humidity lags 0–3
  and 4-week means, static ward factors, target-week seasonality (sin/cos of ISO week; handle week 53).
  **No past case counts** — they added nothing in the spike, and leaving them out means the same model
  serves the what-if scenario from weather inputs alone. If CORE wants them back, they must win on validation.
- **Live mode:** for h where target-week rain lies in the future (h = 4 needs rain at t+1, t+2), use Open-Meteo
  forecast rain. Measured value: h = 4 MAE 1.17 → 1.00.
- **Validation (rolling origin, chronological):** expanding-window folds testing 2019, 2020, 2021, 2022; 2023
  for tuning, tier cut-offs and conformal calibration; **2024–2025 hold-out locked by SHA-256 before any
  tuning** (`python -m evals.run --lock`). Purge: drop training rows whose target week falls in or after the
  fold's first test week.
- **Uncertainty:** P10/P90 from LightGBM quantile models, conformalized on 2023 (CQR). Target: 80 % band
  covers 75–90 % of hold-out weeks.
- **Tiers (explainable in one sentence):** tier from expected weekly cases with cut-offs chosen on 2023 to
  minimise cost when a missed Critical costs 5× a false alarm (spike starting point 3 / 8 / 14 cases);
  **escalate one tier** when P90 exceeds the ward's epidemic threshold (endemic channel: training-years mean +
  2 SD for that ISO week, floor 5 cases). Risk score 0–100 = P(cases ≥ High cut-off) from a negative binomial
  with mean = prediction, dispersion fit on 2023.
- **Drivers:** SHAP contributions are in log space (Poisson link), so convert them to multiplicative effects
  and group them into human drivers: "Rain 2–4 weeks ago", "Recent rain", "Heat", "Humidity",
  "Water-logging", "Crowding", "Sanitation", "Season". Show the top 4 with sign and size.

# 5. Acceptance criteria and gates (set in `.orca-team/gates.json`)
Hold-out = 2024–2025, scored once at the end of Prove; tune only on 2019–2023.
| Check | Floor (spike baseline in brackets) |
|---|---|
| MAE h = 2, 3 | ≤ 1.10 and ≥ 10 % better than climatology [1.02 vs 1.24] |
| MAE h = 4 (dataset mode) | better than climatology [1.17 vs 1.24]; report RMSE and Poisson deviance for every h |
| Weather ablation | removing weather makes MAE worse at every h [1.26] |
| Lag evidence | deseasonalized rain–case correlation chart per lag, peak at 3 weeks [0.47] |
| 80 % interval coverage | 0.75–0.90 |
| Tiers | within one tier ≥ 0.95; actual Critical predicted High or Critical ≥ 0.85 [0.92]; macro-F1 reported [0.60] |
| Ranking (re-targets role 6 "Recall@k") | top-15 wards by cases over weeks t+2..t+4, held-out in-season weeks: recall ≥ 0.55 and ≥ climatology [0.60 vs 0.58] |
| Speed | in-process inference < 50 ms p95 per ward; API p95 < 300 ms at 20 VUs (k6) |
| Setup | fresh clone → dashboard usable ≤ 180 s, timed on a teammate's machine and in `gates.mjs fresh-clone` |

Gate mapping (LEAD writes these into gates.json and STATUS.md):
- `retrieval` → ranking recall: write `apps/api/evals/results/retrieval.json` `{k: 15, recall_at_k, mrr,
  n_queries}` (n = held-out in-season weeks ≥ 30). Thresholds: `recall_at_k` 0.55, `retrieval_min_queries` 30.
- `eval` → 48 golden hold-out cases, stratified by actual tier with every Critical week included, locked by
  SHA. A case passes when the tier is within one band **and** actual cases lie in the 80 % band. All global
  floors above must also hold or the run fails. `eval_threshold` 0.8, `eval_min_heldout` 48. Judge model
  "-" (deterministic) for forecasts; the advisory (§7) gets a judge from a different family.
- `baseline` → `docs/ai-design.md` (Model choice, Pipeline, Prompts, Structured outputs, Baseline) and
  `evals/results/baseline.json` recorded **before** tuning (baselines + untuned LightGBM).
- `migrations` → `alembic upgrade head` / `downgrade base` / `upgrade head` on an empty SQLite file.
- `contract` → Schemathesis against `contracts/openapi.json`. `e2e` → Playwright happy path + error states
  (API down, unknown ward, date out of range, live weather unavailable).
- `redteam` → threat model maps LLM01–LLM10 (N/A items say why); ≥ 25 attacks: oversized or NaN weather,
  negative rain, SQL/path injection in `ward_id`, huge horizon, CSV formula injection in exports, prompt
  injection through ward names into the advisory, rate-limit abuse; gitleaks clean. `dry_run_min` 85.
- `deploy` → skip ("localhost demo; deploy only with approval").

# 6. Brand: Abhas (UI-2 seat, time-box 2 hours, built in parallel)
**The brand is already designed.** Treat it as the source of truth; UI-2 implements it and does not
redesign it:
- `docs/brand/`: the brand kit, containing `BRAND.md`, `tokens.json` and `logo/*.svg` (mark, reverse,
  mono, app icon)
- the 16-page guideline: https://claude.ai/artifact/BkdcU9NNJwJkViHNa5pcb9

- **Name:** Abhas (আভাস, "an early sign; a hint of what is coming"; the root of পূর্বাভাস, forecast).
  Line: *"Rain today. Risk in three weeks. Act now."*
- **Logo:** use the SVGs as they are. The mark is a raindrop cut by an A (Λ), which is also an arrow
  pointing up. The cap is Royal and the city below it Navy; on dark grounds the cap turns Lime and the city
  White. Wordmark: ABHAS in Manrope 800, uppercase, tracking 0.08em; convert it to outlines with
  opentype.js. Derive the favicon from `abhas-app-icon.svg`. Use `art/abhas-ribbon-*.svg` only on Ink or
  Navy hero bands, never behind data. Never use a mosquito, a skull or a red cross.
- **Type (self-hosted via @fontsource; no Google Fonts calls at runtime):** Manrope for headings and UI;
  IBM Plex Mono for figures, codes and tables (tabular numbers); Noto Sans Bengali for Bangla. Two Latin
  families maximum.
- **Colour:** every value comes from `tokens.json`; never hard-code a hex.
  - Brand: Ink #0B0F14 (base) · Navy #0B1A5C (depth) · Royal #2F5BFF (primary: logo, links, buttons, charts;
    5.2:1 on white) · Lime #D4F53C (the accent) · White. Neutrals: Slate #4B5578, Mist #DDE3F3, Paper
    #F4F6FD.
  - Lime goes only on Ink, Navy or Royal (it is 1.2:1 on white), at most once per view, and **never in data
    views**: it sits too close to the Low and Medium tiers. The forecast band is Royal at 15 %.
  - Risk tiers run light to dark: Low #BFE3CC · Medium #F0B429 · High #C2410C · Critical #7F1D1D. Every
    tier always shows its EN/BN label and its 1–4 bar meter.
  - Keep WCAG 2.2 AA everywhere. Re-check the tiers with Chrome DevTools' vision-deficiency emulation.
- **Deliverables:**
  - CSS variables and the Tailwind v4 `@theme`, generated from `docs/brand/tokens.json`
  - the SVGs copied into `apps/web/public/brand/`, plus a favicon set
  - a small `/brand` page in the app showing the tokens, the tier scale and the logo (shadcn and 21st.dev
    components, restyled with Abhas tokens)
  The guideline PDF is exported by the human from the canvas (Export → PDF) into `docs/brand/`.
- **Boundaries:** add no decorative animation: cosmetic UI earns no bonus points.

# 7. Product scope (PRD MoSCoW — ≤ 5 MUST, each mapped to a rubric line with Given/When/Then)
- **MUST**
  - M1, lag pipeline visible (rubric 2): the "Lags" panel shows a ward's rainfall shifted 0–8 weeks against its
    cases, with the 3-week peak.
  - M2, model inference + tiers (rubric 3): POST `/api/v1/forecast` covers ward(s), origin week, horizons or
    window, and dataset/live source.
  - M3, dashboard with inputs + driver breakdown (rubric 4): ward picker, week picker, window, tier card,
    80 % band, top drivers. Scenario sliders call POST `/api/v1/scenario` with weather inputs.
  - M4, run in ≤ 3 min + ARCHITECTURE.md + cost controls (rubric 1, 5, 6).
  - M5, demo-ready + git + disclosure (rubric 7, 8).
- **SHOULD** (bonus): ward × week tier heatmap per city, plus a schematic tile map labelled "schematic, ward
  geometry not in the dataset"; forecast bands on every chart; validation dashboard (MAE/RMSE by horizon,
  year and baseline, coverage, confusion matrix); live mode from Open-Meteo; the brand kit.
- **COULD**
  - Officer advisory (`/api/v1/advisory`, English/Bangla). Default is a deterministic template. The LLM
    (Claude Haiku 5.5, `claude-haiku-5-5`) is used only when `ANTHROPIC_API_KEY` is set, through the LLM port.
    It returns structured JSON; a validator rejects any number not present in the input. It caches by
    (ward, week, horizon, model version, language), uses max 400 output tokens, and stops at $1/day.
  - Vercel deploy after approval.
- **WON'T:** RAG, a vector DB, deep learning, auth, real ward polygons, SMS alerts.

# 8. External calls (system design: timeout, retry, fallback for each)
- **Open-Meteo Forecast API** (free, no key, non-commercial, < 10,000 calls/day, CC BY 4.0 attribution):
  - **One** multi-location request for the 5 city centroids with `past_days=92&forecast_days=16` covers
    every lag and two weeks ahead. Aggregate to ISO weeks (Mon–Sun, Asia/Dhaka) in the same units as the
    dataset; store in `weather_cache`; TTL 6 h.
  - Timeout 5 s connect / 10 s read; 2 retries with jitter on 429/5xx; circuit breaker.
  - Fallback chain: last cache → ward climatology normals, labelled on screen.
  - Centroids are a versioned config file with sources. All wards in a city share one grid point; the ward
    factors carry the local differences (document this in an ADR).
- **Weather-source check (DATA, SHOULD):** compare the dataset's weekly weather with Open-Meteo's historical
  archive for the same cities and weeks in 2016–2025 (bias, correlation, units). Apply a documented
  correction if needed. Live predictions are trusted only after this.
- **Anthropic API:** COULD only, above. The app must run with zero keys.
- **Cost controls to document with measured numbers:**
  - model loaded once at startup
  - all 60 wards × 4 horizons precomputed and cached by (origin, horizon, model version, weather hash)
  - ETag/Cache-Control on GET routes
  - weather and LLM call counters, plus cache hit rate, at `/api/v1/ops`
  - an estimated monthly cost for one city office

# 9. Git, review and disclosure
- Branches: `<worker>` → `lead` through `gates.mjs merge` (non-author review + slice check + CI).
- **Standing approval for `https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon`:**
  - push `lead` after every green merge
  - fast-forward `main` after each green phase
  - never force-push or rewrite history
- Small, conventional commits (`feat(forecast): …`).
- Each human teammate commits from their own account during the round (rubric 8), for example reviews, docs
  and the brand PR. Never put a person's name on commits they did not make.
- README "AI and external services" lists:
  - Claude Code (Opus 5.5), Antigravity (Gemini 4 Neon, Gemini 4 Hydrogen) and Orca — only the tools and
    models that actually wrote or reviewed code
  - the MCPs used
  - Open-Meteo (with attribution), Anthropic (if enabled), fonts and their licences, and the dataset source
- Every commit made by an agent carries a `Co-Authored-By` trailer.

# 10. Documents the judges read
- **ARCHITECTURE.md** (root, ≤ 2 pages):
  - a Mermaid data-flow diagram (xlsx/Open-Meteo → features → model → tiers/drivers → API → dashboard)
  - the chronological split as a timeline
  - why this model and which options were rejected
  - cost controls with measured numbers
  - a link to `docs/architecture.md` for the C4 views and ADRs
- **README:** "## Run it" (prerequisites, two commands, expected time), "## Architecture", "## Testing",
  disclosure, and a model card (data looks simulated; not validated on DGHS surveillance; not for real
  decisions without recalibration).
- **`docs/demo.md`:** an uncut ≤ 2:50 script with a timing table and a "demo mode" URL that preloads Dhaka
  South, a week three weeks after a heavy-rain week, and a Critical ward.
  - 0:00 what Abhas is
  - 0:15 pick a ward and week
  - 0:40 tier + band + drivers
  - 1:10 lag panel showing rain three weeks earlier
  - 1:35 scenario slider moves the tier
  - 2:00 city heatmap
  - 2:20 validation dashboard against baselines
  - 2:40 close
- The OUTSIDER scores a dry run with the real rubric in `docs/dry-run.md` (Total ≥ 85/100, blocking issues
  none) before the human records.

# 11. Start now
Phase 0: create the skeleton and copy the data into `data/raw/` (check the SHA-256 in TASK.md).

Send ONE credentials-gate message:
- `https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon` and confirmation that `gh` is signed in
- 21st.dev API key for the Magic MCP
- optional `ANTHROPIC_API_KEY`
- team members' GitHub usernames

Don't wait for the answers. Dispatch DESIGN (system design + PRD critique), DATA (ingest + feature builder +
leakage tests) and UI-2 (brand) as soon as their contracts exist. Keep `.orca-team/STATUS.md` current.

Stop only for: submitting, a public deploy, deleting data, spending money, or anything that would break the
standing git approval above.
