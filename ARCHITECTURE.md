# Abhas (আভাস) — Architecture Overview

Abhas is a production-grade dengue early-warning operations console built for Bangladesh municipal health officers. It translates multi-week monsoon rainfall surges into actionable, ward-level outbreak risk forecasts 1–4 weeks in advance across 60 wards in **Dhaka North (DNCC)**, **Dhaka South (DSCC)**, **Chattogram (CCC)**, **Gazipur (GCC)**, and **Narayanganj (NCC)**.

---

## 1. System Data Flow

<p align="center">
  <img src="docs/diagrams/data-flow.svg" alt="Abhas Animated Data Flow Diagram" width="100%" />
</p>

```mermaid
flowchart LR
    subgraph Ingestion ["1. Data Ingestion"]
        XLSX["Historical Dataset<br/>(2016–2025, 60 Wards)"]
        METEO["Open-Meteo API<br/>(5 City Centroids · 6h Cache)"]
    end

    subgraph FeaturePipeline ["2. Deterministic Feature Pipeline"]
        FEAT["app/shared/features.py<br/>• Rainfall Lags 0–8 (Peak r=0.47 @ Wk 3)<br/>• 4-Wk Rolling Rain / Temp / Humidity<br/>• Risk Indices & Cyclical ISO Week"]
    end

    subgraph RiskEngine ["3. Multi-Horizon Risk Engine"]
        LGBM["LightGBM Poisson Regressor<br/>(current.joblib · 954 KiB)<br/>• Horizons h=1..4<br/>• Monotonic Rainfall Constraints"]
        CALIB["Conformal 80% Intervals<br/>(NegBin Calibration on 2023)"]
        TIERS["Tiers & Endemic Channel<br/>(Low / Medium / High / Critical)"]
        SHAP["Explainability Engine<br/>(TreeSHAP Feature Drivers)"]
    end

    subgraph Serving ["4. Production API (FastAPI)"]
        API["FastAPI Modular Monolith (9 Slices)<br/>• Single-Flight Cold Lock<br/>• L1 LRU + SQLite WAL Cache<br/>• Sub-millisecond CPU Serving"]
    end

    subgraph Console ["5. Operations Console (Next.js 16)"]
        UI["Next.js 16 Console (11 Slices)<br/>• Full Bilingual EN / বাংলা UI<br/>• Live Open-Meteo Toggle · A4 · CSV<br/>• Grounded Abhas AI Assistant"]
    end

    XLSX --> FEAT
    METEO --> FEAT
    FEAT --> LGBM
    LGBM --> CALIB
    CALIB --> TIERS
    TIERS --> SHAP
    SHAP --> API
    API --> UI
```

---

## 2. Chronological Split Timeline

To eliminate temporal data leakage in time-series forecasting, the 10-year dataset is partitioned strictly by calendar year boundaries:

```text
[2016 — 2022: Training & Validation] ──► [2023: Calibration & Tuning] ──► [2024 — 2025: Locked Hold-Out]
 • Purged expanding-window CV (4 folds)    • Optuna Hyperparameter Search           • Strictly locked by SHA-256
 • Grouped ward_id lag engineering         • Conformal 80% coverage tuning (84.5%)  • Zero tuning or thresholding
 • Monotonic constraint specification      • Cost-weighted risk tiers (5x penalty)  • Scored ONCE at evaluation
 • Seasonal baseline benchmarking          • Endemic channel thresholding (Mean+2SD)• 11/11 AC-5 floors PASS (83.3%)
```

- **Training Folds (2016–2022):** 4 expanding-window folds with 8-week purging margins between train and test windows to prevent lag contamination.
- **Tuning & Calibration (2023):** Reserved exclusively for Optuna hyperparameter search, Negative Binomial dispersion estimation, conformal 80% interval calibration, and asymmetric cost tier cut-offs (penalizing a missed outbreak 5× more heavily than a false alarm).
- **Locked Hold-Out (2024–2025):** Locked by SHA-256 hash (`4ab5539f...714b`) and scored once — achieving an **83.33% golden pass rate** across 48 target slices, **11/11 quality floors**, and **-19.8% lower 3-week MAE** (1.01 vs 1.26 seasonal baseline).

---

## 3. Model Selection Rationale & Rejected Alternatives

