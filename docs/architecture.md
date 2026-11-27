# Architecture — Abhas (dengue early warning)

Abhas is a modular monolith: one FastAPI service (Python 3.12) and one Next.js 16 dashboard, run locally with
two commands. Inside the API, each product capability is a **vertical slice** (`app/features/<name>/`), and
every outside dependency (weather provider, trained model, LLM, database) sits behind a **port** with a real and
a fake adapter (ADR-0001). Archetype: **prediction service + analytics dashboard** (tabular forecasting with an
explainability layer); the optional advisory adds a small structured-output LLM step. No RAG, no vector store.

## Context (C4 L1)
```mermaid
flowchart LR
  officer([Ward health officer]) -->|picks wards, weeks, what-if weather| abhas[Abhas]
  epi([City epidemiologist]) -->|checks validation vs baselines| abhas
  abhas -->|1 multi-city request per 6 h, HTTPS JSON| om[(Open-Meteo Forecast API · free, CC BY 4.0)]
  abhas -.->|optional advisory, HTTPS JSON, ≤ 400 tokens| llm[(Anthropic API · Claude Haiku 5.5)]
  xlsx[[Organisers' dataset xlsx · 31,320 ward-weeks]] -->|seeded once at setup| abhas
```

## Containers (C4 L2)
```mermaid
flowchart LR
  browser([Browser]) -->|HTTP :3000| web[Next.js 16 dashboard · apps/web]
  web -->|JSON over HTTP :8000, typed client from contracts/openapi.json| api[FastAPI · apps/api]
  api -->|SQLAlchemy, WAL| db[(SQLite file data/abhas.db · Postgres-ready via Alembic)]
  api -->|joblib.load once at startup| model[[ml/artifacts/abhas-&lt;version&gt;.joblib + metadata.json]]
  api -->|httpx, 5 s connect / 10 s read, 2 retries, breaker| om[(Open-Meteo)]
  api -.->|LLM port, budget $1/day| llm[(Anthropic)]
  train[[ml/train.py + ml/backtest.py · offline]] -->|writes artifact + eval results| model
  seed[[scripts/seed.py · setup]] -->|xlsx → observations, wards| db
```

### Inside the API (one slice per capability)
| Slice | Routes | Owner | Uses |
|---|---|---|---|
| `wards` | GET /api/v1/wards, /wards/{id}/history | DATA | ObservationRepository |
| `lags` | GET /api/v1/wards/{id}/lags | DATA | ObservationRepository, `shared/features.py` |
| `forecast` | POST /api/v1/forecast, /api/v1/scenario | CORE | ForecastModel, WeatherSource, PredictionCache |
| `heatmap` | GET /api/v1/heatmap | CORE | same as forecast (shared service code in `shared/`) |
| `validation` | GET /api/v1/validation | CORE | stored backtest results (`evals/results/`) |
| `weather` | GET /api/v1/weather/status | DATA | WeatherSource, CallLog |
| `advisory` | POST /api/v1/advisory | CORE | LLM port (fake when no key), PredictionCache |
| `ops` | GET /api/v1/ops | CORE | counters, CallLog |

`app/shared/features.py` is **the** feature builder, imported by training, backtest and serving, so there is
no train/serve skew. `app/shared/tiers.py` and `app/shared/drivers.py` hold tier cut-offs and the SHAP-to-driver
grouping. Contracts (`features/*/schemas.py`, `ports/`, `core/types.py`) are owned by LEAD.

## Deployment
| Container | Platform | Config | State |
|---|---|---|---|
| web | `npm run dev` (Next.js dev server) or `next build && next start`, localhost:3000 | `NEXT_PUBLIC_API_BASE_URL` | none (browser cache only) |
| api | `python -m app` (uvicorn), localhost:8000 | `.env` (all optional) | SQLite file `data/abhas.db` (created by `alembic upgrade head` + seed) |
| model | committed joblib artifact, SHA-256 checked at setup | `MODEL_PATH` | read-only file |
| Stage 2 (final sprint) | same containers; `DATABASE_URL` → Postgres; live weather on a schedule | — | Postgres |

