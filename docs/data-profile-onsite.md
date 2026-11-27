# Phase 2 Onsite Dataset Profile — Abhas (আভাস)

_Owner: DATA (Role 6 — Data Engineer) · Updated: 2026-11-27 · Reproducible script: `apps/api/scripts/profile_onsite.py` (`node scripts/py.mjs -m scripts.profile_onsite [-- --json]`)_

> **Recommendation:** **Keep the Phase 1 LightGBM model (`abhas-lgbm-1.1.2`) as-is — do not retrain with `npm run train`.** Every row (`31,320`), ward (`60`), ISO week (`522`, `2016-01-04` to `2025-12-29`), static vulnerability factor, weather value, and `dengue_cases` count is **100% identical** (`0` differing cells, identical row order) to the Phase 1 dataset. The onsite workbook appends exactly three deterministic integer supply columns (`saline_bags_needed`, `diagnostic_kits_needed`, `hospital_beds_required`) and contains **no** bed-capacity, health-centre, crew, stock, or coordinate columns.

---

## 1. File Identity, Shape, Schema & Integrity

| Property | Phase 2 Onsite Dataset | Phase 1 Dataset (Reference) |
|---|---|---|
| Path (read-only) | `data/raw/bangladesh_dengue_large_dataset_onsite.xlsx` | `data/raw/hackathon_preli_dataset.xlsx` |
| File size | `2,466,199` bytes | `2,064,892` bytes |
| SHA-256 | `24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0` | `3b553e207f95d8375e157dcd49698d783121c915bcc4e51c75a3b3971eb7e405` |
| Sheets | `["bangladesh_dengue_large_dataset"]` (1 sheet) | `["bangladesh_dengue_large_dataset"]` (1 sheet) |
| Shape | **`31,320` rows × `15` columns** | `31,320` rows × `12` columns |
| Date range | `2016-01-04` to `2025-12-29` | `2016-01-04` to `2025-12-29` |
| Weeks per ward | `522` min / `522` max (`0` gaps, `0` non-Mondays) | `522` min / `522` max |
| ISO week 53 | `60` rows on `2020-12-28` (1 per ward) | `60` rows on `2020-12-28` |
| Nulls | **`0`** across all 15 columns | `0` across all 12 columns |
| Duplicate `(ward_id, date)` | **`0`** (`0` duplicate full rows) | `0` |

### Columns & Dtypes

| # | Column (exact header) | Pandas Dtype | Nulls | Phase 1 Status |
|---:|---|---|---:|---|
| 1 | `date` | `datetime64[us]` | 0 | Shared (identical) |
| 2 | `city` | `str` | 0 | Shared (identical) |
| 3 | `ward_id` | `str` | 0 | Shared (identical) |
| 4 | `population_density_sqkm` | `int64` | 0 | Shared (identical) |
| 5 | `water_logging_risk_index` | `float64` | 0 | Shared (identical) |
| 6 | `sanitation_score` | `float64` | 0 | Shared (identical) |
| 7 | `avg_temp_c` | `float64` | 0 | Shared (identical) |
| 8 | `max_temp_c` | `float64` | 0 | Shared (identical) |
| 9 | `min_temp_c` | `float64` | 0 | Shared (identical) |
| 10 | `rainfall_mm` | `float64` | 0 | Shared (identical) |
| 11 | `relative_humidity_pct` | `float64` | 0 | Shared (identical) |
| 12 | `dengue_cases` | `int64` | 0 | Shared (identical) |
| 13 | `saline_bags_needed` | `int64` | 0 | **Added in Phase 2** |
| 14 | `diagnostic_kits_needed` | `int64` | 0 | **Added in Phase 2** |
| 15 | `hospital_beds_required` | `int64` | 0 | **Added in Phase 2** |

### Cities × Wards Coverage

| City | Wards | Weeks / Ward | Total Rows |
|---|---:|---:|---:|
| Dhaka North (`DNCC`) | 20 | 522 | 10,440 |
| Dhaka South (`DSCC`) | 20 | 522 | 10,440 |
| Chattogram (`CCC`) | 10 | 522 | 5,220 |
| Gazipur (`GCC`) | 5 | 522 | 2,610 |
| Narayanganj (`NCC`) | 5 | 522 | 2,610 |
| **Total** | **60** | **522** | **31,320** |

---

## 2. Exact Comparison Against Phase 1 (`hackathon_preli_dataset.xlsx`)

Running an exact cell-by-cell comparison across `(ward_id, date)` keys and raw ordering confirms:

