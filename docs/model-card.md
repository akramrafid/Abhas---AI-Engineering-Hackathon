# Model Card — Abhas Dengue Early Warning (abhas-lgbm-1.1.2)

_Version: 1.1.2 · Date: 2026-11-21 · Framework: LightGBM 4.7.0 + Scikit-Learn 1.9.1 · License: MIT_

---

## 1. Model Details

- **Model Identifier:** `abhas-lgbm-1.1.2` (loaded via `apps/api/ml/artifacts/current.joblib`)
- **Model Type:** Multi-horizon LightGBM Poisson Regressor ($h = 1, 2, 3, 4$ weeks ahead) with strict monotonic constraints on rainfall lag features, coupled with Negative Binomial conformal 80% prediction intervals and cost-sensitive outbreak risk tiers.
- **Artifact SHA-256:** `093bd000e5353609fbb4e4d2d2a2397fc247b18c812af0e5c2abc2f08154a32e`
- **Artifact Size:** 977,463 bytes (954.6 KiB)
- **Training Time:** 37.71 seconds on NVIDIA GeForce RTX 3060 12 GB (Optuna Bayesian hyperparameter search over 50 trials).
- **Serving Architecture:** Lightweight CPU inference deserialized once at boot; p95 latency = 0.591 ms per ward.
- **Repository:** [https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon](https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon)

---

## 2. Intended Use

### Primary Intended Uses
- **Municipal Resource Allocation:** Prioritizing weekly vector-control deployments (larviciding teams, open drain desiltation, municipal sanitation drives) across 60 city wards in Bangladesh 1–4 weeks prior to peak outbreak risk.
- **Hospital Preparedness:** Providing public health directors in Dhaka, Chattogram, Khulna, and Rajshahi with early signals to replenish IV fluid stocks, diagnostic test kits, and dedicated dengue bed capacity.
- **What-If Scenario Planning:** Evaluating hypothetical heavy monsoon rainfall bursts (e.g. 120 mm to 250 mm) to estimate expected surge demand before severe weather systems make landfall.

### Out-of-Scope & Prohibited Uses
- **Individual Diagnosis:** Not intended for clinical triage, patient diagnosis, or individual prognosis.
- **Autonomous Pesticide Spraying:** Not authorized to trigger automated or uninspected aerial chemical spraying.
- **Uncalibrated Transfer:** Must not be applied to rural upazilas or unmonitored districts without local historical baseline recalibration.

---

## 3. Training & Evaluation Data

The dataset spans weekly observations from 2016 through 2025 across 60 urban wards representing 5 Bangladesh City Corporations:
- **Dhaka South City Corporation (DSCC):** 25 wards
- **Dhaka North City Corporation (DNCC):** 20 wards
- **Chattogram City Corporation (CCC):** 7 wards
- **Khulna City Corporation (KCC):** 4 wards
- **Rajshahi City Corporation (RCC):** 4 wards

### Chronological Temporal Split
To guarantee zero future data leakage, all splits strictly respect chronological time boundaries:
1. **Training Folds (2016–2022):** 4 purged expanding-window folds. An 8-week purge margin separates training windows from validation folds to eliminate lag correlation carryover.
2. **Tuning & Calibration (2023):** Exclusively utilized for Optuna hyperparameter optimization, Negative Binomial dispersion parameter $r$ estimation, conformal 80% coverage calibration, and asymmetric cost tier cut-offs.
3. **Locked Hold-Out (2024–2025):** Locked by SHA-256 hash (`4ab5539f...714b`). The model was scored exactly once on this split without any subsequent parameter adjustments.

---

## 4. Input Features (27 Features)

