ROLE: UI · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-dashboard-kpi — "Highest expected cases" tile must match the ward list (QA Q6)
PRIORITY: P2 (MEDIUM; visible in the demo's first minute and in the printed brief)
SKILLS: frontend-engineering, production-hardening, verification-before-completion

## Problem
At origin 2024-08-05 the dashboard tile "Highest expected cases" shows **20.0 (Ward 10)**, while the ward list next to
it shows DSCC_Ward_06 at **21.0** and DSCC_Ward_04 at **20.6**. At 2024-06-17 the two agree. The printed ward brief
includes the same wrong tile. Screenshot: `qa-reports/lane-c/screenshots/05-dashboard-initial.png`.

The tile comes from `topWard = alerts[0]` in `apps/web/src/components/dashboard/shell/useWorkspaceSignals.ts:43-46,73`:
- it uses the per-ward "peak" map cells (`buildMapWards(…, "peak", horizons)`);
- it keeps only alert tiers;
- it sorts by `expected_cases`.

The list beside it uses a different measure, such as the selected horizon, the window sum or another rounding. The two
disagree whenever the peak horizon differs between wards.

## Owned paths
- `apps/web/src/components/dashboard/shell/useWorkspaceSignals.ts`
- `apps/web/src/components/dashboard/shell/StatTiles.tsx` (label only)
- The ward list component that renders the adjacent values (find it from `dashboard/page.tsx`); read it, and change it
  only if it is the one using the undocumented measure.
- `apps/web/e2e/dashboard.spec.ts`

## Expected behaviour
1. The tile and the list use the same measure.
2. The tile's note states which measure that is: "peak week, h2–4" or "selected horizon", in EN and BN.
3. The tile shows the ward that is first in the list when the list is sorted by that measure. Ties go to the lower
   `ward_id`.

## Tests that prove the fix
- e2e `dashboard top ward equals list max`: at `?demo=1&origin=2024-08-05`, read the tile value and ward. Assert that
  they equal the maximum and the ward of the list's `expected cases` column (same rounding). Repeat at
  `origin=2024-06-17`.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs e2e`. Commit as `version-onsite-final: fix(dashboard): top-ward tile uses the list's measure`.
