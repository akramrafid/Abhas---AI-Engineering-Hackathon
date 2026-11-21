# Data Pipeline — Abhas (আভাস)

_Owner: DATA (Role 6 — Data Engineer) · Updated: 2026-11-21_

This document records the verified measurements of the organisers' dataset, the idempotent bulk ingestion pipeline, the single canonical lag/feature builder (`apps/api/app/shared/features.py`), deseasonalized rainfall–case lag verification, and the Open-Meteo live weather adapter + historical archive bias check (AC-1, AC-2, AC-15).

## 1. Source Dataset Profile (Verified)

- **File:** `data/raw/hackathon_preli_dataset.xlsx` (read-only, never modified)
- **Sheet:** `bangladesh_dengue_large_dataset`
- **SHA-256 (verified on every seed):** `3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405`
- **Dimensions:** `31,320` rows × `12` columns = `60` wards × `522` consecutive ISO weeks
- **Date range:** `2016-01-04` to `2025-12-29` (100% Mondays; `weekday == 0` on all 31,320 rows; 0 missing weeks; 0 duplicate `(ward_id, week)` pairs; 60 rows fall in ISO week 53 on `2020-12-28`)
- **Nulls & PII:** `0` nulls across all 12 columns; `0` PII fields (aggregate ward-level environmental and case counts only)

### City & Ward Breakdown

| City | Prefix | Wards | Weeks / Ward | Total Rows |
|---|---|---:|---:|---:|
| Dhaka North | `DNCC` | 20 | 522 | 10,440 |
| Dhaka South | `DSCC` | 20 | 522 | 10,440 |
| Chattogram | `CCC` | 10 | 522 | 5,220 |
| Gazipur | `GCC` | 5 | 522 | 2,610 |
| Narayanganj | `NCC` | 5 | 522 | 2,610 |
| **Total** | — | **60** | **522** | **31,320** |

### Measured Feature Distributions & Signal