- **Same rows plus new columns?** **Yes.** Exactly `31,320` overlapping `(ward_id, date)` keys in identical row order (`same_row_order_on_shared_cols = true`), with `3` new columns appended and `0` removed.
- **New weeks or wards?** **None.** `0` added/removed wards; `0` added/removed weeks.
- **Same weather, ward vulnerability, and cases?** **100% identical.** `0` differing cells across all 12 shared columns (`max_abs_diff = 0.0` for `population_density_sqkm`, `water_logging_risk_index`, `sanitation_score`, `avg_temp_c`, `max_temp_c`, `min_temp_c`, `rainfall_mm`, `relative_humidity_pct`, and `dengue_cases`; `0` string differences on `city` and `ward_id`).
- **Implication for Phase 1 SQLite DB (`scripts/seed.py`):** No schema change or re-seed of `wards` / `observations` is required.

---

## 3. Supply Columns Profile

No other new columns exist beyond `saline_bags_needed`, `diagnostic_kits_needed`, and `hospital_beds_required`. All three are non-negative `int64` counts with `0` nulls and strictly `0` on all `18,176` rows where `dengue_cases == 0`.

### 3.1 Distributions (`n = 31,320` rows)

| Column | Min | P10 | Median | Mean | SD | P90 | P95 | P99 | Max | Zero % | Non-zero if cases=0 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `saline_bags_needed` | 0 | 0 | 0 | 6.2686 | 10.9966 | 21 | 31 | 48 | 98 | 58.03% | 0 |
| `diagnostic_kits_needed` | 0 | 0 | 0 | 3.0237 | 5.3559 | 10 | 15 | 23 | 48 | 58.03% | 0 |
| `hospital_beds_required` | 0 | 0 | 0 | 0.7617 | 1.3822 | 3 | 4 | 6 | 12 | 66.43% | 0 |

_Note: `hospital_beds_required` has a higher zero share (`66.43%` vs `58.03%`) solely because `dengue_cases == 1` (`2,631` rows = `8.40%` of the dataset) deterministically rounds to `0` hospital beds (`round(0.298 × 1) = 0`)._

### 3.2 Per-Case Ratios (`dengue_cases > 0`, `n = 13,144` rows)

| Column | Min (`y/x`) | P10 | Median | Mean (`y/x`) | SD | P90 | Max (`y/x`) | Aggregate `Σy / Σx` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `saline_bags_needed` | 2.0000 | 2.0000 | 2.3750 | 2.3231 | 0.1704 | 2.5000 | 2.5000 | 2.377719 |
| `diagnostic_kits_needed` | 1.0000 | 1.0000 | 1.1333 | 1.1045 | 0.0892 | 1.2000 | 1.2500 | 1.146890 |
| `hospital_beds_required` | 0.0000 | 0.0000 | 0.2857 | 0.2530 | 0.1469 | 0.5000 | 0.5000 | 0.288911 |

### 3.3 Linear Fits Against `dengue_cases` (Overall, Training 2016–2022, Hold-Out 2024–2025)

Both unconstrained OLS (`y = a + b·x`) and OLS through the origin (`y = b₀·x`, used by ADR-0009) achieve `R² ≥ 0.980` across every split:

| Column | Split (`n`) | OLS Slope (`b`) | OLS Intercept (`a`) | OLS `R²` | Resid SD | Resid Range `[min, max]` | Origin Slope (`b₀`) | Origin `R²` | Origin Resid SD |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| `saline_bags_needed` | All 2016–2025 (`31,320`) | 2.386170 | −0.022281 | 0.999682 | 0.1962 | `[−0.4735, +0.4776]` | **2.384086** | 0.999679 | 0.1964 |
| `saline_bags_needed` | **Train 2016–2022 (`21,900`)** | 2.386321 | −0.021941 | 0.999686 | 0.1963 | `[−0.4771, +0.4767]` | **2.384280** | 0.999683 | 0.1965 |
| `saline_bags_needed` | Hold-out 2024–2025 (`6,300`) | 2.385955 | −0.019963 | 0.999555 | 0.1944 | `[−0.4710, +0.4761]` | 2.383705 | 0.999551 | 0.1946 |
| `diagnostic_kits_needed` | All 2016–2025 (`31,320`) | 1.161703 | −0.039053 | 0.998859 | 0.1809 | `[−0.4461, +0.5411]` | **1.158050** | 0.998819 | 0.1817 |
| `diagnostic_kits_needed` | **Train 2016–2022 (`21,900`)** | 1.161914 | −0.039677 | 0.998877 | 0.1809 | `[−0.4461, +0.5346]` | **1.158222** | 0.998836 | 0.1817 |
| `diagnostic_kits_needed` | Hold-out 2024–2025 (`6,300`) | 1.161089 | −0.034293 | 0.998406 | 0.1792 | `[−0.4490, +0.4903]` | 1.157224 | 0.998362 | 0.1798 |
| `hospital_beds_required` | All 2016–2025 (`31,320`) | 0.297038 | −0.021426 | 0.980542 | 0.1928 | `[−0.4638, +0.5162]` | **0.295034** | 0.980361 | 0.1930 |
| `hospital_beds_required` | **Train 2016–2022 (`21,900`)** | 0.297371 | −0.021232 | 0.980799 | 0.1932 | `[−0.4656, +0.5054]` | **0.295396** | 0.980624 | 0.1934 |
| `hospital_beds_required` | Hold-out 2024–2025 (`6,300`) | 0.294351 | −0.020060 | 0.973133 | 0.1889 | `[−0.4517, +0.5443]` | 0.292091 | 0.972906 | 0.1891 |

