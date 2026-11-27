# ADR-0009: Convert forecast cases to supplies with the dataset's exact per-case constants at a service-level quantile

## Status
Accepted · 2026-11-27 (Phase 2) · revised the same day after the data profile; constants decided by the human

## Context
Rubric P1 needs `saline_bags_needed`, `diagnostic_kits_needed` and `hospital_beds_required` per ward. The onsite
dataset adds these three integer columns to the unchanged Phase 1 data. The data profile
(`docs/data-profile-onsite.md`) shows they are **deterministic**: for every case count the supply is a single value
(std 0 across city, ward and year), namely `round(c × dengue_cases)` with one constant per supply. The constants
2.385 (saline), 1.164 (kits) and 0.298 (beds) reproduce all 31,320 rows exactly, with no rounding ties for 0–41 cases.
A regression ratio (OLS through the origin: 2.384, 1.158, 0.295, R² ≥ 0.98) is only an approximation of that rule.

Orders are placed against an uncertain forecast. Ordering for the mean runs out about half the time, so an officer
needs a service level, the classic newsvendor critical fractile.

## Decision
- Supply per case count k is `round_half_up(c × k)` with c = 2.385 / 1.164 / 0.298, the exact rule in the data.
  The constants live in `apps/api/config/supply_ratios.json` with the dataset SHA-256 and the valid interval for each
  constant; a test asserts they reproduce 100 % of rows.
- Planned demand per ward = `round_half_up(c × Q_s)`, where `Q_s` is the service-level quantile of the window's
  predictive case distribution. The forecaster already models cases as negative binomial (ADR-0004); a window
  h_start..h_end sums weekly forecasts, approximated by a moment-matched negative binomial (means add, variances add).
  Defaults: P80 for saline and kits, P90 for beds (a missing bed is worse than a spare one); the request may set one
  level for all three (0.50–0.99). The service level applies to the case distribution only, never to the constants.
- The tier shown is unchanged; only quantities use the quantile.

## Rejected options
- **Regression ratios (2.384, 1.158, 0.295)** — rejected: they approximate a rule the data states exactly and miss
  rows after rounding; the exact constants are both simpler and correct.
- **Hand-typed multipliers without verification** — rejected: not traceable; ours are proven against every row.
- **Three more trained models (one per supply)** — rejected: the relation is deterministic, so a model would learn a
  rounding rule at best. Revisit only if a future dataset breaks the 100 % reproduction test; then fit LightGBM per
  target with the forecast feature set.
- **Planning to the mean** — rejected: stock-outs every other week by construction.

## Consequences
Supplies inherit the forecast's uncertainty honestly and stay explainable in one sentence ("80th-percentile cases ×
2.385 bags, rounded"). The model card states the provenance caveat: real deployment must replace the constants with
DGHS admission and consumption tables.
