# ADR-0010: Allocate scarce supplies per city with a weighted linear program (SciPy HiGHS)

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P1 (15 points) rewards constrained allocation under a 30–100 % stock slider that prioritises high-risk,
high-density wards and flags critical deficits live. Static per-ward formulas score 8. Officers distribute stock
inside a city corporation, which is also the pool used by overflow routing (ADR-0012).

## Decision
- **Region = city pool.** Available stock per city and supply `S = round(stock_pct/100 × Σ d_i)`, where `d_i` is the
  ward's planned demand (ADR-0009). `stock_pct` is 30–100.
- **Priority weight** `w_i = tier_weight × density_factor`, tier weights Low 1, Medium 2, High 4, Critical 8;
  `density_factor = clip(population_density_sqkm / city median density, 0.5, 2)`.
- **Programme** (per city, per supply): maximise `Σ w_i·x_i` subject to `Σ x_i ≤ S` and
  `floor_i ≤ x_i ≤ d_i`, with an equity floor `floor_i = equity_floor_pct × d_i` (default 20 %). If the floors alone
  exceed S, floors scale down proportionally so the problem stays feasible, and the response says so.
  Solved with `scipy.optimize.linprog(method="highs")`; ties are broken deterministically by ward_id.
- **Integers**: largest-remainder rounding of the LP solution, so per-ward values are integers and the city total
  equals exactly `min(S, Σ d_i)`.
- **Deficit flags**: a ward is in `deficit` when `x_i < d_i`; it is `critical` when its tier is High or Critical and
  fulfilment < 100 %, or when any ward's fulfilment is < 50 %. Every flag carries a reason string.
- Crews are assigned separately (ADR-0011) and reported in the same response.

## Rejected options
- **Proportional-only allocation** (everyone gets stock_pct of demand) — rejected: ignores risk and density, which the
  brief requires; it is the "8 points" answer.
- **OR-Tools / PuLP** — rejected: an extra native dependency for a problem SciPy's HiGHS solves in milliseconds
  (≤ 20 variables per city).
- **Pure greedy by weight** — rejected: equivalent for one constraint but cannot express the equity floor cleanly;
  the LP keeps the formulation explicit for Q&A.

## Consequences
Allocation is deterministic, reproducible and explainable ("Critical, dense wards are filled first, every ward keeps
at least 20 %"). Moving the slider recomputes in well under 100 ms. The LP structure is a fractional knapsack, so the
optimum fills wards in weight order; the LP is kept because floors and future constraints (e.g. truck capacity) slot
in without redesign.