| Feature Name | Description | Constraint / Handling |
|---|---|---|
| `rainfall_lag_0` .. `rainfall_lag_8` | Weekly cumulative rainfall lagged 0 to 8 weeks | Strict monotonic constraint: $\partial \hat{y} / \partial x \ge 0$ |
| `rain_sum_0_3` | Cumulative rainfall over past 4 weeks (0–3) | Monotonic constraint ($\ge 0$) |
| `rain_sum_4_7` | Cumulative rainfall over antecedent weeks (4–7) | Linear trend baseline |
| `rain_anomaly` | Rainfall departure from 2016–2023 historical weekly normal | Pre-calculated from training normals |
| `temp_lag_0` .. `temp_lag_3` | Weekly average temperature (°C) lagged 0 to 3 weeks | Case-insensitive column ingestion |
| `temp_mean_4w` | 4-week rolling average temperature | Rolling mean |
| `humidity_lag_0` .. `humidity_lag_3`| Relative humidity (%) lagged 0 to 3 weeks | Rolling lag |
| `humidity_mean_4w` | 4-week rolling average relative humidity | Rolling mean |
| `population_density_sqkm` | Ward population density per square kilometer | Static spatial feature |
| `water_logging_risk_index` | Municipal water-logging susceptibility index (0–10) | Static spatial risk |
| `sanitation_score` | Solid waste and sanitation infrastructure quality (0–10)| Inversely correlates with risk |
| `iso_week_sin`, `iso_week_cos` | Cyclical calendar encoding of annual monsoon seasonality | $\sin(2\pi \cdot w / 52)$, $\cos(2\pi \cdot w / 52)$ |

---

## 5. Quantitative Evaluation Metrics

### Locked 2024–2025 Hold-Out Performance

| Horizon | Metric | Measured Value | Climatology Baseline | Improvement | Acceptance Floor |
|---|---|---|---|---|---|
| **Horizon 1** (Week +1) | MAE | **0.9329** | 1.2588 | **-25.9%** | $\le 1.10$ |
| **Horizon 2** (Week +2) | MAE | **0.9912** | 1.2588 | **-21.3%** | $\le 1.10$ and $\ge 10\%$ below |
| **Horizon 3** (Week +3) | MAE | **1.0101** | 1.2588 | **-19.8%** | $\le 1.10$ and $\ge 10\%$ below |
| **Horizon 4** (Week +4) | MAE | **1.1932** | 1.2588 | **-5.2%** | $<$ Climatology |

- **Golden Test Pass Rate:** 40 / 48 target slices passing (**83.33%** vs 80.0% threshold).
- **80% Conformal Interval Coverage:** **84.54%** across all hold-out horizons (target: 75% – 90%).
- **Within-One-Tier Accuracy:** **95.96%** (target: $\ge 95.0\%$).
- **Critical Outbreak Recall:** **93.24%** (target: $\ge 85.0\%$).

### Weather Ablation Proof
To prove meteorological features justify their place in production, a parallel ablation model trained without weather features was evaluated on the same split:
- **No-Weather MAE ($h=1..4$):** 1.2347, 1.2415, 1.2392, 1.2479.
- **Finding:** Full model outperforms the no-weather model across all 4 forecast horizons.

---

## 6. Challenger Benchmarking

An XGBoost CUDA challenger was trained on the identical 2016–2022 cross-validation folds on the RTX 3060:
- **LightGBM Mean CV MAE:** 1.2033
- **XGBoost CUDA Mean CV MAE:** 1.2050 (-0.14% delta)
- **Decision:** LightGBM was retained as the production engine because XGBoost failed to achieve the +3.0% improvement threshold required to justify introducing heavier runtime dependencies.

---

## 7. Operational Risk Tiers & Costs

Outbreak tiers are calibrated against asymmetric municipal costs where a missed surge is 5× more damaging than a false alarm:
- **Low (সাধারণ):** $< 4.5$ expected cases. Routine monitoring; standard waste disposal.
- **Medium (মধ্যম):** $4.5 – 9.0$ expected cases. Heightened community inspection; larviciding.
- **High (উচ্চ):** $9.0 – 11.0$ expected cases. Targeted focal spraying; public health announcements.
- **Critical (জরুরি):** $\ge 11.0$ expected cases (or endemic channel threshold exceeded). Citywide emergency mobilization; hospital bed reserve activations.

---

## 8. Caveats & Ethical Considerations

1. **Simulated Data Caveat:** Statistical properties of the hackathon dataset suggest synthetic generation. This system must be cross-calibrated against Directorate General of Health Services (DGHS) field surveillance data before real clinical or operational reliance.
2. **Equitable Resource Allocation:** Vector control interventions must not disproportionately disfavor informal settlements with unmeasured water-logging metrics.
