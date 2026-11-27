ROLE: CORE · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-allocation-integer — integer-optimal, slider-monotone allocation (review H1)
PRIORITY: P1 (HIGH)
SKILLS: production-hardening, receiving-code-review, property-based-testing, verification-before-completion

## Problem
`allocate_city` (`apps/api/app/shared/optimizer.py:240-254`, `:298-303`) solves the LP with fractional floors φ·dᵢ.
It then applies largest-remainder rounding, which ignores priority. Measured outside the repo:
- **85 of 400** random cities are not integer-optimal for Σ wᵢxᵢ. For example, d = (8, 2), w = (8, 1), stock 55 %,
  floor 35 % gives (5, 1), but (6, 0) is better.
- **29 of 300** cities break "raising stock_pct never lowers any ward's allocation" (algorithms §2). For example,
  d = (28, 23, 16, 26, 21, 22): ward 6 drops from 5 to 4 when stock goes from 65 % to 70 %.

The Hypothesis test was relaxed to `x_hi + 1 >= x_lo` (`apps/api/tests/shared/test_optimizer.py:109`). That hides the
violation.

`available_stock` (`optimizer.py:61`) uses Python `round()`, which rounds halves to even on a float. For example, it
gives S = 4 for 30 % of 15, where round-half-up gives 5. That is 392 mismatches on the grid of percentages 30–100 and
demands 0–399.

## Owned paths
- `apps/api/app/shared/optimizer.py` (allocation functions only; do not touch `greedy_crews`)
- `apps/api/tests/shared/test_optimizer.py`
- `apps/api/tests/features/allocation/test_allocation.py` (update expectations only where the new integer rule
  changes a total by its definition)
- `docs/algorithms-phase2.md` §2, Notation paragraph only, so it describes the integer floors. LEAD approves this
  wording change.

## Expected behaviour
The proposed algorithm was checked outside the repo: 0 monotonicity violations over 3,000 random cities × 71 slider
steps, 0 suboptimal cases against brute force, and A1–A3 unchanged.

1. **Available stock.** S = `(stock_pct * total_demand + 50) // 100`, integer round-half-up. The target is
   T = min(S, Σd).
2. **Integer floors (ceiling).** fᵢ = min(dᵢ, ⌈floor_pct·dᵢ / 100⌉) = min(dᵢ, (floor_pct·dᵢ + 99) // 100), in
   integer arithmetic.
   - With the ceiling, "at least 20 % of need" is literally true. QA found CCC_Ward_02 at 14 / 72 = 19.4 %, below the
     stated floor, with today's rounding.
   - Every ward with dᵢ ≥ 1 and φ > 0 gets at least one unit.
   - This was re-validated outside the repo with ceiling floors: 0 monotonicity violations and 0 suboptimal cases
     against brute force.
   - When Σf > T, rule 4 (floor scaling) applies.
3. **When Σf ≤ T:**
   - Solve the same HiGHS LP with integer bounds [fᵢ, dᵢ] and the same tie-break weights.
   - The vertex is integral: one budget row plus integer box bounds and an integer right-hand side. Snap it with
     `round()`, and assert that each value is within 1e-6 of an integer and that the values sum to T.
   - Keep `largest_remainder_round` only as the public helper for test A4. It is no longer used in `allocate_city`.
4. **When Σf > T (floor scaling):** apportion T over the floors one unit at a time.
   - Each unit goes to the ward with the largest fᵢ / (xᵢ + 1). This is the D'Hondt / Jefferson method, which never
     takes a unit away when T grows.
   - Ties go to the higher weight, then to the lower `ward_id`. Cap xᵢ ≤ fᵢ.
   - Set `floors_scaled = True`.
5. **Unchanged:** the public signatures, `AllocationResult`, deficit classification, permutation invariance and
   determinism. A1, A2 and A3 still give (80, 12, 8), (100, 60, 40) and (30, 30, 30) with `floors_scaled = True`.

## Tests that prove the fix
- Restore the strict property in `test_prop_allocation_conservation_bounds_monotone_and_permutation_invariant`: for
  stock1 ≤ stock2, every ward satisfies `x_hi >= x_lo` (no +1 slack).
- `test_alloc_integer_optimal_bruteforce`: Hypothesis, 2–4 wards, dᵢ ≤ 9, weights from {1, 2, 4, 8} × {0.5, 1, 1.3, 2}.
  In the Σf ≤ T regime, the weighted objective equals the best value from brute force over the integer vectors
  fᵢ ≤ xᵢ ≤ dᵢ with Σx = T.
- `test_available_stock_round_half_up`: (30, 15) gives 5, (30, 5) gives 2 (1.5 rounds up), (35, 10) gives 4. Also
  check the whole grid of percentages 30–100 and demands 0–400 against `(p*d+50)//100`.
- A1–A5 unchanged, and the WP1-2 end-to-end test (Dhaka South, 2024-08-05, stock 30) still passes.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs contract slices`.
Commit as `version-onsite-final: fix(allocation): integer floors, integral LP, monotone scaling, half-up stock`.