| Candidate | Status | Outcome / Rationale |
|---|---|---|
| **LightGBM Poisson (Multi-Horizon)** | **Selected** | **Production choice.** Natural count-data likelihood with overdispersion; strict monotonic constraints enforce that higher rainfall never lowers predicted risk; 954 KiB artifact size; sub-millisecond CPU inference (`p95 = 0.591 ms/ward`). |
| **XGBoost CUDA Challenger** | Rejected | Tested on NVIDIA RTX 3060 CUDA: mean CV MAE `1.2050` vs LightGBM `1.2033` (`-0.14%` delta) — below the +3.0% threshold needed to justify heavier runtime dependencies. |
| **Negative Binomial / Poisson GLM** | Rejected | Log-linear link functions miss the non-linear inflection at lag 3 (the 21-day mosquito maturation and incubation cascade). |
| **Deep Learning (LSTM / TFT / Chronos)** | Rejected | Overfits on ~30k ward-week rows; requires >2 GB GPU runtime dependencies; non-deterministic training; slow cold-start latency. |
| **ARIMA / Prophet** | Rejected | Cannot share cross-ward vulnerability features or weather lag matrices; requires maintaining 240 separate models (60 wards × 4 horizons). |
| **RAG / Vector Databases** | Rejected | Epidemiological risk scoring requires deterministic tabular math and exact TreeSHAP attribution rather than stochastic text retrieval. |
| **SQLite WAL → PostgreSQL Port** | Architecture Port | SQLite WAL delivers zero-credential Stage 1 setup in < 30 seconds; SQLAlchemy 2.0 + Alembic ports allow zero-rewrite Stage 2 promotion to PostgreSQL/Neon. |

---

## 4. Hardware Optimization: GPU Training & CPU Serving

- **GPU Training (NVIDIA RTX 3060 12 GB):** Optuna tuning completed in **37.71 s** (139 MiB VRAM, 54.87 W peak). Standalone verifier (`ml/verify_artifact.py`) proves CPU inference matches within `±0.0000` MAE.
- **CPU Serving (Zero GPU Required):** `apps/api/ml/artifacts/current.joblib` (977,463 bytes) is loaded **once** into FastAPI lifespan state; single-ward inference executes in **0.591 ms (p95)**, and full 60-ward × 4-horizon citywide scoring completes in **< 35 ms** on a standard office laptop CPU.

---

