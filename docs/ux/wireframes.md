# Abhas (আভাস) — Screen Wireframes, Copy & Test ID Contract

_Role 2 · UX Designer (`ui-dashboard`) · Contract shared between UX, Frontend (`apps/web`), and QA (`apps/web/e2e`)_

All colours use generated CSS tokens from `docs/brand/tokens.json` (`apps/web/src/styles/tokens.css`). Lime (`--color-lime`) is restricted strictly to the dark Ink header logo and never appears inside `[data-view="data"]`. All numeric figures use `IBM Plex Mono` with tabular numerals (`tnum`).

---

## Global Header & Controls (persistent across Screens 1–4)

```
+======================================================================================+
| [Drop Mark] ABHAS আভাস · Dhaka South    [Dataset mode] [Demo mode]   [Brand System]  |
+======================================================================================+
| [Ward Forecast] | [Lags] | [Scenario] | [City Heatmap] | [Validation]                |
+--------------------------------------------------------------------------------------+
| City: [Dhaka South v]  Ward: [DSCC_Ward_19 v]  Origin (Mon): [2025-06-09 v]         |
| Window: ( 1-4w | [2-4w] )                                                            |
+--------------------------------------------------------------------------------------+
```

Global test IDs:
- `demo-mode-badge`: visible when loaded with `/?demo=1`
- `weather-source-badge`: shows active weather source (`Dataset mode`, `Live · city centroid`, `Cached weather`, or `Climatology fallback`)
- `nav-brand-link`: link to `/brand`
- `tab-ward-risk`, `tab-lags`, `tab-scenario`, `tab-heatmap`, `tab-validation`: top tab buttons (`role="tab"`)
- `city-select`, `ward-select`, `origin-week-select`: labelled `<select>` controls
- `window-toggle`, `window-1-4w`, `window-2-4w`: forecast window buttons
- `ward-not-found`, `ward-not-found-reset`: rendered when `?ward=<id>` is unknown or API returns 404 `/unknown-ward`
- `wards-error-banner`, `retry-button`: rendered when initial ward list fetch fails

---

### Screen: Dashboard (Ward Risk & Drivers)
Purpose: Give a ward health officer the 2–4-week risk tier, 80% case band, and top 4 drivers for a selected ward in under one minute · Entry: `/` or `/?demo=1` or `/?ward=<id>` · Exit: Lags, Scenario, City Heatmap, Validation tabs, or `/brand`.

```
+--------------------------------------------------------------------------------------+
| City Priority List (20 wards)  |  DSCC_Ward_19 · Dhaka South · Origin 2025-06-09    |
|--------------------------------|  [==== Critical / সংকটপূর্ণ]  Risk Score: 92 / 100 |
| > DSCC_Ward_19  18.0  [Crit]   |  Deploy teams now; ready beds and saline.           |
|   DSCC_Ward_04  16.2  [Crit]   |  Peak expected: 18.0 cases (80% band 11.4 - 26.2)   |
|   DSCC_Ward_13  14.8  [Crit]   |  Water-logging 0.84 · Density 54k/km2 · Sanit 0.41  |
|   DSCC_Ward_12  12.1  [High]   |-----------------------------------------------------|
|   DSCC_Ward_02  10.4  [High]   |  Forecast Trajectory (Expected Cases & 80% Band)    |
|   ...                          |  [ Recharts ComposedChart: Royal line + 15% band ]  |
|                                |-----------------------------------------------------|
|                                |  Per-Horizon Outlook          | Top 4 Drivers (h+3) |
|                                |  +2w 2025-06-23  18.0 [Crit]  | Rain 2-4w ago  +60% |
|                                |  +3w 2025-06-30  15.0 [Crit]  | Water-logging  +35% |
|                                |  +4w 2025-07-07  12.0 [High]  | Season         +18% |
|                                |                               | Sanitation      -8% |
+--------------------------------------------------------------------------------------+
```

Components & test IDs:
- `ward-priority-list`, `ward-row-<ward_id>`
- `peak-tier-card`, `peak-tier-badge`, `peak-risk-score`, `peak-expected-cases`
- `forecast-chart`
- `horizon-table`, `horizon-row-<h>` (e.g. `horizon-row-1`, `horizon-row-2`, `horizon-row-3`, `horizon-row-4`)
- `drivers-panel`, `driver-row-<key>`
- `forecast-error-banner`, `forecast-retry`
- `ward-not-found`, `ward-not-found-reset`

