# ADR-0003: LightGBM with Poisson loss, one global model per horizon (direct multi-horizon)
## Status
Accepted · 2026-11-21
## Context
Target is weekly dengue counts per ward: 58 % zeros, seasonal, strong known rainfall lags (deseasonalized
correlation peaks at 3 weeks, 0.47). 60 wards × 522 weeks. Rubric R3 wants a trained model with dynamic
predictions and tiers; R6 wants a joblib-serialized model with fast inference. The spike baseline (sklearn
Poisson gradient boosting) reached MAE 1.02 at h = 2–3 vs 1.24 for climatology.
## Decision
LightGBM, Poisson objective, one global model across all wards for each horizon h = 1..4 (direct strategy),
features from `app/shared/features.py`: rainfall lags 0–8, rolling sums, rain anomaly vs training-years ward
normal, temperature and humidity lags 0–3 and 4-week means, static ward factors, target-week seasonality.
No past case counts (they added nothing in the spike and their absence lets the scenario run on weather alone).
Monotone-increasing constraints on rain lags 2–4 so the what-if behaves sensibly. Drivers from native SHAP
(`pred_contrib=True`), converted from log space to multiplicative effects and grouped into human drivers.
Benchmark: negative-binomial GLM with rain lags 0–8 and ward effects (statsmodels); kept if it wins.
Baselines reported everywhere: ward × ISO-week climatology, seasonal naive, persistence, LightGBM without weather.
## Rejected options
- **LSTM / TFT / foundation models (Chronos, TimesFM)** — torch adds gigabytes (breaks 3-minute setup and the
  joblib requirement); 60 short series give no evidence they would win.
- **Prophet / ARIMA per ward** — 60 separate models without shared learning; weak with exogenous lags.
- **Recursive multi-step forecasting** — errors compound and needs future weather at every step.
## Consequences
Millisecond inference, exact per-prediction explanations, small committed artifact. Four models to train and
version (one per horizon) inside one joblib bundle with metadata (feature list, normals, cut-offs, SHA-256).
