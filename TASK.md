# TASK.md — AI for Urban Dengue Outbreak (Preliminary Round, 24-hour remote qualifier)

> Every agent reads this file. Never retype the task in a prompt. Source files: `data/raw/`.

## Problem statement
Source: `data/raw/Hackathon_preli_nov21.pdf` (organisers' brief). Summary of the brief, in its own terms:

- Dengue outbreaks hit Dhaka and Chattogram every year; hospitals run out of beds, saline and test kits, and
  mosquito control (larvicide, spraying) starts after cases have already spiked.
- **Vector breeding clock:** rain does not cause cases the next day. Water trapped in drains and containers
  takes 7–14 days for *Aedes aegypti* to mature, then viral incubation and symptom onset follow — a
  **2-to-4-week lag** between rain and hospital spikes.
- **Hyper-local ward vulnerability:** the same rain hits wards differently. Drainage bottlenecks
  (`water_logging_risk_index`), crowding (`population_density_sqkm`) and weak waste collection
  (`sanitation_score`) make some wards hotspots far faster than their neighbours.
- **Goal:** a working software prototype that uses weather data to predict local dengue outbreak risk, giving
  public health officers a **2-to-4-week early-warning window** to target high-risk wards before the peak.
- Treat the 24-hour build as **Stage 1 of a real production system**: top teams bring this exact codebase to
  the onsite final sprint and expand the prediction engine into a live system.

### Core requirements (from the brief)
1. **Weather data processing** — ingest temperature, humidity and rainfall; compute multi-week rainfall lags
   that match mosquito breeding cycles.
2. **Risk prediction engine** — take weather inputs and produce risk scores or categories (Low, Medium, High,
   Critical) for a selected area and time window.
3. **Cost and resource efficiency** — run efficiently, minimise unnecessary API calls, keep processing costs
   reasonable for public health offices.
4. **User interface** — show predictions and the main weather drivers clearly in a working web dashboard.

## Judging criteria (100 points + up to 5 bonus)
| # | Criterion | Deliverable / requirement | Pts | Full marks when |
|---|---|---|---|---|
| 1 | Reproducible local setup | Public GitHub repo, valid dependency file (requirements.txt, environment.yml or package.json), README commands that launch the app locally in ≤ 3 minutes | 10 | Clones and launches cleanly in ≤ 3 min (5 = needs a minor env/path fix; 0 = fails) |
| 2 | Multi-week weather lag pipeline | Programmatically ingests `avg_temp_C`, `rainfall_mm`, `relative_humidity_pct`; computes grouped multi-week rainfall lags **per `ward_id`** | 15 | Verified multi-week ward-level lag features (8 = raw columns without lags; 0 = static/hardcoded) |
| 3 | Dengue risk prediction engine | Trained ML or statistical model dynamically generates predictions and tiers (Low/Medium/High/Critical) for selected wards and time windows | 15 | Dynamic model inference + clear tiers (8 = threshold rules without ML; 0 = mocked) |
| 4 | Interactive user interface | Working web dashboard (Streamlit, Gradio, React, Flask/FastAPI) | 10 | Intuitive inputs + clear driver breakdown (5 = no driver insights) |
| 5 | Architecture design | Root `ARCHITECTURE.md` (1–2 pages): data-flow diagram, chronological validation split, model selection rationale | 10 | Complete diagram + justified model and split |
| 6 | Compute & API cost efficiency | Fast local inference from a serialized model (joblib/pickle) + documented API-call minimisation and LLM token/cost controls in ARCHITECTURE.md | 10 | Fast execution + concrete caching/cost controls (5 = general mention) |
| 7 | 3-minute uncut video demo | Uncut screen recording ≤ 3:00, live on localhost or a deployed URL, voiceover explaining inputs and predictions, **no slides** | 20 | Uncut ≤ 3:00 live walkthrough with clear audio (10 = jump cuts or unclear) |
| 8 | Git history & AI disclosure | Active, distributed commits by **all team members** over the 24 hours + explicit list of all AI assistants and external APIs in README | 10 | Distributed commits + complete disclosure (0 = one bulk commit or no disclosure) |
| + | Bonus (≤ 5, only if all core requirements work) | Domain-relevant extensions, e.g. interactive ward-level risk heatmap, multi-week forecast confidence intervals, chronological validation error dashboard (MAE/RMSE). Cosmetic UI does not count | +5 | — |

## Must use / constraints
- Inputs named in the rubric: `avg_temp_c` (rubric writes `avg_temp_C`), `rainfall_mm`, `relative_humidity_pct`,
  lags grouped by `ward_id`.
- A trained model, serialized with joblib, loaded once; no mocked or hardcoded outputs.
- Tiers exactly: Low, Medium, High, Critical.
- Root `ARCHITECTURE.md`, 1–2 pages. README lists every AI assistant and external API.
- App must run from a fresh clone in ≤ 3 minutes with the README commands, on someone else's machine
  (assume Windows or macOS, Python 3.12, Node 22).
- Video: one uncut take, ≤ 3:00, live app, voiceover, no slides.

## Provided resources
- `data/raw/hackathon_preli_dataset.xlsx` — sheet `bangladesh_dengue_large_dataset`,
  SHA-256 `3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405`
  (same data as the organisers' Google Sheet). Read-only; never edit it.
- `data/raw/Hackathon_preli_nov21.pdf` — the brief.
- `docs/brand/` — the Abhas brand kit (from `abhas-brand-kit.zip`: BRAND.md, tokens.json, logo SVGs, ribbon art). Source of
  truth for the look; guideline: https://claude.ai/artifact/BkdcU9NNJwJkViHNa5pcb9

### Measured facts about the dataset (LEAD's data spike, 2026-11-21 — re-verify in `docs/data-pipeline.md`)
- 31,320 rows = 60 wards × 522 weeks, weekly on Mondays, 2016-01-04 → 2025-12-29. No nulls, no duplicate
  ward-weeks, no gaps. Cities: Dhaka North 20 wards, Dhaka South 20, Chattogram 10, Gazipur 5, Narayanganj 5.
- Columns: `date, city, ward_id, population_density_sqkm, water_logging_risk_index, sanitation_score,
  avg_temp_c, max_temp_c, min_temp_c, rainfall_mm, relative_humidity_pct, dengue_cases`.
  Static ward features are constant per ward. Weather differs per ward within a city.
- `dengue_cases`: 58 % zeros, mean 2.64, max 41; season June–September (monthly mean peaks in August at 9.5).
  Rain is monsoon June–September (~94 mm/week).
- **The lag is visible in the data:** after removing each ward's week-of-year seasonality, the correlation of
  cases with rainfall k weeks earlier is 0.03 (k=0), 0.07 (1), 0.23 (2), **0.47 (3)**, 0.33 (4), ~0 (≥5).
  Temperature and humidity anomalies show no lagged signal; they act through season only.
- Ward means of cases correlate with water-logging (+0.82), density (+0.57) and sanitation (−0.40).
- Baseline backtest (train ≤ 2023, test 2024–2025, sklearn Poisson gradient boosting, weather + static +
  season features): MAE 1.02 at h = 2–3 weeks and 1.17 at h = 4, against 1.24 for ward × week-of-year
  climatology, 1.69 for seasonal naive and 1.26 with weather removed. With two weeks of forecast rain, h = 4
  falls to 1.00. Adding past case counts did not help (1.02 vs 1.02).
- The wards with the most cases are mostly predictable from static vulnerability alone (top-15 overlap over a
  2–4-week window: model 0.60, climatology 0.58). The weather model's value is **timing and size** of each
  ward's surge.
- The data looks simulated (very regular; ward counts don't match the real city corporations). Say so in the
  model card; do not claim real-world validity.

## Deliverables
- Public GitHub repo: `https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon` (remote `origin`).
- README.md (run in ≤ 3 min, AI and API disclosure), ARCHITECTURE.md (1–2 pages), working dashboard.
- 3-minute uncut video, recorded by the human from `docs/demo.md`.
- Submission link (from the organisers).

## Deadline
Round: 2026-11-21 14:00 → **2026-11-22 14:00 Asia/Dhaka (BST)**. LEAD plans backwards: feature freeze
08:00, video recorded by 11:30, submitted by 13:00, one hour of buffer.

## Our preferences
- Stack: Python 3.12 + FastAPI + LightGBM (API and model) · Next.js + TypeScript + Tailwind + shadcn/ui (web)
  · SQLite through SQLAlchemy + Alembic (Postgres-compatible for the final sprint). No Neon, no server DB.
- Deploy: not required (localhost demo). Vercel only if all MUSTs pass and the human approves.
- Git: small commits; push after every green merge (standing approval for `https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon` only; never
  force-push). Every human team member commits under their own name during the 24 hours.
- Claude Pro → at most one Claude worker besides LEAD.
- Product name: **Abhas** (আভাস, "an early sign") — dengue early warning, ward by ward.
- Gates not applicable or re-targeted: see the kickoff prompt §5.
