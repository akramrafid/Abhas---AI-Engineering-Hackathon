# ADR-0012: Route hospital overflow within each city with a min-max utilisation transportation programme

## Status
Accepted · 2026-11-27 (Phase 2) · capacity source decided by the human

## Context
Rubric P2 (10 points): automatic intra-city patient transfer when a ward's projected bed demand exceeds local
capacity, with net deficits and remaining regional headroom strictly inside each city pool. Flagging shortages without
routing scores 5. The onsite dataset has **no capacity column and no ward coordinates**.

## Decision
- **Capacity** comes from `apps/api/config/ward_capacity.json`, generated in WP0 by `ml/fit_supply.py`:
  `capacity_i = max(1, ceil(1.10 × P95 of weekly hospital_beds_required over 2016–2022))` (P95 2–6 beds, so 3–7 after
  the margin; **284 beds in total** across the 60 wards). The file records the method, years and dataset SHA. The UI
  labels it as a documented assumption ("derived from history") and offers a per-ward capacity override input.
  Capacity is never invented silently. (Approved by the human on 2026-11-27: the dataset has no capacity,
  health-centre, crew, stock or coordinate columns.)
- Per city: required `r_i` (planned beds, ADR-0009), local deficit `D_i = max(r_i − cap_i, 0)`, headroom
  `H_j = max(cap_j − r_j, 0)`.
- **Stage 1 (LP)**: transfer variables `t_ij ≥ 0` only for `i ≠ j` in the same city, `Σ_j t_ij ≤ D_i`,
  `Σ_i t_ij ≤ H_j`; minimise the maximum post-transfer utilisation `u`, with a small penalty that maximises patients
  placed.
- **Stage 2 (MILP)**: fix `u ≤ u* + ε` and minimise the number of transfer arcs used (binary arc indicators,
  `scipy.optimize.milp`, HiGHS). At most 20 wards per city means at most 380 arcs; it solves in milliseconds.
- Output per ward: required, capacity, local deficit, headroom, transferred out/in, **net deficit after routing**,
  utilisation before/after; per city: totals, utilisation before/after, remaining headroom, **unroutable patients**
  (city pool exhausted); and the transfer list.
- **No distances.** Without real coordinates there is no travel cost; routing balances load only. Ward map positions
  stay "approximate", and nothing pretends to be geography.

## Rejected options
- **Nearest-neighbour greedy** — rejected: no global balance; early transfers can starve later deficits.
- **Cross-city transfers** — rejected: the rubric demands routing strictly within each city pool.
- **Invented capacities or synthetic coordinates** — rejected: false precision; the human chose the documented
  P95 × 1.10 derivation.

## Consequences
Routing is optimal for load balance and minimal in hand-offs, deterministic, and offline. Real capacity data can
replace the JSON file without code changes (ports/capacity.py).