Run: `npm run setup` (uv if present, else venv + pip; `npm ci`; migrate; seed; artifact check) then `npm run dev`.
Deploy to Vercel is out of scope for this round (ADR-0002); it needs the human's approval.

## Key flows
Sequence diagrams, the resilience register, latency budget and rate limits are in `docs/system-design.md`
(DESIGN seat). Data pipeline and lag features: `docs/data-pipeline.md` (DATA). Model, evaluation and tiers:
`docs/ai-design.md` (CORE).

## Decisions
`docs/adr/`: 0001 vertical slices · 0002 SQLite + Alembic, local run · 0003 LightGBM Poisson direct multi-horizon ·
0004 chronological validation and uncertainty · 0005 weather source and caching · 0006 advisory LLM ·
0007 dashboard stack and data fetching · 0008 request/response, no auth.

## Phase 2 — operational command system (version-onsite-final)
Architecture style is unchanged (ADR-0001: modular monolith, vertical slices, ports & adapters).
- **New API slices** (`apps/api/app/features/`): `allocation` · `overflow` · `simulator` · `dispatch` · `plans` · `planning` (structural-fix planner, ADR-0021) · `facilities` (nearest bed & ambulance control-room view, ADR-0018); `validation` gains `GET /api/v1/validation/trigger` (ADR-0020).
- **New shared modules** (`apps/api/app/shared/`): `supply.py` (cases → supplies at a service level),
  `optimizer.py` (weighted LP allocation, rounding, deficit flags, greedy crews), `routing.py` (intra-city
  min-max transportation LP + arc-minimising MILP, capacity derivation), `intervention.py` (efficacy curve,
  monotone feature reduction, counterfactual bookkeeping), `trigger.py` (early-action threshold rule, Peirce
  skill score, episode lead-time quartiles), `structural.py` (Poisson GLM + LightGBM partial dependence
  annualised case-prevention helpers and build-vs-send ratio), `facilities.py` (Haversine distance, 3-tier
  nearest-bed ranking, phone/`tel:` sanitisation).
- **New ports**: `ports/supply.py` (supply ratio source), `ports/capacity.py` (bed capacity source),
  `ports/intervention.py` (counterfactual forecaster, implemented by the forecast engine),
  `ports/planning.py` (precomputed trigger evaluation and structural-planner JSON sources),
  `ports/facilities.py` (hospital directory, bed updates, and ambulance request log store).
- **New web slice**: `apps/web/src/features/command/` — the 5-step Command Center
  (Forecast → Allocate → Route → Simulate → Dispatch), `apps/web/src/features/nearest-bed/` (Nearest Bed &
  Ambulance control-room view, ADR-0018), plus Validation trigger panel and Command Center Build-vs-Send panel.
- **Rules**: all Phase 2 maths is pure, deterministic, offline Python (NumPy/SciPy). No network on any core path.
  Features never import each other; cross-slice logic lives in `shared/`. Every Phase 2 response carries
  `model_version`, `git_sha`, `data_as_of` and `offline`.

Phase 2 decisions: 0009 supply conversion · 0010 constrained allocation · 0011 crew assignment ·
0012 overflow routing · 0013 counterfactual simulator · 0014 dispatch templates · 0015 offline resilience ·
0016 plans and decision log · 0018 nearest bed & ambulance · 0020 early-action trigger · 0021 structural-fix planner.

