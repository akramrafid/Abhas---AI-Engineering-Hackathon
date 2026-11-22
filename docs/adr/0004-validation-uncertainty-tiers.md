# ADR-0004: Chronological validation, locked hold-out, negative-binomial bands and cost-based tiers
## Status
Accepted · 2026-11-21
## Context
Rubric R5 asks for a chronological validation split; R3 for clear tiers; the bonus rewards intervals and a
validation dashboard. Random k-fold leaks future seasons into training. Tiers must be explainable in one sentence.
## Decision
Rolling-origin expanding-window folds test 2019, 2020, 2021, 2022; 2023 is used only for tuning, tier cut-offs
and calibration; **2024–2025 is a hold-out locked by SHA-256 before any tuning** (`npm run eval:lock`) and scored
once at the end. Purge: training rows whose target week falls in or after a fold's first test week are dropped.
All features use only data dated ≤ origin week; normals and endemic channels are fit on training years only.
80 % bands: negative binomial around the Poisson mean with dispersion fit on 2023, conformally adjusted on 2023
to cover 80 %; P90 is clamped to at least the mean. Tier from expected weekly cases with cut-offs chosen on 2023
to minimise cost when a missed Critical costs 5× a false alarm (start: 3 / 8 / 14); escalate one tier when P90
exceeds the ward's epidemic threshold (training-years mean + 2 SD for that ISO week, floor 5). Risk score 0–100 =
P(cases ≥ High cut-off) under the same negative binomial.
## Rejected options
- **Random or grouped k-fold** — leaks future seasons; overstates skill.
- **Quantile LightGBM + CQR in wave 1** — eight extra models before the thin slice; added only if NB coverage
  misses [0.75, 0.90] on 2023.
- **Fixed equal-width tiers** — ignore the asymmetric cost of missing an outbreak.
## Consequences
Honest error numbers for the validation dashboard; tiers and score share one probability model. The hold-out
cannot be used to pick models; any re-tune after unlocking is reported as such.
