ROLE: CORE + UI · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-low-batch — six small hardening items (review L1–L6)
PRIORITY: P3 (LOW). Do these only after P0–P2 are green; skip any item that would take more than 15 minutes and list
it in README "Known limitations".
SKILLS: production-hardening, receiving-code-review, verification-before-completion

| ID | File | Change | Test that proves it |
|---|---|---|---|
| L1 | `apps/api/app/shared/routing.py:305,313` | Add `"time_limit": 2.0` to both `milp` option dicts. The northwest-corner fallback already handles "no incumbent". | Existing R1–R3 and property tests stay green. A new test with 20 wards (10 deficit, 10 headroom, random) finishes in < 3 s. |
| L2 | `apps/api/app/features/overflow/service.py:185,256` | `capacity_overrides` for a ward outside `scope` returns 422 problem+json, slug `override-out-of-scope`, naming the ward. Wards that don't exist keep the current 404 `unknown-ward`. | `scope="Dhaka North"` with an override for `CCC_Ward_01` returns 422. |
| L3 | `apps/api/app/adapters/gemini_chat.py:263-267, 381-385` | Call `_check_budget(...)` **before** `self._breaker.allow_request()`, so a budget error can't leave the half-open probe slot taken. | Fake clock: open the breaker (3 failures), pass the 60 s cooldown, make the budget check raise, then a later call with budget is allowed (`allow_request()` returns True). |
| L4 | `apps/api/app/features/dispatch/router.py` (brief route) | Add the header `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'` to the brief `HTMLResponse`. | Response header present; the D6 escaping test still passes; the brief still renders styled in Playwright (screenshot or a computed-style check on `.kpi-value`). |
| L5 | `docs/demo.md` (Phase 2 section) and `README.md` run notes | Write the rule "restart the API after the final commit and before recording; check that `/readyz` `git_sha` equals `git rev-parse --short HEAD` and that `git status` is clean". No code change. | Manual: the checklist line is present. |
| L6 | `apps/web/src/features/command/CommandCenterView.tsx:96-119` | Keep `stock`, `crews`, `routeHorizon`, `step` and `simEfficacy` in the URL query (same pattern as the Phase 1 `?ward=&origin=` sync) so a reload keeps the scenario. | e2e: set stock 30 and step 3, reload, then the slider shows 30 and step 3 is active. |
| L7 (QA Q8) | `apps/api/app/core/command_requests.py` (`PlanLabel`) | Reject control characters (`\u0000-\u001f`, `\u007f`) and bidi overrides (`‪-‮`, `⁦-⁩`) in plan labels with 422. | `POST /plans` with label `"a‮b"` returns 422; `"Monsoon plan ৬০%"` returns 201. |
| L8 (QA Q9) | `apps/api/app/features/dispatch/service.py` | When `plan_id` is set and the request's `origin_week` differs from the plan's `origin_week`, return 422 `origin-mismatch` (applies to notices and brief). | A plan at 2024-08-05 plus a notice request with origin 2020-08-03 returns 422. |
| L9 (QA Q10) | `apps/web/src/features/command/PlanCompareDrawer.tsx` | Show each plan's kind, scope, stock and created time in the selectors. Add `role="dialog"`, `aria-modal="true"` and `aria-labelledby`. | axe 0 violations with the drawer open; the selector text includes the scope. |
| L10 (QA Q15) | `apps/web/src/features/command/StepSimulate.tsx`, `StepDispatch.tsx` | Crew input range label matches the slider maximum (or let the slider reach 300). Step 5's default wards come from the current scope only. | e2e: scope Dhaka South, then every default dispatch ward starts `DSCC_`. |
| L11 (QA Q11) | `apps/web/e2e/{offline,dashboard,command,console-features}.spec.ts` | Replace conditional `if (count() > 0)` blocks, `waitForTimeout` and non-retrying `expect(await …)` with web-first assertions. The Lime check uses `helpers.assertZeroLimeInDataView`. Replace `find(...)!` with an explicit `expect(...).toBeTruthy()`. | The suite stays green; temporarily removing a tested element locally makes the corresponding test fail (do not commit that). |

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs contract e2e`.
One commit per item: `version-onsite-final: fix(<area>): <item>`.
