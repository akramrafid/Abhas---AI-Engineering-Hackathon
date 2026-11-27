# ADR-0013: Simulate vector control as a model-driven counterfactual on breeding-water inputs

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P3 (10 points) rewards a model-driven counterfactual of the 2-to-4-week downstream reduction in cases, beds and
saline, ranked by ROI (cases prevented per crew). A flat percentage toggle scores 5. There are no intervention labels
in the data, so the effect of a crew cannot be learned causally.

## Decision
- **Mechanism.** Larviciding and fogging remove breeding water and the mosquitoes it produces. In the model this is
  the rain signal that matures into cases within the 2–4-week breeding clock. For each horizon h, those are exactly
  the features the trained model constrains to be monotone-increasing (`ml/train.py`,
  `monotone_constraints_for_horizon`): h=2 `rainfall_lag_0/1/2`, `rain_sum_0_3`, `rain_anomaly`; h=3
  `rainfall_lag_0/1`, `rain_sum_0_3`, `rain_anomaly`; h=4 `rainfall_lag_0`, `rain_sum_0_3`, `rain_anomaly`.
- **Effect.** c crews in a ward reduce those features by the fraction `E(c) = E_max·(1 − e^(−k·c))`
  (diminishing returns). For `rain_anomaly` the reduction applies to the rain part, so the anomaly drops by
  `E(c) × rain` and stays consistent. Unconstrained features are untouched.
- **Counterfactual.** The same LightGBM predicts h = 2, 3, 4 again on the modified rows; cases prevented =
  baseline − counterfactual per horizon; beds and saline avoided follow from the ADR-0009 ratios.
- **Guarantee.** Every modified feature is monotone-increasing in the model and every modification is a decrease, so
  the counterfactual can never exceed the baseline. A property test asserts it for every ward, horizon and preset.
- **Assumptions, stated openly.** `E_max` and `k` are documented assumptions, not fitted, with presets
  low (E_max 0.25, k 0.35), base (0.40, 0.50) and high (0.55, 0.70). Every result shows a sensitivity band (low–high).
- **ROI** = total cases prevented (h 2–4) per crew; wards ranked descending.

## Rejected options
- **Static % case reduction toggle** — rejected: no model involvement; it is the 5-point answer.
- **Retraining a causal / uplift model** — rejected: no intervention labels exist; any "causal" fit would be invented.
- **Perturbing raw weather and rebuilding all features** — rejected: also shifts unconstrained features, which breaks
  the no-increase guarantee.

## Consequences
The simulator speaks the model's own language and cannot produce the embarrassing "spraying increased cases" result.
Its absolute numbers depend on the stated efficacy assumptions, which the UI and the model card label as such.
