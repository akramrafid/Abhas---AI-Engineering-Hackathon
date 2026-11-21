# PRD — Abhas (আভাস): ward-level dengue early warning
_Owner: LEAD · Updated: 2026-11-21 15:55 BST · Status: draft_

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
- **AC-1** Given the seeded dataset, when GET `/api/v1/wards/{ward_id}/lags` is called for any of the 60 wards, then the response holds lags 0–8, each with a deseasonalized rain–case correlation, and the city-level series peaks at lag 3; the Lags panel draws the ward's rainfall shifted by the selected lag against its weekly cases.
- **AC-2** Given the feature builder, when the lag features are built, then for every ward the first k rows of lag k are empty and no value comes from another ward (unit test `test_ac_2_lags_grouped_by_ward`); an unknown `ward_id` on the lags route returns 404 problem+json with `type` ending in `/unknown-ward`.
- **AC-3** Given the committed model artifact, when POST `/api/v1/forecast` is sent with `ward_ids` (1–60 known wards), an `origin_week` inside the data range and `horizons` ⊆ {1,2,3,4}, then each ward × horizon gets `expected_cases ≥ 0`, `p10 ≤ expected_cases ≤ p90`, `risk_score` 0–100, `tier` ∈ {Low, Medium, High, Critical}, the top 4 drivers, and `model_version`; the same request twice returns identical numbers.
- **AC-4** Given a bad request (unknown ward, origin week outside 2016-01-04…2025-12-29 in dataset mode, horizon 0 or 5, more than 60 wards, NaN or negative rainfall), when it is posted, then the API answers 422 or 404 problem+json naming the field, and nothing is cached.
- **AC-5** Given the hold-out years 2024–2025 locked by SHA-256, when `npm run eval` runs, then MAE at h = 2 and 3 is ≤ 1.10 and ≥ 10 % below ward × week-of-year climatology, MAE at h = 4 is below climatology, removing weather makes MAE worse at every horizon, the 80 % band covers 0.75–0.90 of hold-out weeks, and tiers are within one band on ≥ 0.95 of cases.
- **AC-6** Given the dashboard at `/`, when the officer picks a city, a ward, an origin week and a window, then the tier card shows the tier label in English and Bangla with its 1–4 meter, expected cases with the 80 % band, and the top 4 drivers with sign and percentage, within 1 s of the last input on a laptop.
- **AC-7** Given the scenario panel, when the officer sets this week's rainfall to 120 mm (and optionally temperature and humidity), then POST `/api/v1/scenario` returns the changed forecast and the tier card and band update; values outside 0–500 mm rain, 5–45 °C or 0–100 % humidity are rejected in the form and by the API (422).
- **AC-8** Given the API is down or returns 5xx, when the dashboard loads or a forecast is requested, then the page shows an error state with a Retry button and no stale tier is shown as current; an unknown ward in the URL shows "Ward not found" instead of a blank chart.
- **AC-9** Given a fresh clone on Windows or macOS with Python 3.12 and Node 22, when `npm run setup` and then `npm run dev` are run, then the dashboard answers at `http://localhost:3000` and the API's `/readyz` is 200 within 180 s in total, without training a model and without any API key.
- **AC-10** Given the running app, when `/api/v1/ops` is called with the ops token, then it reports model load count = 1, prediction cache hit rate, weather API call count and LLM call count and spend; ARCHITECTURE.md quotes these measured numbers.
- **AC-11** Given `/?demo=1`, when the page loads, then Dhaka South, the preset origin week and a Critical ward are preselected and every golden-path step works offline (dataset mode, no keys).
- **AC-12** Given the repo, when a judge reads README, then it lists every AI assistant and model that wrote or reviewed code, the MCPs used, Open-Meteo with attribution, Anthropic if enabled, font licences and the dataset source, and a model card stating the data looks simulated and is not validated on DGHS surveillance.
- **AC-13** Given a city and an origin week, when GET `/api/v1/heatmap` is called, then it returns one tier per ward × horizon for that city, and the heatmap renders it with the tier colours and labels; the tile map carries the label "schematic, ward geometry not in the dataset".
- **AC-14** Given the stored backtest results, when GET `/api/v1/validation` is called, then it returns MAE and RMSE by horizon and by test year for the model and every baseline, 80 % band coverage and the tier confusion matrix; the validation tab renders them.
- **AC-15** Given `WEATHER_MODE=live`, when a forecast is requested, then at most one Open-Meteo request per 6 h is made for all five cities; when Open-Meteo is down, the last cache and then ward climatology are used and the screen labels the source.
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
- In dataset mode the "future" weather for h = 4 comes from the dataset (perfect-knowledge upper bound is not
  used for scoring); live mode uses Open-Meteo forecast rain.
- All wards in a city share one Open-Meteo grid point in live mode; ward factors carry local differences.