- **Static ward vulnerability factors** (verified 100% constant within each `ward_id`, and strongly correlated with each ward's 10-year mean weekly cases):
  - `water_logging_risk_index`: range `0.22 – 0.94`, ward-mean case correlation **`+0.820`**
  - `population_density_sqkm`: range `18,314 – 74,252`, ward-mean case correlation **`+0.570`**
  - `sanitation_score`: range `0.25 – 0.88`, ward-mean case correlation **`-0.400`**
- **Weekly weather variables** (verified zero nulls; within-city weekly std across wards is small: rainfall `3.96 mm`, temp `0.58 °C`, humidity `2.41 %`):
  - `avg_temp_c` (normalized case-insensitively from rubric `avg_temp_C`): min `15.74`, mean `26.92`, max `37.51 °C`
  - `rainfall_mm`: min `0.00`, mean `35.63`, max `268.83 mm/week` (monsoon June–September: `94.15, 94.21, 94.40, 85.21 mm/week`; dry Nov–Mar: `2.77 – 3.53 mm/week`)
  - `relative_humidity_pct`: min `41.84`, mean `71.18`, max `99.00 %`
- **Target (`dengue_cases`)**:
  - `58.03 %` zeros, mean `2.64`, std `4.61`, max `41` cases/week
  - Strong monsoon surge: monthly mean rises from `0.01` (Jan) → `2.78` (Jun) → `6.86` (Jul) → **`9.47` (Aug peak)** → `8.48` (Sep) → `2.52` (Oct) → `0.01` (Nov–Dec)
- **Data provenance caveat (for model card):** All five cities have nearly identical 10-year mean climate statistics (`26.92–26.94 °C`, `35.51–35.68 mm/wk`, `71.13–71.28 %` RH), and ward counts do not match official city corporation counts. The dataset appears synthetically generated; model accuracy applies strictly to this benchmark and must be recalibrated on DGHS surveillance data before operational clinical use.

## 2. Idempotent Bulk Ingestion (`apps/api/scripts/seed.py`)

Invoked via `npm run seed` and automatically during `npm run setup`:

1. Verifies dataset SHA-256 (`3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405`).
2. **Fast-path idempotency:** If `wards` already holds `60` rows and `observations` holds `31,320` rows (without `--force`), verifies SHA-256 and exits `0` in **~0.02 s**.
3. **Cold bulk upsert:** Streams the workbook with `openpyxl(read_only=True, data_only=True)`, normalizes headers case-insensitively (`avg_temp_C` → `avg_temp_c`), enforces non-nulls, Monday ISO dates, and domain bounds, then executes batched SQLAlchemy Core `ON CONFLICT ... DO UPDATE` upserts (5,000 rows/batch inside one transaction).
4. **Measured runtime:** **3.01 s** cold seed for all 60 wards + 31,320 observations (well under the `< 5 s` target); **0.02 s** on repeat runs.

## 3. Canonical Lag & Feature Builder (`apps/api/app/shared/features.py`)

`app/shared/features.py` is **the** single feature builder imported by training (`ml/train.py`), backtesting (`ml/backtest.py`), lag evidence (`features/lags/`), and live/dataset serving (`features/forecast/`), eliminating train/serve skew.

### Canonical Feature Vector (`FEATURE_COLUMNS`, 27 features)

| Group | Columns | Computation & Temporal Guarantee |
|---|---|---|
| Rainfall lags (0–8 w) | `rainfall_lag_0` … `rainfall_lag_8` | `groupby("ward_id").shift(k)` on `(ward_id, week)`-sorted rows; first `k` rows per ward are strictly `NaN` |
| Rolling rainfall sums | `rain_sum_0_3`, `rain_sum_4_7` | Sum of lags 0–3 (`min_periods=4`) and lags 4–7 (`min_periods=4`), strictly within-ward |
| Rain anomaly | `rain_anomaly` | `rainfall_mm - normal[(ward_id, canonical_iso_week)]`, where normals are fit strictly on training years (`<= 2023`) via `fit_rain_normals(df, max_year=2023)` |
| Temperature lags & mean | `temp_lag_0` … `temp_lag_3`, `temp_mean_4w` | `groupby("ward_id").shift(k)` on `avg_temp_c` (normalized from `avg_temp_C`) + 4-week mean |
| Humidity lags & mean | `humidity_lag_0` … `humidity_lag_3`, `humidity_mean_4w` | `groupby("ward_id").shift(k)` on `relative_humidity_pct` + 4-week mean |
| Static ward factors | `population_density_sqkm`, `water_logging_risk_index`, `sanitation_score` | Constant ward vulnerability attributes joined on `ward_id` |
| Target-week seasonality | `iso_week_sin`, `iso_week_cos` | `sin/cos(2π * (min(iso_week, 52) - 1) / 52)` evaluated at `target_week = week + timedelta(weeks=horizon)` for `h ∈ {1, 2, 3, 4}` |

### Leakage & Edge-Case Guarantees (Proven by `tests/test_features_lags.py`)

- **Zero cross-ward contamination (`AC-2`):** Rows are sorted by `(ward_id, week)` and all shifts run inside `groupby("ward_id", sort=False)`. Unit tests shuffle two wards with disjoint rainfall magnitudes (`1000+` vs `1..20`) and assert zero contamination and exact `NaN` counts (`60 × k` NaNs for `rainfall_lag_k` across the 60 real wards).
- **Strict consecutive-week enforcement (`CR-7`):** Both `build_features` and `compute_all_lag_correlations` reject duplicate `(ward_id, week)` pairs and any non-consecutive weekly gap (`diff() != 7 days` per ward) with `ValueError` before any positional `.shift(k)` runs, preventing silent lag misalignment.
- **Zero future leakage (`AC-3` / `CR-8`):** `build_features(..., origin_week=t)` and `build_serving_features` filter `df[df["week"] <= t]` *before* any lag, rolling window, or normal calculation. `test_ac_3_features_ignore_rows_after_origin` mutates weather and `dengue_cases` after `origin_week` to extreme values and asserts bit-for-bit identical serving features across all horizons `h = 1..4` and scenario overrides.
- **Strict serving boundary validation (`CR-12`):** `build_serving_features` raises `ValueError` whenever the post-cutoff/ward-filtered frame is empty, when no observation matches `origin_week`, or when `weather_override` contains unknown keys outside `("avg_temp_c", "rainfall_mm", "relative_humidity_pct")` (matched case-insensitively).
- **Train-only normals & anti-skew enforcement (`CR-5` / `CR-13`):** `fit_rain_normals` and `build_features` accept explicit `max_normal_year` (default `2023`) so backtests and dev splits never leak future years into `rain_anomaly`. `build_serving_features` requires pre-fitted `rain_normals` from the model artifact, and `build_features` emits a structured `WARNING` whenever `rain_normals` is omitted and fit on the fly.
- **Case-insensitive column mapping (`avg_temp_C` / `avg_temp_c`):** Both `scripts/seed.py::load_raw_dataset` and `features.py::normalize_observation_columns` normalize headers case-insensitively and reject colliding duplicate columns with `ValueError`.
- **ISO week 53:** `canonical_iso_week()` maps week 53 (e.g. `2020-12-28`) cleanly into week 52 for both seasonal trig encoding and rain normal lookup, preventing 1-row buckets or `NaN` anomalies.

## 4. Deseasonalized Lag Correlation Verification (`AC-1`)

`compute_lag_correlations(obs_df, ward_id, max_lag=8)` removes each ward's ISO-week seasonal mean from both rainfall and dengue cases, shifts demeaned rainfall by `k = 0..8` weeks per ward, and computes Pearson correlation for both the selected ward and the pooled 60-ward dataset. In `app/features/lags/service.py`, `LagsService` caches both positive ward correlations and negative lookups (wards present in `wards` with zero observations) keyed by repository `date_range()`, and exposes `warm_lags_cache()` for startup pre-warming (`CR-19`):

| Lag (`k` weeks) | Pooled 60-Ward `r` | `DSCC_Ward_07` `r` | Interpretation |
|---:|---:|---:|---|
| 0 | `0.0307` | `0.0770` | Same-week rain has almost no immediate case effect |
| 1 | `0.0727` | `0.1001` | Eggs hatching / larval stage |
| 2 | `0.2281` | `0.1981` | Vector maturation & early transmission |
| **3** | **`0.4679`** | **`0.4420`** | **Peak correlation — matches 2–4 week *Aedes* breeding + incubation clock** |
| 4 | `0.3317` | `0.3153` | Sustained post-rain surge |
| 5 | `0.0364` | `-0.0201` | Signal decays to baseline |
| 6 | `0.0064` | `-0.0649` | No lagged residual |
| 7 | `0.0140` | `-0.0369` | No lagged residual |
| 8 | `-0.0255` | `-0.1032` | No lagged residual |

Across all 60 wards individually, **55/60 peak at lag 3** and **5/60 peak at lag 4** (100% within the 3–4 week early-warning window).

## 5. Open-Meteo Live Weather Adapter & Caching (`AC-15`)

Implemented in `apps/api/app/adapters/openmeteo.py` with versioned coordinates in `apps/api/config/city_centroids.json`:

- **Single multi-location request:** One `GET` to Open-Meteo passes all 5 city centroids comma-separated with `past_days=92&forecast_days=16&timezone=Asia/Dhaka&temperature_unit=celsius&precipitation_unit=mm`, aggregating daily values into complete 7-day Mon–Sun ISO weeks in `Asia/Dhaka` (sum of `precipitation_sum`, mean of `temperature_2m_mean` and `relative_humidity_2m_mean`, max/min temperatures). The current partial week is completed cleanly by combining past observed days with forecast days for the remainder of the week, while incomplete leading/trailing boundary weeks (`< 7` days) are skipped so partial rain sums are never stored as weekly totals.
- **6-hour cache TTL:** All 5 cities are persisted into `weather_cache` with `expires_at = fetched_at + 6h`. Across an entire 6-hour window, requests for any combination of the 5 cities make **at most 1 HTTP call** (≤ 4 weather calls/day per office).
- **Resilience controls:**
  - Explicit `httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)` on a shared `httpx.Client`.
  - Up to 2 retries (3 total attempts) with exponential backoff + cryptographic jitter (`secrets.randbelow`) on `429` / `5xx` / timeout / network errors (respecting `Retry-After`; never retrying other `4xx`).
  - Simple circuit breaker (opens for 5 minutes after 3 consecutive failed fetches).
  - Fallback chain: `live` → last `weather_cache` entry (`source="cache"`) → training-year city×ISO-week climatology (`source="climatology"`). Never raises for missing weeks.
  - Test-only `FAULT_INJECT` support (`openmeteo_timeout`, `openmeteo_5xx`, honoured strictly when `APP_ENV=test`).
- **Centroid approximation:** All wards in a city share one Open-Meteo grid point in live mode; static ward factors carry local risk differences, and live responses carry a centroid-approximation label (ADR-0005).

## 6. Open-Meteo Historical Archive vs. Dataset Bias Check

Executed `node scripts/py.mjs -m scripts.check_openmeteo_bias --start 2016-01-04 --end 2025-12-29` against Open-Meteo's ERA5 Historical Archive (`https://archive-api.open-meteo.com/v1/archive`) across all **2,610 city-weeks** (5 cities × 522 ISO weeks, 2016–2025).

### Pooled Comparison (2,610 City-Weeks)

| Variable | Dataset Mean | Open-Meteo ERA5 Mean | Bias (`DS − OM`) | Ratio (`DS / OM`) | MAE | RMSE | Pearson `r` | Units Compatible? |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `avg_temp_c` (°C) | 26.925 | 25.426 | +1.499 | 1.059 | 2.592 | 3.149 | **0.7862** | Yes (°C) |
| `rainfall_mm` (mm/wk) | 35.608 | 37.842 | -2.235 | 0.941 | 31.441 | 53.968 | **0.4261** | Yes (mm/week sum) |
| `relative_humidity_pct` (%) | 71.202 | 78.609 | -7.408 | 0.906 | 10.376 | 13.328 | **0.5192** | Yes (%) |

### Per-City Breakdown (522 Weeks Each) & Versioned Corrections (`city_centroids.json` v1.1.0)

| City | Temp Bias (°C) / `r` | Rain DS vs OM (mm/wk) / Ratio / `r` | RH Bias (%) / `r` | Applied Live Correction (`temp_offset_c` / `rain_scale` / `humidity_offset_pct`) |
|---|---|---|---|---|
| Dhaka North | +1.378 / 0.7895 | 35.66 vs 35.28 / 1.011 / 0.4086 | -5.861 / 0.5337 | `+1.38 °C` / `×1.011` / `-5.86 %` |
| Dhaka South | +1.415 / 0.7909 | 35.62 vs 35.08 / 1.016 / 0.4140 | -6.993 / 0.5167 | `+1.42 °C` / `×1.016` / `-6.99 %` |
| Chattogram | +1.546 / 0.7632 | 35.68 vs 44.77 / 0.797 / 0.4767 | -9.817 / 0.5781 | `+1.55 °C` / `×0.797` / `-9.82 %` |
| Gazipur | +1.722 / 0.8070 | 35.57 vs 37.06 / 0.960 / 0.4295 | -6.909 / 0.4857 | `+1.72 °C` / `×0.960` / `-6.91 %` |
| Narayanganj | +1.436 / 0.7885 | 35.51 vs 37.04 / 0.959 / 0.4251 | -7.458 / 0.5161 | `+1.44 °C` / `×0.959` / `-7.46 %` |

**Findings:**
1. **Units and seasonal phase match:** Weekly precipitation totals (mm/week), mean temperature (°C), and relative humidity (%) are on the same scale and track the Bangladesh monsoon season (`r = 0.786` temp, `r = 0.519` humidity, `r = 0.426` rainfall — expected weekly convective rain noise plus synthetic-vs-ERA5 mismatch).
2. **Coastal Chattogram offset:** Real ERA5 rainfall in Chattogram (`44.77 mm/wk`) is ~25% higher than the synthetic dataset (`35.68 mm/wk`), while Dhaka North/South match within ~1–2%.
3. **Mitigation:** Per-city bias corrections (`temp_offset_c`, `rain_scale`, `humidity_offset_pct`) are versioned in `apps/api/config/city_centroids.json` (`v1.1.0`, `bias_check.passed: true`) and automatically applied in `OpenMeteoWeatherSource` during live mode so forecasts remain calibrated to the training feature distribution.
