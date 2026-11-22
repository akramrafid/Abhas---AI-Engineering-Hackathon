# Abhas (আভাস) — User Flow

_Role 2 · UX Designer (`ui-dashboard`) · Aligned with `docs/PRD.md` (Golden path, FR-1..FR-9, AC-1, AC-6, AC-7, AC-8, AC-11, AC-13, AC-14, AC-16, NFR-6)_

## Primary Personas & Tasks
1. **Ward Health Officer (DNCC / DSCC / CCC)** — Opens Abhas weekly (or `/?demo=1` in offline briefing mode) to identify which wards enter High or Critical dengue risk over the next 2–4 weeks, inspect the top weather and drainage drivers, verify the 3-week rainfall lag signal, run a 120 mm monsoon what-if scenario, and scan the city heatmap.
2. **City Epidemiologist** — Opens the Validation tab to verify chronological hold-out MAE/RMSE against climatology and baselines, 80% prediction interval coverage, tier confusion matrix, and live `/api/v1/ops` inference/cost telemetry.

## End-to-End User Flow & Error Recovery

```mermaid
flowchart TD
    Start([Officer or Epidemiologist opens / or /?demo=1]) --> DemoCheck{Query params?}
    DemoCheck -->|?demo=1| PreloadDemo[Preselect Dhaka South, pinned monsoon origin week,<br/>pinned Critical ward, 2-4w window, offline dataset mode]
    DemoCheck -->|?ward=ID| CheckWard{Ward exists in<br/>GET /api/v1/wards?}
    DemoCheck -->|default /| LoadWards[Load ward list GET /api/v1/wards<br/>Default Dhaka South + latest valid Monday]

    CheckWard -->|No / 404 unknown-ward| NotFound[Show 'Ward not found' state<br/>Clear tier card + 'Reset to Dhaka South' CTA]
    NotFound -->|Click Reset| LoadWards
    CheckWard -->|Yes| SyncWard[Select ward & its city]

    LoadWards --> WardsOk{API reachable?}
    PreloadDemo --> WardsOk
    SyncWard --> WardsOk

    WardsOk -->|5xx / Network Error| ApiDown[Show ErrorBanner with request_id + Retry<br/>Clear any stale tier card]
    ApiDown -->|Click Retry| LoadWards

    WardsOk -->|200 OK| ForecastTab[Screen 1: Ward Forecast<br/>POST /api/v1/forecast for city wards]
    ForecastTab --> FcOk{Forecast 200?}
    FcOk -->|5xx / Timeout| FcErr[Hide stale tier card<br/>Show Forecast ErrorBanner + Retry]
    FcErr -->|Click Retry| ForecastTab
    FcOk -->|200 OK| ViewForecast[Inspect Peak Tier Card EN/BN + 1-4 meter,<br/>80% band chart, per-horizon rows, top 4 drivers]

    ViewForecast -->|Pick another ward or week/window| ForecastTab
    ViewForecast -->|Open Lags tab| LagsTab[Screen 2: Lags Panel<br/>GET /api/v1/wards/id/lags]
    ViewForecast -->|Open Scenario tab| ScenarioTab[Screen 3: What-If Scenario<br/>POST /api/v1/scenario]
    ViewForecast -->|Open City Heatmap tab| HeatmapTab[Screen 4: City Heatmap<br/>GET /api/v1/heatmap]
    ViewForecast -->|Open Priority List tab| PriorityTab[Screen 5: Priority List & CSV / Print<br/>POST /api/v1/forecast]
    ViewForecast -->|Open Validation tab| ValidationTab[Screen 6: Validation & Timeline<br/>GET /api/v1/validation + /api/v1/ops]
    ViewForecast -->|Open About & Cost tab| AboutTab[Screen 7: About, Ops Cost & Model Card<br/>GET /api/v1/ops]
    ViewForecast -->|Toggle EN/BN| LangSync[Update ?lang=en|bn & Officer Brief POST /api/v1/advisory]
    ViewForecast -->|Open /brand link| BrandPage[Brand Kit Showcase /brand]

    LagsTab --> LagsOk{Lags 200?}
    LagsOk -->|Error| LagsErr[ErrorBanner + Retry]
    LagsErr -->|Retry| LagsTab
    LagsOk -->|200 OK| ShiftLag[Slide lag k = 0..8 weeks<br/>Observe rainfall shifted k weeks over cases + lag-3 peak]

    ScenarioTab --> ScInput[Enter or slide rainfall 0-500 mm<br/>or click 120 mm preset]
    ScInput --> ScValid{0 <= rain <= 500?}
    ScValid -->|No| ScClientErr[Show inline validation message<br/>Block invalid submission]
    ScClientErr --> ScInput
    ScValid -->|Yes| ScRun[POST /api/v1/scenario]
    ScRun --> ScOk{200 OK?}
    ScOk -->|422 / 5xx| ScApiErr[Show RFC 9457 Problem errors + Retry]
    ScApiErr -->|Retry or adjust| ScInput
    ScOk -->|200 OK| ScCompare[Compare Baseline vs Scenario expected cases,<br/>80% band, and tier shift]

    HeatmapTab --> HmOk{Heatmap 200?}
    HmOk -->|Error| HmErr[ErrorBanner + Retry]
    HmErr -->|Retry| HeatmapTab
    HmOk -->|200 OK| HmView[Scan Ward x Horizon Matrix &<br/>Schematic Ward Tile Grid]
    HmView -->|Click any ward row or tile| ForecastTab

    ValidationTab --> ValOk{Validation 200?}
    ValOk -->|Error| ValErr[ErrorBanner + Retry]
    ValErr -->|Retry| ValidationTab
    ValOk -->|200 OK| ValView[Review MAE/RMSE vs Baselines, 80% Coverage,<br/>Confusion Matrix & /api/v1/ops Cost Telemetry]
```

## Key UX Guardrails
- **No stale risk tier on error (AC-8):** Whenever `GET /api/v1/wards` or `POST /api/v1/forecast` fails, any previously rendered tier card is immediately unmounted so officers never mistake an outdated risk level for the current query.
- **Colour-vision safety (NFR-6, AC-16):** Every risk tier renders its English label, Bangla label (`নিম্ন`, `মাঝারি`, `উচ্চ`, `সংকটপূর্ণ`), and a 1–4 bar meter alongside the light-to-dark risk ramp. Lime (`--color-lime`) appears only in the dark Ink header logo and never inside data views.
- **Honest map & model disclaimers (AC-12, AC-13):** The schematic tile map always carries the label `schematic, ward geometry not in the dataset`, and Validation includes the simulated-dataset model card notice.
