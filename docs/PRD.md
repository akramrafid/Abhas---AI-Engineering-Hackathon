# PRD — Abhas (আভাস): ward-level dengue early warning
_Owner: LEAD · Updated: 2026-11-21 16:40 BST · Status: locked (DESIGN critique applied)_

## Problem
Dengue surges in Dhaka and Chattogram arrive two to four weeks after heavy rain, because water trapped in drains
and containers needs 7–14 days to breed *Aedes aegypti* before incubation and symptoms follow; public health
officers act only after hospitals fill. In the provided data the deseasonalized rain–case correlation peaks at a
3-week lag (0.47), so a model that reads rain lags per ward can warn officers 2–4 weeks before the peak.

## Users
- **Ward health officer (DNCC / DSCC / CCC)** — plans larvicide, spraying and hospital stock for 10–20 wards on a
  weekly cycle, on a laptop in a city office; job: see which wards will be High or Critical in 2–4 weeks and why;
  success: names the top wards for next week's teams in under one minute and can defend the choice with the drivers.
- **City epidemiologist** — checks whether the warnings can be trusted; job: compare the model against simple
  baselines and see its error by horizon and year; success: reads MAE, coverage and tier accuracy against
  climatology on one screen.

## Rubric
| ID | Criterion | Weight |
|---|---|---|
| R1 | Reproducible local setup: public repo, dependency files, README launches the app in ≤ 3 min | 10 |
| R2 | Multi-week weather lag pipeline: ingests avg_temp_C, rainfall_mm, relative_humidity_pct; multi-week rainfall lags grouped per ward_id | 15 |
| R3 | Dengue risk prediction engine: trained model, dynamic predictions, tiers Low/Medium/High/Critical for selected wards and windows | 15 |
| R4 | Interactive user interface: working web dashboard with intuitive inputs and a clear driver breakdown | 10 |
| R5 | Architecture design: root ARCHITECTURE.md (1–2 pages), data-flow diagram, chronological validation split, model rationale | 10 |
| R6 | Compute and API cost efficiency: serialized model, fast inference, documented API-call minimisation and LLM cost controls | 10 |
| R7 | 3-minute uncut video demo: live app, voiceover, no slides | 20 |
| R8 | Git history and AI disclosure: distributed commits by all members, list of AI assistants and external APIs | 10 |
| RB | Bonus (≤ 5, only if all core works): ward heatmap, forecast intervals, chronological validation dashboard | 5 |

## Golden path
1. Officer opens `http://localhost:3000/?demo=1` (dashboard) → Dhaka South, a week three weeks after a heavy-rain
   week and the 2–4-week window are preselected; the ward list shows every ward's tier for that window.
2. Officer picks a ward in the ward picker → the tier card shows the tier (EN/BN label and 1–4 meter), expected
   weekly cases with the 80 % band, and the risk score 0–100 for each horizon 1–4 (POST `/api/v1/forecast`).
3. Officer reads the driver breakdown on the same screen → top 4 drivers with sign and size, e.g.
   "Rain 2–4 weeks ago: +60 %", "Water-logging: +35 %".
4. Officer opens the Lags panel → the ward's rainfall shifted 0–8 weeks is drawn against its cases, with the
   correlation per lag peaking at 3 weeks (GET `/api/v1/wards/{ward_id}/lags`).
5. Officer moves the scenario slider to 120 mm of rain this week → the forecast for weeks 2–4 and the tier change
   within one second (POST `/api/v1/scenario`).
6. Officer opens the city heatmap → ward × week tiers for the city (GET `/api/v1/heatmap`).
7. Epidemiologist opens the validation tab → MAE/RMSE by horizon and year against climatology, seasonal naive and
   the no-weather model, plus 80 % band coverage and the tier confusion matrix (GET `/api/v1/validation`).

