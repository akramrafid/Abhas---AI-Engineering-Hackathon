# ADR-0009: Convert forecast cases to supplies with fitted per-case ratios at a service-level quantile

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P1 needs `saline_bags_needed`, `diagnostic_kits_needed` and `hospital_beds_required` per ward. The onsite
dataset adds these three columns to the unchanged Phase 1 data. Profiling the training years (2016–2022) shows they
are almost exactly proportional to `dengue_cases`: a ratio through the origin explains saline at R² 0.9997
(2.384 bags/case), kits at R² 0.9988 (1.158 kits/case) and beds at R² 0.981 (0.295 beds/case). Residual SD is about
0.2 units; every supply is 0 when cases are 0; per-case ratios are the same in all five cities. The values are integers,
which is rounding of a per-case ratio in the generator.

Orders are placed against an uncertain forecast. Ordering the mean runs out half the time; an officer needs a
service level, the classic newsvendor critical fractile.

## Decision
- `ml/fit_supply.py` fits one ratio per supply on 2016–2022 only (OLS through the origin), records R², residual SD and
  per-city ratios, and writes `apps/api/config/supply_ratios.json` with the dataset SHA-256 and fit date. Startup
  reads the file; no fitting at request time.
- Planned demand per ward = `ceil(ratio × Q_s(cases))`, where `Q_s` is the service-level quantile of the window's
  predictive case distribution. The forecaster already models cases as negative binomial (ADR-0004); a planning
  window h_start..h_end sums weekly forecasts, approximated by a moment-matched negative binomial (means add,
  variances add). Defaults: P80 for saline and kits, P90 for beds (a missing bed is worse than a spare one);
  the request may override the level (0.50–0.99).
- The tier shown is unchanged; only quantities use the quantile.

## Rejected options
- **Hand-typed multipliers** (e.g. "3 bags per case") — rejected: not traceable to data; the fitted ratio is
  measured and reproducible from a script.
- **Three more trained models (one per supply)** — rejected: a linear ratio already explains ≥ 98 % of variance, so
  extra models add training, artefacts and failure modes for no accuracy. Revisit trigger: any ratio fit drops below
  R² 0.90 on a future dataset; then train LightGBM per target with the forecast feature set.
- **Planning to the mean** — rejected: stock-outs every other week by construction.

## Consequences
Supplies inherit the forecast's uncertainty honestly and stay explainable in one sentence ("80th-percentile cases ×
2.38 bags"). The fit file must be regenerated when the dataset changes (its SHA is checked at startup).