### Phase 2 ADR summary (full text in `docs/adr/0009…0016`; ADR-0018, ADR-0020, and ADR-0021 below)
| ADR | Decision | Rejected (why) |
|---|---|---|
| 0009 Supply conversion | The data's exact rule `round(c × cases)` with c = 2.385 saline, 1.164 kits, 0.298 beds (reproduces 100 % of rows), applied to a service-level quantile of window cases (moment-matched NB; P80 saline/kits, P90 beds) | Regression ratios (approximate a deterministic rule); unverified multipliers; three extra models (nothing to learn) |
| 0010 Constrained allocation | City pool, S = stock% × planned demand; maximise Σ w·x with w = tier weight × density factor, equity floor 20 %, SciPy HiGHS, largest-remainder integers; critical = unmet High/Critical or < 50 % | Proportional-only (ignores priority); OR-Tools (extra dependency, SciPy already solves it in ms) |
| 0011 Crew assignment | Greedy by marginal cases prevented, same effect model as the simulator; optimal for separable concave benefit | Integer programme over all splits (unneeded); crews by tier (ignores real effect) |
| 0012 Overflow routing | Intra-city transportation LP minimising max utilisation, then MILP minimising transfers; capacity = max(1, ceil(1.10 × P95 weekly beds, 2016–2022)), 3–7 per ward, 284 total, UI override (human-approved; no capacity column); no distances (no coordinates) | Nearest-neighbour greedy (no global balance); cross-city transfers (rubric forbids); invented capacity or geography |
| 0013 Counterfactual simulator | Reduce the model's per-horizon monotone rain features by E(c) = E_max(1 − e^(−kc)), re-predict h = 2..4; counterfactual ≤ baseline guaranteed; presets low/base/high as a band; ROI = cases per crew | Static % toggle (5/10 on the rubric); causal model (no intervention labels); perturbing raw weather (breaks the guarantee) |
| 0014 Dispatch | Deterministic templates; segment-aware SMS (GSM-7 160/153, UCS-2 70/67); WhatsApp text; HTML brief + Playwright PDF; number-faithfulness test; HTML escaping | LLM-written notices (network, altered numbers); server PDF libraries (broken Bangla shaping) |
| 0015 Offline resilience | ABHAS_OFFLINE kill switch + probe; 2 s timeouts, breakers, cache → climatology; no network at startup; self-hosted assets; map fallback; Clerk off; `npm run offline:check` gate | Cloud LLM on the dispatch path; startup connectivity check |
| 0016 Plans and decision log | Every run stored with inputs, outputs, model version, git SHA; compare two plans | localStorage history (not auditable); full event sourcing (overkill) |
| 0018 Nearest Bed & Ambulance | Control-room view linking real OSM hospital snapshot (ODbL, attribution) to synthetic wards at city level; client-side Haversine ranking (user GPS never sent to API); 3-tier ranking (fresh `free_beds ≥ 1` & age `≤ 6 h` → stale `free_beds ≥ 1` flagged → nearest city alternative); offline GeoJSON-only map + straight-line ETA "estimate"; verified OSM phones only + always-present Call 999; clearly labelled DEMO bed data; Alembic `0003` (`hospitals`, `bed_updates`, `ambulance_requests`, zero patient PII); manager-gated bed updates | Google Places API (terms prohibit offline storage); live hospital bed APIs (none exist publicly in Bangladesh); server-side GPS lookup (unnecessary privacy risk); inventing phone numbers or patient fields |
| 0020 Early-action trigger | Auditable zero-model rule `2-week rain > R mm AND water_logging_risk_index ≥ W` tuned on 2016–2023 by max Peirce skill score for High (`cases ≥ 8`) at `h = 3` (reference: `R = 80`, `W = 0.3`; hold-out hit rate `0.94`, FAR `0.63`, Peirce `0.73`, median lead `4` wks); benchmarked vs Abhas model on locked 2024–25 hold-out; printed on commissioner briefs; served from precomputed JSON at `GET /api/v1/validation/trigger` | Black-box-only alerts (unusable when offline/power-out); tuning thresholds on 2024–25 (hold-out leakage); F1-maximising thresholds (distorted by class imbalance) |
| 0021 Structural-fix planner | Annualised cases prevented per ward for `−0.1/−0.2` `water_logging_risk_index` and `+0.1/+0.2` `sanitation_score` via Poisson GLM (`rainfall_lag_2..4` + 3 ward traits) cross-checked by LightGBM partial dependence (single-trait shift), both with bootstrap 95 % CIs; paired with a "build vs send" comparison against simulator crew ROI; mandatory simulated-association disclaimer; served from precomputed JSON at `GET /api/v1/planning/structural?city=` | Claiming causal real-world drainage impact (no intervention labels; static ward traits); single-estimator reporting (hides functional-form sensitivity); on-request GLM/bootstrap fitting (too slow for interactive HTTP) |

---

