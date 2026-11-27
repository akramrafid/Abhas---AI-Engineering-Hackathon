ROLE: CORE · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-dispatch-fallback — dispatch must never invent supply numbers (review B2)
PRIORITY: P0 (BLOCKER), first in the queue. Re-run `npm run exports` after it and before the video.
SKILLS: production-hardening, receiving-code-review, verification-before-completion

## Problem
When a ward is missing from the allocation outputs, `_fallback_row_for_ward`
(`apps/api/app/features/dispatch/service.py:109-164`, called at `:328` and `:403`) builds a row from invented values:
- `expected_cases` 24 × density/45,000;
- supplies 60 / 30 / 8 × the same scale;
- its own tier cut-offs (42 / 24 / 10 cases), not the model's tiers.

Reproduced on `9688857`:
1. Save a Dhaka South allocation plan (stock 60).
2. Send `POST /dispatch/notices {"ward_ids":["GCC_Ward_01"],"plan_id":<it>}`. It returns 200 with:
   - **72.1 cases;**
   - **saline 209 / 125, beds 28 / 17;**
   - `critical`, with an emergency instruction.
3. The real allocation for GCC_Ward_01 is **37.6 cases, saline 110 / 110, beds 15 / 15, no deficit**.

This is reachable whenever `plan_id` names a plan whose scope does not contain the requested ward:
- `GET /dispatch/brief/GCC_Ward_01.html?plan_id=<a Dhaka South plan>`;
- `POST /dispatch/notices` with `ward_ids` outside that plan.

The SMS, the WhatsApp message and the brief then present invented numbers as model output, and the
number-faithfulness test passes vacuously. A second helper, `_classify_deficit_fallback`, duplicates the shared
deficit rule.

## Owned paths
- `apps/api/app/features/dispatch/service.py`
- `apps/api/app/features/dispatch/router.py` (only if the 409 needs documenting)
- `apps/api/tests/features/dispatch/test_dispatch.py`
- `contracts/openapi.json` and `apps/web/src/lib/api/schema.d.ts`, only by regenerating them with
  `npm run contracts && npm run web:types`, and only if the 409 is added to the documented responses.

## Expected behaviour
1. Delete `_fallback_row_for_ward` and `_classify_deficit_fallback`. Every number in `NoticeFacts` comes from a real
   allocation row: the saved plan's `outputs_json`, or a fresh `allocation` run.
2. When `plan_id` is set and a target ward is not in the plan's `wards`, return **409** problem+json with slug
   `ward-not-in-plan`. The detail names the ward and the plan's scope, for example
   "GCC_Ward_01 is not in plan <id> (scope Dhaka South)".
3. When there is no `plan_id`, run the allocation over a scope that contains every target ward, which is what the code
   already does. If a ward is still missing, raise an internal error (500 problem+json, logged). Never invent a row.
4. The deficit level and reasons come only from the allocation row. Do not reclassify in dispatch.

## Tests that prove the fix
- `test_brief_ward_outside_plan_scope_409`: save a Dhaka South allocation plan through `POST /plans`, then request a
  brief for `GCC_Ward_01` with that `plan_id`. Expect 409 `…/ward-not-in-plan`.
- `test_notices_ward_ids_outside_plan_409`: same check for notices.
- `test_notice_facts_equal_allocation_rows`: for scope Dhaka South with no plan, every `NoticeFacts` field
  (`predicted_cases`, required and allocated for each supply, `crews_assigned`, `deficit_level`) equals the matching
  `allocation/plan` ward row for the same request.
- `grep -n "_fallback_row_for_ward" apps/api` returns nothing.

## After the fix
Re-run `npm run exports` on the green branch and commit `/exports` if anything changed, as
`version-onsite-final: chore(exports): regenerate dispatch samples`. The current samples are for DSCC_Ward_04 inside
its own city's allocation, so they are probably unaffected; regenerating proves it.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs contract contracts slices`.
Commit as `version-onsite-final: fix(dispatch): refuse wards outside the plan instead of inventing rows`.