## Requirements
| ID | Priority | Story | Rubric | Acceptance |
|---|---|---|---|---|
| FR-1 | MUST | As an officer I want to see a ward's rainfall lags 0–8 weeks against its cases so that I trust the 2–4-week warning | R2 | AC-1, AC-2 |
| FR-2 | MUST | As an officer I want a trained model to forecast each selected ward's cases and tier for an origin week and a 1–4-week window so that I can target wards before the peak | R3, R6 | AC-3, AC-4, AC-5 |
| FR-3 | MUST | As an officer I want a dashboard with ward, week and window inputs, a tier card with the 80 % band, the top drivers and a weather what-if so that I understand and act on the warning | R4 | AC-6, AC-7, AC-8 |
| FR-4 | MUST | As a judge I want the app to launch from a fresh clone with two README commands in ≤ 3 minutes, with ARCHITECTURE.md and measured cost controls, so that the work is reproducible and its design is clear | R1, R5, R6 | AC-9, AC-10 |
| FR-5 | MUST | As a judge I want a demo mode, an honest model card and a complete AI/API disclosure so that the 3-minute video and the git history score fully | R7, R8 | AC-11, AC-12 |
| FR-6 | SHOULD | As an officer I want a ward × week tier heatmap per city (plus a tile map labelled schematic) so that I see the whole city at once | RB, R4 | AC-13 |
| FR-7 | SHOULD | As an epidemiologist I want a validation dashboard (MAE/RMSE by horizon and year vs baselines, coverage, confusion matrix) so that I can judge the model | RB, R5 | AC-14 |
| FR-8 | SHOULD | As an officer I want live mode with Open-Meteo forecast rain so that the system works on this week's weather | R2, R6 | AC-15 |
| FR-9 | SHOULD | As the team I want the Abhas brand kit applied (tokens, logo, `/brand` page) so that the product looks like one system | R4, R7 | AC-16 |
| FR-10 | COULD | As an officer I want a short English/Bangla advisory for a ward so that I can brief field teams | R6 | AC-17 |

