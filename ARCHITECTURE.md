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
