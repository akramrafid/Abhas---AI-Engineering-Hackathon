# Handoff — WP10: Early-Action Trigger (ADR-0020) & Structural-Fix Planner (ADR-0021)

- **Branch:** `refs/heads/version-onsite-final`
- **Role / Model:** BUILDER WP10 · Gemini 4 Neon xHigh
- **Spec:** `.orca-team/specs/p2-wp10-trigger-structural.md`

## What Changed

### 1. Precomputation Scripts & Locked JSON Artefacts
- `apps/api/ml/trigger.py` (`npm run trigger`) → `apps/api/evals/results/trigger.json`
  - Fits `(R, W)` strictly on **2016–2023** (`target_year <= 2023`, leakage guard raises `ValueError` on any hold-out row) by maximising Peirce skill score on non-vacuous drainage thresholds (`W >= 0.30`).
  - Selected rule: **`2-week rain > 80 mm AND water_logging_risk_index >= 0.30`** (predicting High `>= 8` cases at `h = 3`).
  - Locked **2024–2025 hold-out** (`6,300` ward-weeks, `713` High weeks):
    - **Zero-model rule:** hit rate **`94.1%`** (`0.9411`), FAR **`63.4%`** (`0.6343`), FPR `20.8%`, Peirce **`0.733`**, alerts `1,835` vs High `713`, lead-time quartiles `Q25 = 3.0w / median = 6.0w / Q75 = 8.0w` (`136/158` outbreak waves covered).
    - **Abhas LightGBM (`h = 3`):** hit rate **`92.0%`** (`0.9201`), FAR **`50.5%`** (`0.5045`, `−13.0` pp), Peirce **`0.800`** (`+0.068`), **`496` false alarms avoided** (`1,324` vs `1,835` alerts), median lead `3.0w` (`156/158` waves covered).
- `apps/api/ml/structural.py` (`npm run structural`) → `apps/api/evals/results/structural.json`
  - Fits log-link Poisson GLM (`rainfall_lag_2..4` + `population_density_sqkm`, `water_logging_risk_index`, `sanitation_score`) on 2016–2023 (`beta_wl = +0.8859`, `beta_san = -0.3427`) and cross-checks with LightGBM partial dependence (modifying ONLY the target trait on `abhas-lgbm-1.1.2`), each with **500-resample ward-year cluster bootstrap 95% CIs**.
  - Aggregate seasonal reductions (both estimators agree in direction):
    - `−0.1` water-logging: GLM **`8.48%` `[7.86, 9.13]%`** · LightGBM PD **`6.54%` `[6.07, 6.96]%`**
    - `−0.2` water-logging: GLM **`16.24%` `[15.11, 17.43]%`** · LightGBM PD **`13.05%` `[12.60, 13.48]%`**
    - `+0.1` sanitation: GLM **`3.37%` `[2.56, 4.15]%`** · LightGBM PD **`1.74%` `[1.57, 1.91]%`**
    - `+0.2` sanitation: GLM **`6.45%` `[4.93, 7.91]%`** · LightGBM PD **`3.12%` `[2.92, 3.33]%`**
  - Top Build-vs-Send wards (`−0.2` drainage cases/yr vs simulator 1-crew peak ROI at `2024-08-05`):
    - `CCC_Ward_03` (`34.2` GLM / `30.8` PD vs `9.68`/crew → `3.54×`/yr)
    - `DNCC_Ward_12` (`33.7` GLM / `26.1` PD vs `7.61`/crew → `4.43×`/yr)
    - `DSCC_Ward_04` (`32.9` GLM / `39.1` PD vs `9.61`/crew → `3.42×`/yr)
  - Mandatory disclaimer enforced in schema, JSON, and UI: `"associations in simulated data, not causal real-world estimates"`.

### 2. Pure Shared Maths, Offline API Slices, & Brief Rule
- Pure framework-free modules: `apps/api/app/shared/trigger.py`, `apps/api/app/shared/structural.py`.
- Ports & offline SHA-256-verified JSON adapters: `apps/api/app/ports/planning.py`, `apps/api/app/adapters/config_planning.py`.
- Endpoints: `GET /api/v1/validation/trigger` (`validation` slice) and `GET /api/v1/planning/structural?city=` (new `planning` slice), both ETag-cached, 100% offline, and checked in `/readyz`.
- Commissioner briefs (`apps/api/app/features/dispatch/{templates,service}.py`): print the zero-model early-action trigger rule and whether the ward qualifies (`water_logging_risk_index >= 0.30`) in EN & BN inside `<aside class="trigger-box">`, preserving strict `<main>` number-faithfulness and zero external URLs.
- Contracts & generated types refreshed (`contracts/openapi.json`, `apps/web/src/lib/api/schema.d.ts`).

### 3. Web UI & Docs
- Validation tab: `apps/web/src/features/validation/components/EarlyActionTriggerCard.tsx` (one-sentence rule, hit-rate & FAR comparison bars, Peirce score, false alarms cut, lead-time quartiles, EN/BN, zero Lime, WCAG 2.2 AA).
- Command Center Step 4: `apps/web/src/features/command/BuildVsSendPanel.tsx` (mandatory honesty banner, GLM vs LightGBM PD summary with 95% CIs, ranked Build-vs-Send table alongside simulator crew ROI, EN/BN, zero Lime, WCAG 2.2 AA).
- `docs/qa-prep.md`: added 4 Technical Q&A entries (#26–#29) with exact measured numbers.

## Tests Added
- `apps/api/tests/shared/test_trigger.py` (TR1–TR5, hold-out leakage test, JSON reproduction, Hypothesis properties)
- `apps/api/tests/shared/test_structural.py` (ST1–ST5, expected signs, GLM/LGBM direction agreement, CI bounds, disclaimer, Hypothesis properties)
- `apps/api/tests/features/test_trigger_structural_api.py` (API offline socket guard, ETag 304, city filter + 422, brief EN/BN rule, `/readyz` checks)
- `apps/web/e2e/wp10-trigger-structural.spec.ts` + `apps/web/e2e/offline.spec.ts` (online + strict offline Playwright checks for both panels, brief rule, zero Lime, WCAG 2.2 AA)

## Known Gaps / Caveats
- All structural-fix numbers are explicitly labelled `"associations in simulated data, not causal real-world estimates"`.
- Full gate verification (`npm run ci`, `gates.mjs slices contract offline e2e`) is run after WP10 + WP8 land on `refs/heads/version-onsite-final`.