### ADR-0018: Nearest Bed & Ambulance (control-room view)

**Status:** Accepted · 2026-11-27 (Phase 2 extension)

**Context.**
During a dengue surge, emergency dispatchers and ward control rooms need to find the nearest hospital with an open dengue bed, call a verified facility desk (or national emergency 999), log an ambulance coordination request, and let hospital bed-board managers update available counts — even when internet connectivity drops or location permissions are denied.

**Decision.**
- **City-level link to synthetic wards.** Because the hackathon dataset's 60 wards are synthetic without official boundary polygons, real hospitals link to Abhas forecasts at the **city** level (`Dhaka North`, `Dhaka South`, `Chattogram`, `Gazipur`, `Narayanganj`), surfacing each city's current/peak risk tier badge alongside facility capacity.
- **OpenStreetMap snapshot (ODbL, attribution).** Run `scripts/fetch_hospitals.py` once while online against Overpass (`amenity=hospital` / `healthcare=hospital` across the 5 cities) to commit `apps/api/data/hospitals.geojson` with `snapshot_date` and attribution (`© OpenStreetMap contributors · ODbL 1.0`). Keep a phone number **only** if present in OSM `phone` / `contact:phone` tags; never fabricate numbers.
- **Client-side nearest ranking (location never sent).** Consented browser geolocation (5 s timeout, falling back cleanly to a city/ward centroid picker when denied or unavailable) stays strictly inside browser memory. All Haversine distances, straight-line ETA estimates, and facility rankings execute client-side; user coordinates are **never** sent to any API endpoint or written to server logs.
- **Deterministic 3-tier ranking rule.** Rank hospitals against the user's chosen/detected `(lat, lon)` and city:
  1. **Tier 1 (Fresh available):** `free_beds >= 1` AND bed-data age `<= 6 hours`, sorted by Haversine distance ascending (ties: higher `free_beds`, then `hospital_id`).
  2. **Tier 2 (Stale available):** `free_beds >= 1` AND bed-data age `> 6 hours`, flagged visibly as **stale**, sorted by distance ascending.
  3. **Tier 3 (City alternative / full):** `free_beds == 0`, preferring same-city alternatives first, then nearest overall, sorted by distance ascending.
- **Offline operation.** Offline mode reads the committed local GeoJSON via the local API, renders a **GeoJSON-only MapLibre canvas with zero external map tiles**, and labels Haversine travel time explicitly as a **"straight-line estimate"** (`ceil(km / 18 * 60 + 5)` min).
- **Verified phone numbers only + always-present Call 999.** Render `tel:` links only after strict sanitisation (`^[+0-9()\-\s]{6,24}$` → digits/`+` only) for OSM-verified numbers; display an always-accessible **Call 999** button on every card and header.
- **Demo bed data clearly labelled.** Seeded bed counts carry `data_source = "demo"` in the API and a visible **"Demo bed data"** badge in the UI until updated by a hospital manager (`data_source = "board"`).
- **Endpoints & persistence (Alembic `0003_facilities`).**
  - `GET /api/v1/facilities/hospitals` (optional `?city=`, offline)
  - `POST /api/v1/facilities/beds/{hospital_id}` (manager role required; `403` otherwise)
  - `POST /api/v1/facilities/ambulance-requests` and `GET /api/v1/facilities/ambulance-requests` (control-room coordination log; **strictly zero patient personal data** — no names, phone numbers, NIDs, ages, addresses, or user GPS).
  - Reversible Alembic migration `0003_facilities` creating `hospitals`, `bed_updates`, and `ambulance_requests`.

**Rejected options.**
- *Google Places API* — rejected: terms forbid storing/caching place snapshots offline and require billed API keys.
- *Live government/hospital bed APIs* — rejected: no public real-time dengue bed API exists for Bangladesh hospitals.
- *Server-side nearest-hospital lookup with user GPS* — rejected: exposes sensitive user location to backend logs when client-side Haversine over `< 200` hospitals takes `< 1 ms`.

**Consequences.**
Control rooms get an offline-capable, privacy-preserving hospital bed & ambulance directory grounded in real ODbL hospital coordinates, cleanly separated from synthetic ward forecasts and honest about seeded demo bed availability.