### 3.4 Per-City Linear Fits (`2016–2025` all years, and `2016–2022` training years in parentheses)

Slopes are identical across all five cities to within `±0.003` (the tiny difference comes solely from each city's empirical count distribution weighting integer-rounding residuals):

| City (`n` all / train) | Saline OLS `b` (Origin `b₀` · `R²`) | Kits OLS `b` (Origin `b₀` · `R²`) | Beds OLS `b` (Origin `b₀` · `R²`) |
|---|---|---|---|
| Chattogram (`5,220` / `3,650`) | `2.3867` (`2.3844` / train `2.3852` · `0.9997`) | `1.1620` (`1.1582` / train `1.1588` · `0.9989`) | `0.2964` (`0.2944` / train `0.2952` · `0.9807`) |
| Dhaka North (`10,440` / `7,300`) | `2.3856` (`2.3837` / train `2.3839` · `0.9997`) | `1.1609` (`1.1572` / train `1.1572` · `0.9988`) | `0.2971` (`0.2953` / train `0.2952` · `0.9806`) |
| Dhaka South (`10,440` / `7,300`) | `2.3861` (`2.3841` / train `2.3836` · `0.9997`) | `1.1621` (`1.1585` / train `1.1586` · `0.9988`) | `0.2967` (`0.2946` / train `0.2951` · `0.9795`) |
| Gazipur (`2,610` / `1,825`) | `2.3856` (`2.3832` / train `2.3841` · `0.9997`) | `1.1624` (`1.1587` / train `1.1598` · `0.9991`) | `0.2990` (`0.2968` / train `0.2976` · `0.9846`) |
| Narayanganj (`2,610` / `1,825`) | `2.3887` (`2.3866` / train `2.3872` · `0.9996`) | `1.1619` (`1.1584` / train `1.1574` · `0.9988`) | `0.2967` (`0.2947` / train `0.2949` · `0.9783`) |

### 3.5 Deterministic vs. Noisy Verification

**Conclusion: 100% deterministic synthetic multiplier with integer rounding — zero stochastic noise.**

1. **Exact functional mapping (`std(y | dengue_cases = k) == 0.0` everywhere):** Grouping all `31,320` rows by `dengue_cases` (`42` distinct integer values from `0` to `41`) yields `max_unique_y_per_x = 1` for all three supply columns. Identical case counts always produce the exact same integer supply count regardless of city, ward, density, sanitation, weather, or year.
   - Sample exact mapping `(cases → saline, kits, beds)`: `0 → (0, 0, 0)`, `1 → (2, 1, 0)`, `2 → (5, 2, 1)`, `5 → (12, 6, 1)`, `10 → (24, 12, 3)`, `15 → (36, 17, 4)`, `20 → (48, 23, 6)`.
2. **Exact `round(c · dengue_cases)` intervals (100.00% match across all 31,320 rows, 0 exceptions):**
   - `saline_bags_needed`: `c ∈ (2.383333, 2.386364)` (midpoint `2.384848`, e.g. `2.385`)
   - `diagnostic_kits_needed`: `c ∈ (1.161765, 1.166667)` (midpoint `1.164216`, e.g. `1.164`)
   - `hospital_beds_required`: `c ∈ (0.296875, 0.300000)` (midpoint `0.298438`, e.g. `0.298`)
3. **Quantization residual proof:** Uniform rounding error on `[-0.5, +0.5]` across the `41.97%` positive-case rows (and `0` on the `58.03%` zero-case rows) predicts a pooled residual SD of `sqrt(0.4197 / 12) = 0.1870`, matching the observed residual SDs (`0.1962`, `0.1809`, `0.1928`) closely. Residual correlations with ward vulnerability factors are near zero (`|r| ≤ 0.017`). The small negative OLS intercepts (`−0.021` to `−0.039`) are pure rounding bias at small case counts (`cases = 1` rounds down on all three supplies).

_This confirms ADR-0009: training three extra ML models for supplies would add complexity for zero signal; fitting OLS-through-origin ratios strictly on `2016–2022` captures `≥ 98.1%` of variance cleanly and transparently._

---

## 4. Capacity, Health-Centre, Crew & Stock Columns

- **Bed capacity column:** **absent**
- **Health-centre / clinic / facility column:** **absent**
- **Spraying crew / vector-control team column:** **absent**
- **Regional stock / inventory / budget column:** **absent**
- **Geographic coordinates (latitude / longitude):** **absent**

Token-level column scan across all 15 columns found `0` matches (`status: "absent"`, `matching_columns: []`). Because no baseline ward capacity column exists in the data, ADR-0012 derives baseline capacity reproducibly from training years `2016–2022` as `capacity_i = max(1, ceil(1.10 × P95(hospital_beds_required_i)))`:

- Training-year (`2016–2022`) ward P95 weekly `hospital_beds_required`: min **`2.0`**, median **`4.0`**, max **`6.0`**
- Derived ward capacities (`ceil(1.10 × P95)`): min **`3`**, median **`5`**, max **`7`** beds/ward (**`284`** total beds across all 60 wards)

---

## 5. Phase 1 Assumptions Re-Verification

### 5.1 Deseasonalized Rain–Case Lag Correlation (`k = 0..8`)

Computed with the canonical Phase 1 function (`app/shared/features.py::compute_all_lag_correlations`), demeaning rainfall and cases within each `(ward_id, canonical_iso_week)`:

| Lag (`k` weeks) | Onsite Pooled 60-Ward `r` | Phase 1 Pooled `r` | Onsite `DSCC_Ward_07` `r` | Changed? |
|---:|---:|---:|---:|---|
| 0 | `0.0307` | `0.0307` | `0.0770` | No |
| 1 | `0.0727` | `0.0727` | `0.1001` | No |
| 2 | `0.2281` | `0.2281` | `0.1981` | No |
| **3 (peak)** | **`0.4679`** | **`0.4679`** | **`0.4420`** | **No** |
| 4 | `0.3317` | `0.3317` | `0.3153` | No |
| 5 | `0.0364` | `0.0364` | `-0.0201` | No |
| 6 | `0.0064` | `0.0064` | `-0.0649` | No |
| 7 | `0.0140` | `0.0140` | `-0.0369` | No |
| 8 | `-0.0255` | `-0.0255` | `-0.1032` | No |

Per-ward peak lag distribution across all 60 wards is unchanged: **`55/60` peak at lag 3** and **`5/60` peak at lag 4**.

### 5.2 Wards & Static Vulnerability Factors

| Static Factor | Constant Within Every Ward? | Min | Max | Ward-Mean Case `r` | Changed vs. Phase 1? |
|---|---|---:|---:|---:|---|
| `water_logging_risk_index` | Yes (60/60) | `0.22` | `0.94` | `+0.8198` | No (`0` diffs) |
| `population_density_sqkm` | Yes (60/60) | `18,314` | `74,252` | `+0.5699` | No (`0` diffs) |
| `sanitation_score` | Yes (60/60) | `0.25` | `0.88` | `-0.4003` | No (`0` diffs) |

No new wards, no removed wards, and no changed vulnerability values.

---

## 6. Recommendation & Provenance Caveat

1. **Keep the Phase 1 model (`abhas-lgbm-1.1.2`) as-is — do not retrain with `npm run train`.** All `31,320` rows of features and `dengue_cases` are byte-for-byte identical to Phase 1; keeping the locked, evaluated Phase 1 artifact avoids unnecessary churn and preserves all held-out calibration and eval baselines.
2. **Fit Phase 2 operational config strictly on `2016–2022` (`ml/fit_supply.py`, WP1):** Verify onsite SHA-256 `24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0`, write `apps/api/config/supply_ratios.json` (training ratios `2.3843`, `1.1582`, `0.2954`, `R² ≥ 0.9806`) and `apps/api/config/ward_capacity.json` (`ceil(1.10 × P95)`, range `3–7` beds/ward).
3. **Provenance caveat (for model card & Q&A):** Because all three supply columns are deterministic rounded multiples of `dengue_cases` and bed capacity is absent from the source workbook, operational deployment with DGHS/city corporations requires replacing both the fitted multipliers and derived P95 capacities with real hospital inventory and admission-rate tables.