## 5. Efficiency — Token Budget, Prompt Strategy, Caching & Latency

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MONTHLY OPERATIONAL COST                        │
│                                                                        │
│  • Compute (FastAPI + Next.js on office laptop / $5 VPS):        $0.00 │
│  • LightGBM CPU Inference (954 KiB artifact, loaded once):       $0.00 │
│  • Open-Meteo Weather API (1 batched 5-city call / 6h, 4/day):   $0.00 │
│  • Storage (Local SQLite WAL / PostgreSQL free tier):            $0.00 │
│  • Optional LLMs (Gemini 2.5 Flash chat + Haiku advisory, cap):  $0–$1 │
│                                                                        │
│  TOTAL ESTIMATED RUNNING COST:                       $0.00 — $5.00/mo  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Single-Flight Cold Lock & Two-Tier Cache:** Concurrent requests for the same `(origin_week, source, weather_hash)` coalesce on a per-key lock. Hot forecasts serve in `< 2 ms` from L1 LRU or L2 SQLite `predictions_cache`, while full cold 60-ward scoring completes in `< 35 ms` (`0.591 ms/ward p95` CPU). What-if counterfactual scenarios bypass persistent cache writes.
2. **Open-Meteo Call Minimization:** All 5 Bangladesh city centroids are fetched in **1 multi-location HTTP GET** (`past_days=92&forecast_days=16`, `Asia/Dhaka`), aggregated to full Mon–Sun ISO weeks, ERA5 bias-corrected, and cached in SQLite `weather_cache` for **6 hours** (**≤ 4 calls/day** out of Open-Meteo's 10,000/day free tier).
3. **Prompt Strategy & Token Budget Controls:**
   - **Officer Briefings (`advisory`):** Compact, structured JSON-context system prompt (separating untrusted user fields from verified forecast numbers), capped at **400 output tokens**, post-validated so every number matches the LightGBM output, cached by `(ward_id, origin_week, horizon, lang)`, and hard-capped at **$1.00/day** via SQLite `llm_traces`.
   - **Abhas AI Assistant (`chat`):** Google Gemini 2.5 Flash with `thinkingBudget: 0` (eliminating hidden reasoning token overhead), **512-token** output cap, compact live ward-context grounding, TTL response caching, and full `llm_traces` token/latency accounting.
4. **Frontend Load & Core Web Vitals Speed:** `WardRiskMap` defers ~1.6 MB of MapLibre GL + Web Worker behind `IntersectionObserver` on below-the-fold sections; 7 secondary `/dashboard` tabs and 2 dialogs are code-split via `next/dynamic`; `AbhasChatWidget` is deferred off initial hydration; and fonts/icons are 100% self-hosted with 1-year immutable caching.

---

## 6. Resilience — Network Errors, Rate Limits & Fault Isolation

| Failure Mode | Protection & Graceful Degradation |
|---|---|
| **Open-Meteo network error / timeout / 5xx** | Bounded connect/read timeouts (`5s` / `10s`), exponential backoff with jitter retries, circuit breaker, stale-cache fallback (`weather_cache`), and automatic historical **climatology fallback** — forecasts never crash when live weather is unreachable. |
| **LLM rate limits (`429`) or provider outage** | `gemini_chat.py` automatically fails over from `GEMINI_API_KEY` to `GEMINI_API_KEY_FALLBACK` on HTTP `429`; if both fail, timeout (`15s`/`20s`), or hit the `$1.00/day` SQLite budget cap, both `advisory` and `chat` transparently fall back to free, deterministic, forecast-grounded bilingual templates. |
| **API traffic spikes & abuse** | Per-IP sliding-window rate limiter (`120 req/min` general, `20 req/min` LLM endpoints) returning RFC 9457 `429 Too Many Requests` + `Retry-After` header; streaming **64 KiB** request body guard (`413`) aborts oversized payloads without RAM buffering. |
| **SSRF, injection & secret leakage** | `Settings` blocks loopback/private/metadata URLs outside `APP_ENV=test`; strict Pydantic `extra="forbid"`; regex log redaction strips API keys (`sk-ant-*`, `AIza*`, `AQ.*`); CSV exports neutralize spreadsheet formulas (`=`, `+`, `-`, `@`). |
| **Corrupted model artifact or unseeded DB** | Startup verifies `current.joblib` against its SHA-256 digest and confirms seeded SQLite observations; `/readyz` fails closed (`503`) if any check is unhealthy. |
| **Client WebGL / offline failures** | `WardRiskMap` falls back to `WardMapFallback` (interactive SVG) when WebGL is unavailable; React Query surfaces structured `ErrorBanner` recovery controls; default `WEATHER_MODE=dataset` runs 100% air-gapped. |

---

## 7. Deep-Dive Architecture Specifications

- [Animated System Design Diagram](docs/diagrams/system-design.svg) · [Animated Entity Relationship Diagram](docs/diagrams/erd.svg)
- [C4 Architecture Diagrams & Module Boundaries](docs/architecture.md)
- [ADR Index (ADR-0001 through ADR-0008)](docs/adr/0001-modular-monolith-slices.md)
- [System Design & Latency Budgets](docs/system-design.md)
- [AI Model Design & Model Card](docs/model-card.md) · [Threat Model](docs/threat-model.md)

---

## Phase 2 — Operational Command System (onsite final, `version-onsite-final`)

Phase 2 turns the forecast into decisions: how many saline bags, kits and beds each ward gets when stock is short,
where overflow patients go, which wards to spray, and the notice each officer receives. The architecture style is
unchanged (ADR-0001): one FastAPI modular monolith with vertical slices and ports & adapters. Five new API slices
(`allocation`, `overflow`, `simulator`, `dispatch`, `plans`) sit on four new pure modules in `shared/` (`supply`,
`optimizer`, `routing`, `intervention`); the web app gains one slice, `features/command/`, the 5-step Command Center.
Decisions: ADR-0009 to ADR-0016. Contract: `docs/contracts-phase2.md`. Maths with hand-solved examples:
`docs/algorithms-phase2.md`.

### Data flow
```mermaid
flowchart LR
  DS[(Onsite dataset<br/>2016–2025)] -->|verify constants, P95 2016–2022| FIT[ml/fit_supply.py<br/>supply constants + capacity JSON]
  DS --> FC[Forecast engine<br/>LightGBM Poisson h=1..4<br/>NegBin bands]
  FC -->|window means + NB size| SUP[Supply<br/>service-level quantile × ratio]
  FIT --> SUP
  SUP -->|planned demand d_i| ALLOC[Allocation<br/>weighted LP per city<br/>stock 30–100 %]
  SUP -->|planned beds| ROUTE[Overflow routing<br/>min-max utilisation LP<br/>+ min-transfer MILP]
  FIT -->|capacity_i| ROUTE
  FC -->|monotone rain features| SIM[Simulator<br/>counterfactual re-predict h=2..4]
  SIM -->|marginal cases prevented| ALLOC
  ALLOC --> DISP[Dispatch<br/>SMS · WhatsApp · HTML/PDF brief]
  ROUTE --> DISP
  SIM --> DISP
  ALLOC & ROUTE & SIM & DISP -->|inputs, outputs, git SHA| PLANS[(Plans<br/>decision log)]
  DISP --> EXP[/exports samples/]
```

### The maths, one paragraph per module
**Supply (ADR-0009).** In the onsite data each supply column is exactly `round(c × cases)`: c = 2.385 bags, 1.164 kits
and 0.298 beds per case reproduce all 31,320 rows. We plan to the newsvendor critical fractile, not the mean: window
cases follow a moment-matched negative binomial from the model's own per-horizon dispersion, we take P80 for saline
and kits and P90 for beds, then apply the same rounding rule.

**Allocation (ADR-0010, ADR-0011).** Each city is one stock pool, S = stock% × planned demand. Every ward first gets an
equity floor (20 % of demand); the rest maximises Σ wᵢxᵢ with weight = tier (1, 2, 4, 8) × density factor (density
over city median, clipped 0.5–2), solved by SciPy HiGHS and rounded by largest remainder so totals are exact. Any
unmet High/Critical ward, or any ward under 50 %, is a critical deficit. Crews go one at a time to the ward with the
largest marginal cases prevented; with diminishing returns this greedy rule is optimal.

**Overflow routing (ADR-0012).** Bed capacity is derived from history (max(1, ceil(1.10 × P95 weekly beds,
2016–2022)): 3–7 per ward, 284 in total; the dataset has no capacity column; approved by the human and overridable in
the UI). Inside each city only, a transportation LP minimises the
worst post-transfer utilisation; a second MILP keeps that optimum and uses the fewest transfers. The output shows net
deficit per ward, city utilisation before and after, remaining headroom and patients no city bed can absorb.

**Simulator (ADR-0013).** Crews shrink the treated ward's breeding-water signal: exactly the rain features the model
is constrained to be monotone in for each horizon, by E(c) = E_max(1 − e^(−kc)). The same LightGBM re-predicts weeks
2–4; the difference is cases prevented, converted to beds and saline with the ADR-0009 ratios. Because only monotone
inputs decrease, the counterfactual can never exceed the baseline. Efficacy is a stated assumption with low/base/high
presets shown as a band; wards rank by cases prevented per crew.

**Dispatch (ADR-0014).** Deterministic templates fill SMS (GSM-7 160/153 or UCS-2 70/67 for Bangla, with segment
count), WhatsApp text and an A4 HTML brief rendered to PDF by Playwright for `/exports`. Every number comes from one
facts object, and a test checks it.

### Offline design (ADR-0015)
`ABHAS_OFFLINE=1` is a kill switch; a background probe also detects loss of internet (never at startup, never on the
request path). Every external adapter has a 2 s connect timeout, a circuit breaker and a cache-then-climatology
fallback. All Phase 2 maths is pure NumPy/SciPy on local files. The web app self-hosts its images, falls back from
OpenStreetMap tiles to a bundled layer, and disables Clerk when offline or unconfigured. `npm run offline:check`
proves it: the API suite under a socket guard and Playwright with every non-localhost request aborted, across all five
modules. Every Phase 2 response says `offline: true|false`.

### Cost controls
Zero LLM calls on any core path: forecasting, allocation, routing, simulation and dispatch templates are local and
free. The optional advisory/assistant LLMs keep their Phase 1 caps and are off when offline. Forecasts are cached
(in-memory LRU + SQLite); counterfactuals are never cached into the forecast cache. Ratios and capacities are fitted
once offline and read at startup. Every run is saved as a plan with its git SHA and model version (ADR-0016), so any
number in a notice can be traced and compared.