---

### ADR-0020: Early-action trigger

**Status:** Accepted · 2026-11-27 (Phase 2 extension)

**Context.**
Ward health officers and field commissioners need an operational rule they can audit on a clipboard and act on even when laptops, mobile networks, and the Abhas server are unavailable. At the same time, city epidemiologists need to see whether the full LightGBM early-warning model (`abhas-lgbm-1.1.2`) adds genuine precision over a transparent rainfall-and-drainage rule on the locked 2024–2025 hold-out split.

**Decision.**
- **Auditable rule.** Define a binary early-action trigger at origin week $t$ for ward $i$:
  > **Act when 2-week cumulative rainfall $> R\text{ mm}$ AND `water_logging_risk_index` $\ge W$.**
  Here 2-week rainfall is $R_{2\text{w}}(i, t) = \text{rainfall\_lag\_0} + \text{rainfall\_lag\_1}$ (strictly causal $\le t$), and `water_logging_risk_index` is the ward's static drainage risk index.
- **Chronological threshold selection (zero leakage).** Choose $(R, W)$ strictly on the **2016–2023** training/tuning span by grid-maximising the **Peirce skill score** ($\text{PSS} = H - F$, where $H$ is hit rate / POD and $F$ is false-alarm rate / POFD) for predicting a **High or Critical** outbreak week (`dengue_cases ≥ 8`, matching `DEFAULT_TIER_CUTOFFS[1] = 8.0`) **3 weeks later** ($h = 3$).
- **Locked 2024–2025 hold-out evaluation.** Evaluate the frozen $(R, W)$ rule on the locked 2024–2025 hold-out (`6,240` ward-weeks) and report:
  1. **Hit rate** ($H = \text{TP}/(\text{TP}+\text{FN})$),
  2. **False-alarm ratio** ($\text{FAR} = \text{FP}/(\text{TP}+\text{FP})$) alongside false-alarm rate ($F$),
  3. **Peirce skill score** ($\text{PSS} = H - F$),
  4. **Alerts vs High weeks** (total alert ward-weeks vs observed High-or-Critical ward-weeks),
  5. **Lead-time quartiles** (Q25, median, Q75 in weeks from earliest pre-onset alert to each High spell onset).
- **Benchmark against Abhas model alerts.** Score Abhas LightGBM $h = 3$ alerts on the **exact same locked 2024–2025 hold-out ward-weeks**. Target: **same hit rate or better, with fewer false alarms** (lower FAR and higher PSS than the clipboard rule), quantifying the exact operational gain of running the full ML model.
- **Reference numbers (quick replay on the locked onsite dataset):** $R = 80\text{ mm}$, $W = 0.3$; locked 2024–2025 hold-out hit rate **`0.94`**, FAR **`0.63`**, Peirce **`0.73`**, median lead **`4` weeks**.
- **Zero-model operational delivery.** Print the rule verbatim (in English and Bangla, along with whether the ward meets `water_logging_risk_index ≥ W`) on printable commissioner briefs (`GET /api/v1/dispatch/brief/{ward_id}.html` and `/exports/brief_*.{html,pdf}`) so it works with no model at all.
- **Offline serving.** Precompute the full evaluation offline into a SHA-256-locked JSON artefact and serve it at `GET /api/v1/validation/trigger` with zero runtime training or network access.

**Rejected options.**
- *Model-only alerting with no clipboard rule* — fails gracefully-degraded operations during power/network outages and gives field commissioners no human-auditable heuristic.
- *Tuning $(R, W)$ on 2024–2025* — violates the locked hold-out protocol (ADR-0004).
- *Optimising F1 or accuracy* — accuracy is dominated by non-High weeks and F1 depends on base-rate prevalence; Peirce skill score is base-rate invariant and standard in meteorological early warning.

**Consequences.**
Officers get a zero-dependency field trigger printed right on every ward brief, while judges and epidemiologists get an apples-to-apples hold-out proof showing that the Abhas model maintains high recall while cutting false alarms compared to a well-tuned heuristic.

---

### ADR-0021: Structural-fix planner