## Acceptance criteria
- **AC-1** Given the seeded dataset, when GET `/api/v1/wards/{ward_id}/lags` is called for any of the 60 wards, then it returns lags 0–8 with the Pearson correlation of ward × ISO-week-demeaned rainfall (lagged k weeks) against demeaned cases, for the ward and for the whole dataset (the dataset-wide series peaks at lag 3), and Playwright confirms that selecting lag k shifts the rendered rainfall series by k weeks.
- **AC-2** Given the feature builder `app/shared/features.py`, when features are built from the dataset, then `avg_temp_c` (rubric `avg_temp_C`), `rainfall_mm` and `relative_humidity_pct` are all ingested per `ward_id` with no nulls in the source columns, the first k rows of every lag-k feature are empty for every ward, and no value comes from another ward (unit test `test_ac_2_lags_grouped_by_ward`); when an unknown `ward_id` is requested on the lags route, then it returns 404 problem+json whose `type` ends in `/unknown-ward`.
- **AC-3** Given the committed joblib model artifact loaded once at startup, when POST `/api/v1/forecast` is sent with `ward_ids` (1–60 known wards), a Monday `origin_week` between 2016-02-29 and 2025-12-29 and `horizons` ⊆ {1,2,3,4}, then each ward × horizon gets `expected_cases ≥ 0`, `0 ≤ p10 ≤ expected_cases ≤ p90` (p90 clamped to at least the mean), `risk_score` 0–100, `tier` ∈ {Low, Medium, High, Critical}, at most 4 drivers and `model_version`, built only from data dated ≤ `origin_week`; the same request twice returns identical numbers.
- **AC-4** Given a bad request, when an unknown `ward_id` is posted to `/api/v1/forecast` or `/api/v1/scenario`, then the API returns 404 problem+json naming `ward_id`; when `origin_week` is not a Monday or lies outside 2016-02-29…2025-12-29, `horizons` contains 0 or 5, more than 60 wards are sent, or scenario rainfall is negative or above 500, then it returns 422 problem+json naming the field, and the `predictions_cache` row count is unchanged.
- **AC-5** Given the 2024–2025 hold-out locked by SHA-256 before tuning, when `npm run eval` runs, then it exits 0 and writes `apps/api/evals/results/eval.json` showing MAE at h = 2 and 3 ≤ 1.10 and ≥ 10 % below ward × ISO-week climatology, MAE at h = 4 below climatology, MAE worse at every h without weather features, 80 % band coverage in [0.75, 0.90], tiers within one band ≥ 0.95 against actual tiers from the fixed cut-offs, actual-Critical weeks predicted High or Critical ≥ 0.85, RMSE and Poisson deviance for every h, and ≥ 0.80 of the 48 golden cases passing.
- **AC-6** Given the dashboard at `/`, when the officer picks a city, a ward, an origin week and a window, then a Playwright test sees the tier card with the peak-window tier (the highest tier across the window's horizons) in English and Bangla with its 1–4 meter, one row per horizon with expected cases and the 80 % band, and the top drivers with sign and percentage; the forecast call behind it meets NFR-2.
- **AC-7** Given a fixed demo baseline (a non-Critical ward-week with < 20 mm rain in the origin week), when the officer sets this week's rainfall to 120 mm in the scenario panel, then POST `/api/v1/scenario` returns a scenario whose h = 3 `expected_cases` is strictly higher than the baseline's (rain lags carry a monotone-increasing constraint in the model) and the rendered card updates; rainfall outside 0–500 mm is rejected by the form and by the API with 422.
- **AC-8** Given the API is down or returns 5xx, when the dashboard loads or a forecast is requested, then the page shows an error state with a Retry button and no stale tier is shown as current; an unknown ward in the URL shows "Ward not found" instead of a blank chart.
- **AC-9** Given a fresh clone on Windows or macOS with Python 3.12 and Node 22, when `npm run setup` and then `npm run dev` are run, then the dashboard answers at `http://localhost:3000` and the API's `/readyz` is 200 within 180 s in total, without training a model and without any API key.
- **AC-10** Given the running app, when `/api/v1/ops` is called (open on localhost when `OPS_TOKEN` is unset; `X-Ops-Token` required when it is set), then it reports model load count = 1, prediction cache hit rate, weather API call count, LLM call count and spend; root ARCHITECTURE.md (≤ 2 pages) contains the data-flow diagram, the chronological split timeline, the model choice with rejected options, the joblib artifact load path, and the cost controls with these measured numbers.
- **AC-11** Given `/?demo=1`, when the page loads, then Dhaka South, the pinned demo origin week and the pinned Critical ward (both recorded in `docs/demo.md`) are preselected and golden-path steps 1–5 work offline in dataset mode with no keys; `docs/demo.md` holds an uncut ≤ 2:50 script with a timing table and no slides, and `docs/dry-run.md` records an OUTSIDER (different model family from the docs' author) score ≥ 85/100 with no blocking issues before the human records the ≤ 3:00 video.
- **AC-12** Given the repo, when a judge reads README and `git shortlog -sn`, then README lists every AI assistant and model that wrote or reviewed code, the MCPs used, Open-Meteo with attribution, Anthropic if enabled, font licences, the dataset source and the two launch commands of AC-9, plus a model card stating the data looks simulated and is not validated on DGHS surveillance; the history shows commits from every team member and agent commits carry `Co-Authored-By` trailers.
- **AC-13** Given a city and an origin week, when GET `/api/v1/heatmap` is called, then it returns one tier per ward × horizon for that city, and the heatmap renders it with the tier colours and labels; the tile map carries the label "schematic, ward geometry not in the dataset".
- **AC-14** Given the stored backtest results, when GET `/api/v1/validation` is called, then it returns MAE and RMSE by horizon and by test year for the model and every baseline, 80 % band coverage and the tier confusion matrix; the validation tab renders them.
- **AC-15** Given `WEATHER_MODE=live` and a recorded Open-Meteo-vs-dataset historical check (bias, correlation, units) in `docs/data-pipeline.md`, when a forecast is requested, then at most one Open-Meteo request per 6 h is made for all five city centroids, any versioned bias correction is applied, and live forecasts carry a centroid-approximation badge; when Open-Meteo is down, then the last cache and then ward climatology are used and the screen labels the source.
- **AC-16** Given the web app, when any page renders, then every colour comes from the tokens generated from `docs/brand/tokens.json`, Lime never appears in a data view, and `/brand` shows the tokens, the tier scale and the logo.
- **AC-17** Given no `ANTHROPIC_API_KEY`, when POST `/api/v1/advisory` is called, then a deterministic template advisory is returned; with a key, the LLM output is structured JSON, every number in it appears in the input, output ≤ 400 tokens, responses are cached by (ward, week, horizon, model version, language), and calls stop at $1 per day.

## Non-functional requirements
| ID | Requirement | Target | Measured by |
|---|---|---|---|
| NFR-1 | In-process model inference per ward | < 50 ms p95 | backtest timing in `npm run eval`, `/api/v1/ops` |
| NFR-2 | API latency under load | p95 < 300 ms at 20 VUs, error rate < 1 % | gates load (k6) |
| NFR-3 | Forecast accuracy on locked hold-out 2024–2025 | MAE h=2,3 ≤ 1.10 and ≥ 10 % below climatology; 80 % coverage 0.75–0.90 | gates eval |
| NFR-4 | Ward ranking (top-15 by cases over t+2..t+4, held-out in-season weeks) | recall ≥ 0.55 and ≥ climatology, n ≥ 30 | gates retrieval |
| NFR-5 | Fresh-clone setup to usable dashboard | ≤ 180 s, zero keys | gates fresh-clone |
| NFR-6 | Accessibility | WCAG 2.2 AA; tiers readable under colour-vision emulation (labels + meter) | gates e2e (axe) |
| NFR-7 | Cost | ≤ 1 Open-Meteo call per 6 h; LLM ≤ $1/day, ≤ 400 output tokens; model loaded once | gates traces, `/api/v1/ops` |
| NFR-8 | Security | ≥ 25 attacks with ≥ 95 % pass; gitleaks clean | gates redteam |

## Out of scope
- RAG or a vector database — there are no documents to retrieve.
- Deep learning (LSTM, TFT, foundation models) — torch breaks the 3-minute setup and the joblib requirement.
- Authentication and user accounts — single-office local tool for this round.
- Real ward polygons — ward geometry is not in the dataset; the tile map is schematic.
- SMS or push alerts, cloud deployment (Vercel only after all MUSTs pass and the human approves).

## Demo script
| Time | Beat | Rubric |
|---|---|---|
| 0:00–0:15 | What Abhas is: rain today, risk in three weeks; open demo mode | R7 |
| 0:15–0:40 | Pick Dhaka South, a ward and a week; window 2–4 weeks | R4, R7 |
| 0:40–1:10 | Tier card, 80 % band, risk score and top drivers ("rain 3 weeks ago +60 %") | R3, R4 |
| 1:10–1:35 | Lags panel: rain three weeks earlier lines up with the case peak | R2 |
| 1:35–2:00 | Scenario slider to 120 mm moves the tier | R3, R4 |
| 2:00–2:20 | City heatmap of ward × week tiers | RB |
| 2:20–2:40 | Validation tab: MAE vs climatology, coverage, cost numbers from `/ops` | R5, R6, RB |
| 2:40–2:50 | Close: run in two commands, model card limits | R1, R8 |

## Assumptions
- Ward geometry is absent, so maps are schematic and labelled as such.
- The dataset looks simulated; results are reported as fitted to this data only, not real-world validity.
- The origin week is the last fully observed week; horizons count whole ISO weeks after it.
- Dataset mode and every backtest use only data dated ≤ `origin_week` for all horizons; normals, tier cut-offs
  and the endemic channel are fit on years ≤ 2023 and stored in the artifact. Forecast rain for weeks after the
  origin is used only in live mode (Open-Meteo).
- Wave 1 forecast bands come from a negative binomial around the Poisson mean (dispersion fit on 2023,
  conformal-adjusted to hit 80 %); quantile LightGBM + CQR is added only if coverage misses [0.75, 0.90].
- SQLite runs in WAL mode with a busy timeout; hot predictions and ops counters are served from memory.
- All wards in a city share one Open-Meteo grid point in live mode; ward factors carry local differences.