States:
- **Empty**: When no wards are returned for the selected city or no ward is selected, displays `"No forecast available for this selection. Choose a city and ward above to load the 2–4-week outlook."` with a `"Load Dhaka South demo week"` primary action button (`ward-empty-state`).
- **Loading**: Calm static skeleton cards (`ward-forecast-loading`) matching the priority list, peak tier card, chart, and drivers layout with `aria-busy="true"` and screen-reader text `"Loading ward forecast…"`.
- **Error**: Unmounts `peak-tier-card` completely so no stale risk tier appears. Renders `forecast-error-banner` (`role="alert"`) stating `"Could not load ward forecast. Check that the local API is running, then try again."`, plus RFC 9457 detail and `Request ID`, and a `Retry` button (`forecast-retry`). When `?ward=` is unknown or API returns 404 `/unknown-ward`, displays `"Ward not found"` (`ward-not-found`) naming the ward ID with a `"Select Dhaka South default ward"` button (`ward-not-found-reset`).
- **Success**: Renders the city ward priority list sorted by peak risk, peak-window tier card with EN/BN badge (`Low / নিম্ন`, `Medium / মাঝারি`, `High / উচ্চ`, `Critical / সংকটপূর্ণ`) + 1–4 bar meter + action, risk score 0–100, forecast chart with 80% prediction band (`var(--color-forecast-band)`), per-horizon rows, and top 4 drivers with sign and percentage effect.

A11y: All pickers have explicit `<label htmlFor>` elements; error banner uses `role="alert"`; peak-tier card announces updates in an `aria-live="polite"` region; risk tiers carry `role="img"` 1–4 meters and text labels for colour-vision deficiency; responsive single-column stack at 375 px.

---

### Screen: Lags Panel
Purpose: Show deseasonalized rainfall-to-case lag evidence (0–8 weeks) and let officers shift observed rainfall forward by `k` weeks to visually align monsoon rain with the 3-week dengue surge · Entry: `Lags` tab (`tab-lags`) · Exit: Any other tab.

```
+--------------------------------------------------------------------------------------+
| Rainfall Lag Evidence — DSCC_Ward_19 (Dhaka South)                                   |
|--------------------------------------------------------------------------------------|
| Shift rainfall forward:  [0w][1w][2w][[3w]][4w][5w][6w][7w][8w]  Slider: ===o=====  |
| Summary: Rainfall shifted +3 weeks (rain from 2025-12-08 aligns with cases 2025-12-29)|
| Dataset peak: Lag 3 weeks (r = 0.47) · Ward peak: Lag 3 weeks · At k=3: r = 0.47     |
|--------------------------------------------------------------------------------------|
| Weekly Rainfall (shifted +3w, mm) vs Dengue Cases                                    |
| [ Recharts ComposedChart: Royal rain bars (left axis) + Navy cases line (right axis)]|
|--------------------------------------------------------------------------------------|
| Deseasonalized Pearson Correlation by Lag (0–8 weeks)                                |
| [ Recharts BarChart: Ward r vs Dataset r across lags 0..8, lag 3 highlighted Royal ] |
+--------------------------------------------------------------------------------------+
```

Components & test IDs:
- `lags-panel`
- `lag-slider` (range input `0–8`), `lag-btn-0` .. `lag-btn-8`
- `lag-shift-summary`, `lag-shifted-sample`
- `lags-peak-dataset`, `lags-peak-ward`, `lags-selected-corr`
- `lags-series-chart`, `lags-corr-chart`
- `lags-error-banner`, `lags-retry`

States:
- **Empty**: If the ward returns zero weekly series rows, displays `"No weekly weather and case observations found for this ward."` with a `"Switch to another ward"` note (`lags-empty-state`).
- **Loading**: Static skeletons (`lags-loading`) for controls, series chart, and correlation chart with `"Loading rainfall lag history…"`.
- **Error**: Renders `lags-error-banner` (`role="alert"`) with `"Could not load rainfall lag analysis for this ward."`, `Request ID`, and `Retry` button (`lags-retry`), or `"Ward not found"` if 404 `/unknown-ward`.
- **Success**: Interactive lag slider (`0–8`) and buttons immediately shift the rainfall series by `k` weeks without refetching; summary readout states the exact source-rain week aligned to the latest case week; correlation bar chart highlights the dataset lag-3 peak.

A11y: Slider has `<label htmlFor="lag-shift-slider">Rainfall lag shift (weeks)</label>` and `aria-valuetext="+k weeks"`; discrete lag buttons expose `aria-pressed`; both charts provide accessible descriptions and numeric summary readouts.

---

### Screen: What-If Scenario
Purpose: Let an officer perturb this week's rainfall (`0–500 mm`, plus optional temperature/humidity) and see the resulting 2–4-week forecast cases, 80% band, and tier change side by side · Entry: `Scenario` tab (`tab-scenario`) · Exit: Any other tab.