**Status:** Accepted · 2026-11-27 (Phase 2 extension)

**Context.**
Phase 2's counterfactual simulator (ADR-0013) evaluates short-term seasonal vector-control spraying ("send crews"), which must be repeated every monsoon. City corporation planners and judges also ask the strategic capital-planning question: *which wards would avoid the most dengue cases per year if permanent drainage (`water_logging_risk_index`) or municipal sanitation (`sanitation_score`) were improved, and how does permanent "build" compare against recurring "send"?*

**Decision.**
- **Target outputs.** Estimate **cases prevented per year per ward** (and city/overall seasonal percentage reductions) for four fixed structural improvement steps:
  - `water_logging_risk_index`: `−0.1` and `−0.2` (clamped at `≥ 0.0`, since lower risk is better),
  - `sanitation_score`: `+0.1` and `+0.2` (clamped at `≤ 1.0`, since higher sanitation is better).
- **Dual estimation with bootstrap 95 % CIs (no single-model blind spot).**
  1. **Poisson GLM (log link):** fit on the 2016–2023 historical panel using `rainfall_lag_2`, `rainfall_lag_3`, `rainfall_lag_4` plus the three static ward traits (`population_density_sqkm`, `water_logging_risk_index`, `sanitation_score`). Estimate multiplicative seasonal case reductions $1 - \exp(\beta_j \Delta x_j)$ and annualised per-ward cases prevented, with deterministic block-bootstrap 95 % confidence intervals.
  2. **LightGBM partial dependence (PD) cross-check:** evaluate the locked production LightGBM model (`abhas-lgbm-1.1.2`) across historical ward-weeks while changing **only** the target ward trait (leaving all weather lags, density, and seasonality untouched), annualise the weekly mean reduction ($\times 52$), and attach bootstrap 95 % CIs. Report **both** GLM and LightGBM PD side by side so divergence between parametric log-linear and tree-based non-linear estimates is completely transparent.
- **Reference numbers (quick replay on the onsite dataset):**
  - `−0.1` `water_logging_risk_index` → **`8.3 %`** fewer cases/season,
  - `+0.1` `sanitation_score` → **`3.4 %`** fewer cases/season,
  - Top high-burden wards → approximately **`31–34` cases/yr** prevented for a `−0.2` `water_logging_risk_index` upgrade.
- **"Build vs send" comparison table.** Pair each ward's annualised drainage benefit (`−0.2` water-logging cases prevented/yr) against the ward's peak-season spraying crew ROI from the Phase 2 simulator (cases prevented per crew over $h = 2..4$, ADR-0013), reporting the equivalent annual crew-deployments (`drainage_cases_per_yr / sim_roi_cases_per_crew`) so planners can separate chronic structural drainage priorities ("build") from acute seasonal spray targets ("send").
- **Mandatory epistemic label.** Because ward traits are static in this dataset and the data are simulated (no real-world capital intervention labels), the API response, UI header, and any exported table MUST carry the exact label:
  > **"associations in simulated data, not causal real-world estimates"**
- **Offline serving.** Precompute the GLM fit, LightGBM PD sweep, bootstrap 95 % CIs, and build-vs-send join offline into a SHA-256-locked JSON artefact and serve it via a dedicated read-only vertical slice at `GET /api/v1/planning/structural?city=` with zero runtime fitting or network dependency.

**Rejected options.**
- *Framing estimates as causal real-world impact* — dishonest: static ward traits are collinear with unobserved ward confounders and the underlying dataset is simulated; real causal planning requires longitudinal DGHS surveillance and capital-project records.
- *Reporting only Poisson GLM or only LightGBM PD* — GLM assumes log-linearity while tree PD can jump sharply across split thresholds; showing both with 95 % CIs exposes model uncertainty immediately.
- *Running GLM + bootstrap on HTTP request* — violates latency budgets and wastes CPU on static historical traits; precomputed JSON responds in `< 5 ms` offline.

**Consequences.**
Abhas connects tactical monsoon response (spraying crews and supply allocation) with strategic multi-year drainage and sanitation investment priorities while staying strictly honest about what simulated observational data can and cannot prove.
