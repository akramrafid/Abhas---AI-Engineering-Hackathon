# ADR-0011: Assign spraying crews greedily by marginal cases prevented

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P1 includes "derived vector-control crew assignments" under a Total Spraying Crews control. Crews are
integers and their benefit should come from the same model-driven effect as the simulator (ADR-0013), so the
allocation screen and the simulator never disagree.

## Decision
Assign crews one at a time to the ward with the largest marginal cases prevented over weeks 2–4, using the simulator's
effect curve `E(c) = E_max·(1 − e^(−k·c))` and the same counterfactual forecaster. Ties break by priority weight, then
ward_id. A per-ward cap (default 5 crews) stops one ward absorbing everything. The marginal benefit of each ward is
cached per request, so a run costs at most `total_crews` model batches, typically far fewer.

**Why greedy is optimal here (likely Q&A).** The total benefit is a sum over wards of a per-ward benefit `B_i(c_i)`,
and each `B_i` is concave in crews because `E(c)` has diminishing returns and the forecast is monotone in the
reduced inputs. Maximising a separable concave function under one budget constraint is solved exactly by the greedy
marginal rule (the marginal benefits are non-increasing, so taking the best next unit is never regretted). If the
empirical marginals ever fail to be non-increasing (a model artefact), the implementation detects it and reports the
assignment as "greedy (approximate)".

## Rejected options
- **Integer programming over all crew splits** — rejected: needs every ward's benefit at every crew count up front;
  greedy is exact for this structure and much cheaper.
- **Crews proportional to tier** — rejected: ignores how much a crew actually prevents in each ward; contradicts the
  ROI ranking the brief asks for.

## Consequences
One effect model drives both the allocation's crew column and the simulator's ROI ranking. The optimality argument
depends on concavity, which a unit test checks on the presets.