```
+--------------------------------------------------------------------------------------+
| What-If Weather Scenario — DSCC_Ward_19 · Origin week 2025-06-09                     |
|--------------------------------------------------------------------------------------|
| Origin-week rainfall (mm): [ 120 ]  Slider: ====o================= (0 – 500 mm)      |
| Presets: [0 mm Dry] [60 mm Moderate] [120 mm Heavy rain] [250 mm Extreme] [Run]      |
| Optional overrides: Temp (5–45 C) [   ] · Humidity (0–100%) [   ]                    |
|--------------------------------------------------------------------------------------|
| Baseline (Observed)                 |  Scenario (120 mm rainfall override)           |
| [=== Medium / মাঝারি]               |  [==== High / উচ্চ]   Tier shift: Medium->High |
| h+3 expected: 6.2 (band 3.1 - 9.9)  |  h+3 expected: 9.8 (band 5.4 - 15.1)  +3.6    |
|--------------------------------------------------------------------------------------|
| [ Recharts ComposedChart: Dashed Slate baseline vs Solid Royal scenario + 80% band ] |
| [ Horizon Comparison Table: +1w..+4w Baseline vs Scenario + Delta + Tier badges ]    |
+--------------------------------------------------------------------------------------+
```

Components & test IDs:
- `scenario-panel`
- `scenario-rain-slider`, `scenario-rain-input`
- `scenario-preset-0`, `scenario-preset-60`, `scenario-preset-120`, `scenario-preset-250`
- `scenario-temp-input`, `scenario-humidity-input`
- `scenario-submit`
- `scenario-validation-error`, `scenario-error-banner`, `scenario-retry`
- `scenario-empty-state`
- `scenario-comparison`, `scenario-baseline-card`, `scenario-result-card`, `scenario-baseline-h3`, `scenario-result-h3`, `scenario-tier-change`
- `scenario-chart`, `scenario-table`

States:
- **Empty**: Before a scenario value is applied (or if cleared), renders `scenario-empty-state`: `"Enter a rainfall value between 0 and 500 mm or choose a monsoon preset to compare baseline and what-if risk."` with a primary `"Test 120 mm heavy rain"` button.
- **Loading**: Disables submit while running (`aria-busy="true"`), displays calm skeleton comparison cards (`scenario-loading`) with `"Computing scenario forecast…"`.
- **Error**: Client validation rejects rainfall `< 0` or `> 500` (and invalid temp/humidity) inline via `scenario-validation-error` (`role="alert"`, `"Rainfall must be between 0 and 500 mm."`). API 422 `problem+json` or 5xx errors render `scenario-error-banner` listing field errors, `Request ID`, and `Retry` (`scenario-retry`).
- **Success**: Side-by-side baseline vs scenario tier cards (`RiskTierBadge` EN/BN + meter), h+3 expected cases and delta, Recharts comparison trajectory with 80% band, and per-horizon comparison table.

A11y: Numeric input and range slider share clear labels and describe the valid `0–500 mm` range via `aria-describedby`; validation errors link via `aria-invalid` and `role="alert"`; results announce updates via `aria-live="polite"`.

---

### Screen: City Heatmap
Purpose: Show every ward in the selected city across forecast horizons `+1w` to `+4w` in both a tabular risk matrix and a clearly labelled schematic tile grid · Entry: `City Heatmap` tab (`tab-heatmap`) · Exit: Click any ward to inspect its detailed forecast on Screen 1.

```
+--------------------------------------------------------------------------------------+
| City Risk Heatmap — Dhaka South · Origin 2025-06-09                                  |
| Critical: 4 · High: 6 · Medium: 5 · Low: 5                                           |
|--------------------------------------------------------------------------------------|
| Ward x Horizon Risk Matrix (sorted by peak risk)                                     |
| Ward          | +1w 06-16       | +2w 06-23       | +3w 06-30       | +4w 07-07      |
| DSCC_Ward_19  | [High 9.1]      | [Crit 18.0]     | [Crit 15.0]     | [High 12.0]    |
| DSCC_Ward_04  | [High 8.4]      | [Crit 16.2]     | [Crit 14.1]     | [High 10.8]    |
|--------------------------------------------------------------------------------------|
| Schematic Ward Tile Map — schematic, ward geometry not in the dataset                |
| Horizon: [Peak] [+1w] [+2w] [+3w] [+4w]                                              |
| +---------------+ +---------------+ +---------------+ +---------------+              |
| | DSCC_Ward_19  | | DSCC_Ward_04  | | DSCC_Ward_13  | | DSCC_Ward_12  |              |
| | [Crit / সংকট] | | [Crit / সংকট] | | [Crit / সংকট] | | [High / উচ্চ] |              |
| | 18.0 cases    | | 16.2 cases    | | 14.8 cases    | | 12.1 cases    |              |
| +---------------+ +---------------+ +---------------+ +---------------+              |
+--------------------------------------------------------------------------------------+
```

