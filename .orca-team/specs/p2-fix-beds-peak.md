ROLE: CORE · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-beds-peak — plan beds for the peak week, not the window total (review M1)
PRIORITY: P2 (MEDIUM). **Needs a LEAD decision first** (option A recommended).
SKILLS: production-hardening, receiving-code-review, verification-before-completion

## Problem
`AllocationService.plan` (`apps/api/app/features/allocation/service.py:200-212`) sizes all three resources from the
window total, the quantile of Σₕ cases over h_start…h_end. That is right for saline and kits, which are used up. A bed
is reused every week, so the window total counts bed-weeks.

At origin 2024-08-05, h 2–4, all 60 wards:

| Measure | Beds |
|---|---|
| Allocation "required" | **873** |
| Overflow, one week of the same plan (h = 3) | **345** |
| Derived capacity | **284** |

The Command Center and the commissioner brief show these numbers side by side.

## Options for LEAD
- **A (recommended): peak week.** For each horizon h, Q₀.₉,ₕ = the single-week quantile at μₕ and r(h), then
  beds = max over h of round_half_up(0.298 × Q₀.₉,ₕ). This uses the same per-week quantile as
  `overflow/service.py:single_week_case_quantile`, so the allocation and overflow bed numbers match for the same week.
- **B: keep the window total** and rename it in the UI, the brief and the docs to "bed-weeks over the window".

## Owned paths (option A)
- `apps/api/app/features/allocation/service.py`
- `apps/api/app/shared/supply.py`: add a pure `peak_week_case_quantile(means, nb_r, q)` returning the max over horizons
  of the single-week NB or Poisson quantile. Reuse it from `overflow/service.py` so the two cannot drift.
- `apps/api/app/features/overflow/service.py`: replace its local quantile helper with the shared one.
- Tests: `apps/api/tests/shared/test_supply.py` and `apps/api/tests/features/allocation/test_allocation.py`.
- Docs, after LEAD approves the wording: `docs/contracts-phase2.md` §2.1 field note "hospital_beds = peak-week beds";
  `docs/algorithms-phase2.md` §1 one sentence; S1 is unchanged; recompute S2 beds with a hand check:
  Q₀.₉ of NB(r = 3, μ = 8).

## Expected behaviour (A)
1. `hospital_beds.required` for a ward = max over h of round_half_up(0.298 × Q₀.₉ of week h).
2. For a single-week window it equals the overflow `beds_required` for the same ward, horizon and service level.
3. Saline and kits are unchanged (window total at P80).

## Tests that prove the fix
- `test_beds_equal_overflow_for_single_week`: allocation with h_start = h_end = 3 and overflow with horizon 3,
  service_level 0.9, at 2024-08-05, scope all. The `hospital_beds.required` of every ward equals its `beds_required`.
- `test_beds_peak_le_window_total`: for every ward, peak-week beds ≤ the window-total beds of the old method.
- Property: `peak_week_case_quantile` is non-decreasing in every μₕ and in q.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs contract contracts slices`.
Commit as `version-onsite-final: fix(allocation): size beds by peak week`.
