ROLE: UI · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-route-demo — truthful empty states and a demo week that shows routing (review H2)
PRIORITY: P1 (HIGH; rubric P2 = 10 points)
SKILLS: production-hardening, frontend-engineering, webapp-testing, verification-before-completion

## Problem
At origin 2024-08-05 with horizon 3, the overflow endpoint correctly returns 0 transfers and 61 unroutable patients:
every city has zero total headroom (Dhaka North 21, Dhaka South 19, Chattogram 10, Gazipur 6, Narayanganj 5).
`apps/web/src/features/command/StepRoute.tsx:123-131` renders "No intra-city overflow transfers required for this
horizon — all wards remain within bed capacity" whenever `transfers.length === 0`. That statement is false.

`docs/demo-7min.md` (2:40–3:40) opens Step 3 in exactly this state and says "61 unroutable" while that sentence is on
screen. Only after that does it apply a capacity override to show transfers. Keep the override beat; it is a good
demonstration. The empty-state text must still be true.

Weeks verified from the API (scope all, service level 0.90):

| Origin | Horizon | Result |
|---|---|---|
| 2024-07-01 | 3 | 6 transfers in 4 cities, 0 unroutable |
| **2024-08-12** | **3** | **5 transfers in 2 cities and 10 unroutable — shows routing and the shortage case together** |
| 2024-08-05 | 2 | 5 transfers in 4 cities, 0 unroutable |

## Owned paths
- `apps/web/src/features/command/StepRoute.tsx`
- `apps/web/src/features/command/CommandCenterView.tsx` (Route preset only)
- `apps/web/src/lib/i18n.ts` (new EN/BN strings)
- `apps/web/e2e/command.spec.ts`
- `docs/demo-7min.md` (Step 3 beat only)

## Expected behaviour
1. The Sankey area's empty state is built from the response data, city by city, in EN and BN:
   - no ward with `local_deficit > 0` → "All wards in <city> are within bed capacity";
   - deficits exist but the city has no headroom (`unroutable_patients > 0` and `transfers == 0`) → "No free beds
     anywhere in <city>: <N> patients cannot be placed in the city";
   - otherwise show the transfers.

   Never claim capacity is fine when `unroutable_patients > 0`.
2. Each city card always shows `capacity_total`, `required_total`, utilisation before and after,
   `headroom_after` and `unroutable_patients`. These already exist; keep them visible when the city has no transfers.
3. Optional, if it takes under 15 minutes: add a "Shoulder week" quick action in Step 3 that sets origin 2024-08-12
   and horizon 3 (re-verified on `9688857`: 5 transfers in 2 cities, 10 unroutable). The default origin stays as it
   is.
4. `docs/demo-7min.md` keeps the 2024-08-05 shortage case and the override beat. Add one spoken line: "In a shoulder
   week such as 12 August, the same engine moves patients between wards on its own."

## Tests that prove the fix
- e2e `AC-WP5-2b route empty state is truthful`: mock or use the live API at 2024-08-05, h = 3. Expect the text "No
  free beds anywhere in Dhaka North" and "21", and no "within bed capacity" text for that city.
- e2e `AC-WP5-2c demo week shows transfers`: at 2024-08-12, h = 3, the transfer list has at least one row and at least
  one city shows unroutable > 0.
- axe WCAG 2.2 AA: zero violations on Step 3 in both states.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs e2e`.
Commit as `version-onsite-final: fix(ui-route): truthful empty states and demo week preset`.