Components & test IDs:
- `heatmap-panel`, `heatmap-summary`
- `heatmap-matrix`, `heatmap-cell-<ward_id>-<h>`
- `heatmap-tile-map`, `heatmap-schematic-label`, `heatmap-tile-<ward_id>`
- `heatmap-horizon-peak`, `heatmap-horizon-1` .. `heatmap-horizon-4`
- `heatmap-error-banner`, `heatmap-retry`

States:
- **Empty**: If `ward_ids` or `cells` is empty, renders `heatmap-empty-state` (`"No city heatmap cells returned for this city and origin week."`) with a `"Reset to Dhaka South"` button.
- **Loading**: Static matrix + tile grid skeleton (`heatmap-loading`) with `"Loading city risk heatmap…"`.
- **Error**: Renders `heatmap-error-banner` (`role="alert"`) with `"Could not load city heatmap."`, `Request ID`, and `Retry` (`heatmap-retry`).
- **Success**: Full ward × horizon matrix using `RiskTierBadge` tokens + clickable rows, followed by the schematic ward tile grid explicitly carrying `"schematic, ward geometry not in the dataset"` (`heatmap-schematic-label`).

A11y: Matrix uses semantic `<table>`, `<thead>`, `<th scope="col">`, `<th scope="row">`; every cell and tile carries text tier label (EN/BN) + 1–4 meter rather than relying on fill colour alone; tiles are `<button>` elements with descriptive `aria-label` to jump into Ward Forecast.

---

### Screen: Validation Tab
Purpose: Let a city epidemiologist inspect chronological backtest error (MAE/RMSE) against baselines, 80% interval coverage, the 4×4 tier confusion matrix, and live `/api/v1/ops` cost and caching telemetry · Entry: `Validation` tab (`tab-validation`) · Exit: Any other tab or `/brand`.

```
+--------------------------------------------------------------------------------------+
| Chronological Backtest & Operations Telemetry                                        |
| Split: Expanding folds 2019-2022; tune 2023; locked hold-out 2024-2025 · v1.0        |
|--------------------------------------------------------------------------------------|
| Period: [holdout_2024_2025] [tune_2023] [All]   Metric: [MAE] [RMSE] [Deviance]      |
| [ Recharts BarChart: LightGBM vs Climatology, Seasonal Naive, No-Weather, NegBin ]   |
| [ Backtest Metrics Table: Model | Period | Horizon | MAE | RMSE | Deviance | N ]     |
|--------------------------------------------------------------------------------------|
| 80% Interval Coverage (target 75%-90%)   |  Tier Confusion Matrix (Actual x Pred)    |
| h+1: 81.2% · h+2: 80.5% · h+3: 82.0%     |  Within-1-tier: 97% · Crit recall: 91%    |
|--------------------------------------------------------------------------------------|
| Operations & Cost Efficiency (/api/v1/ops)                                           |
| Model loads: 1 · Cache hit rate: 84% · Inference p95: 18 ms · Est. cost: $0.00/mo    |
| Model card note: Dataset appears simulated; not validated on DGHS surveillance.      |
+--------------------------------------------------------------------------------------+
```

Components & test IDs:
- `validation-panel`, `validation-split-summary`
- `validation-metrics-chart`, `validation-metrics-table`
- `validation-coverage`, `validation-confusion`
- `validation-ops-card`, `validation-ops-model-loads`, `validation-ops-cache-rate`
- `validation-error-banner`, `validation-retry`

States:
- **Empty**: If `metrics` array is empty, renders `validation-empty-state` (`"No stored backtest results found. Run npm run eval to generate hold-out metrics."`).
- **Loading**: Static skeletons (`validation-loading`) for chart, tables, confusion matrix, and ops card with `"Loading validation metrics…"`.
- **Error**: Renders `validation-error-banner` (`role="alert"`) with `"Could not load validation backtest results."`, `Request ID`, and `Retry` (`validation-retry`). If `/api/v1/ops` fails independently (e.g. HTTP 401 when `OPS_TOKEN` is set), the ops card displays a self-contained fallback notice without blocking the validation metrics.
- **Success**: Renders period/metric filters, baseline comparison bar chart, full tabular metrics, 80% band coverage cards, 4×4 tier confusion matrix with recall/accuracy KPIs, live `/api/v1/ops` telemetry card, and the simulated-dataset model card notice.

A11y: All tables use semantic headers and right-aligned tabular numerals (`font-mono tnum`); filter controls use `aria-pressed`; confusion matrix explicitly labels row axis (`Actual tier`) and column axis (`Predicted tier`).
