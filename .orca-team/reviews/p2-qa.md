# Phase 2 SQA run — 2026-11-27 — three parallel QA lanes (claude/opus-5.5), consolidated by REVIEWER

Commit under test: `b4c2460` (branch `version-onsite-final`; `main` = `e2c5b7e` after PR #35 contains it). All three
lanes ran read-only against a fresh clone in a scratch worktree.

**The fresh-clone setup passes.** `npm run setup` took **104 s**, within the 3-minute limit, and needed zero keys.

**Verdict: FIX-BLOCKERS, unchanged from `p2-final.md`.** The QA run confirms every open finding from the code review:
- B2 dispatch fallback;
- H1 allocation rounding;
- H2 Route empty state;
- M1 beds over the window;
- M2 browser Open-Meteo call;
- M3 weak offline e2e test.

It adds **one MEDIUM security bug** (rate limit bypass), **two red gates** (contract, load), **four MEDIUM UX and demo
issues** and a batch of LOW items.

The demo happy path is solid:
- exploratory health score **85 / 100**;
- no crashes and no console errors;
- every pinned demo number reproduces;
- the crews=1 crash (B1) is confirmed fixed in the browser.

## Lane results

### Lane A — API and quality gates

| Step | Result |
|---|---|
| lint | PASS. ruff clean; eslint 0 errors, 1 warning (`LogoutConfirmDialog.tsx:86`, `window.location.assign`). |
| typecheck | PASS. pyright 0 errors; tsc clean. |
| test:api | PASS. 211 passed. |
| test:offline:api | PASS. 10 tests under `-m offline`, plus 211 under `ABHAS_OFFLINE=1` with the socket guard. |
| smoke:local | PASS. 6 / 6, but Phase 1 endpoints only. |
| db:check | PASS. up → down → up; 9 tables. |
| **test:contract** | **FAIL, exit 1.** 2,715 cases, 1 failure: ST201 on `POST /api/v1/chat/stream`, seed `50551620195904918134333368941541352245`. See Q3. |
| eval | PASS. 40 / 48, h2 MAE 0.991, h3 MAE 1.010, cov80 0.845, floors passed. |
| redteam | PASS. 30 / 30. |
| **load** | **FAIL, exit 99.** p95 513 ms and 418 ms against the 300 ms limit, with 0 % errors. The other lanes were sharing the host. Only Phase 1 endpoints are loaded. See Q4. |
| gates slices, contracts, migrations | PASS. |

About 190 bad-input probes on the Phase 2 endpoints all returned the correct 4xx problem+json naming the right field.
None returned 5xx, and none took longer than 300 ms. The following invariants and checks held:
- **Allocation.** Totals, bounds, determinism, and agreement between the per-city runs and scope "all".
- **Crew placement.** Allocation and the simulator place crews identically for N = 1, 2, 5, 13, 50, 150 and 300.
- **Simulator.** Counterfactual ≤ baseline and low ≤ base ≤ high, checked across 60 wards × 3 presets × 3 crew levels
  × 3 origins.
- **Overflow.** Conservation, no cross-city arc, and the unroutable formula.
- **Dispatch.** Facts equal the allocation rows when the plan's scope contains the ward.
- **Plans.** Compare deltas equal b − a.
- **Metadata.** Every response carries RunMeta.
- **Request limits.** Bodies of 70 KB and 2 MB get 413, nested JSON gets 400, and the rate limit returns 429 with
  `Retry-After`.

### Lane B — web build and automated end-to-end tests

| Step | Result |
|---|---|
| web lint | PASS. 0 errors, the same 1 warning. |
| web typecheck | PASS. |
| web build | PASS. 22 / 22 pages. Warning: "multiple lockfiles … inferred workspace root" (root and `apps/web/package-lock.json`). |
| `npm run e2e` | **PASS, 30 passed, 1 skipped** (the screenshot spec, by design). Run from a private copy, because a second `next dev` in the same folder blocks Playwright (see Q12). |
| `npm run test:offline:web` | **PASS, 3 / 3 strict**: zero external requests, `readyz.offline` true. |
| web unit tests | None exist. |

The suite is green, but several tests assert less than they claim (see Q11). Acceptance criteria without a real
end-to-end assertion:
- the slider re-solves within 1 s (a probe measured 547 ms);
- the Route values;
- the ROI ranking and the low–high band;
- the brief opened from the UI;
- the A/B table in the compare drawer;
- EN/BN on the Command tab;
- the 390 px layout (a probe found no overflow);
- keyboard use of the slider and stepper (a probe found both work);
- axe on steps 1–4 (a probe found 0 violations).

### Lane C — exploratory browser testing (gstack headless Chromium, 53 screenshots)

The health score is **85 / 100**:

| Area | Score |
|---|---|
| Console | 100 |
| Performance | 100 |
| Accessibility | 97 |
| Visual | 91 |
| UX | 77 |
| Content | 69 |
| Functional | 58 |

Numbers that match `docs/demo-7min.md`:
- DSCC_Ward_04: 53.4 cases, 155 / 76 / 21.
- Step 2 at 60 %: Ward 04 full, and 12 wards in deficit. The UI re-solves in 250–405 ms.
- Crews 0 / 1 / 10 all work.
- 61 unroutable patients.
- Auto with 10 crews: 90.6 cases prevented, band 48.6–112.5, GCC_Ward_03 leads with 9.81 per crew.
- English SMS: GSM-7, 111 characters, 1 segment. Bangla SMS: UCS-2, 126 characters, 2 segments.
- The brief is styled and its numbers match step 2.

Keyboard operation is complete, with roving tabindex on the stepper, arrow / Home / End on the slider, visible focus,
and Escape to close the drawer. No Lime appears in any data view.

## New findings

### MEDIUM

**Q1 — Any localhost client can bypass the rate limit with `X-Forwarded-For` (security).**
- **Where:** `apps/api/app/__main__.py:18` calls `uvicorn.run(...)` with uvicorn's defaults, which are
  `proxy_headers=True` and `forwarded_allow_ips="127.0.0.1"`. Uvicorn then rewrites `scope["client"]` from
  `X-Forwarded-For` before `RateLimitMiddleware._client_ip` (`apps/api/app/core/ratelimit.py:103`) runs, so the app's
  `TRUSTED_PROXIES` setting is bypassed.
- **Repro:** after 125 × `GET /api/v1/plans?limit=1`, the plain request returns 429, but the same request with
  `X-Forwarded-For: 203.0.113.1` returns 200. Every forged IP gets a fresh quota.
- **Fix:** `p2-fix-ratelimit-xff.md`.

**Q2 — The Command tab is mostly English in Bangla mode.**
- **Where:** `apps/web/src/features/command/Step*.tsx` has only 2–3 `bn ?` branches per step. `PlanCompareDrawer.tsx`
  and `ProvenanceStrip.tsx` have none.
- **Measured:** English-only lines against Bangla lines per step:

  | Step | English only | Bangla |
  |---|---|---|
  | 2 | 170 | 122 |
  | 3 | 224 | 2 |
  | 4 | 99 | 2 |
  | 5 | 13 | 3 |

  Step labels are mixed (for example "1 পূর্বাভাস Demand"). The judges will see the EN ↔ বাংলা toggle, so this is a
  visible gap.
- **Fix:** `p2-fix-bn-command.md`.

**Q3 — The `test:contract` gate goes red depending on the seed.**
- **Cause:** a body over 64 KB correctly gets `413 payload-too-large` (problem+json), but 413 is not declared in the
  OpenAPI responses, so Schemathesis reports "Schema-violating request accepted".
- **Fix:** declare 413 in the shared `PROBLEM_RESPONSES`, then regenerate the contracts. See `p2-fix-gates.md`.

**Q4 — The `load` gate is red, and it does not cover Phase 2.**
- **Measured:** p95 of 513 ms and 418 ms against the 300 ms threshold. The run was under contention, because other
  lanes were sharing the host.
- **Gap:** `tests/load/smoke.js` only hits Phase 1 endpoints.
- **Fix:** re-measure in isolation and add the Phase 2 endpoints. See `p2-fix-gates.md`.

**Q5 — The city cards say "Utilisation after 100 %" while patients are unroutable.**
- **Where:** `routing.summarise_city` defines after = Σ min(load, κ) / Σ κ. That is the ADR-0012 definition, written by
  LEAD; the code follows the spec.
- **Problem:** with zero transfers and 61 unroutable patients, every card reads 100 % and "Headroom 0", while the ward
  table shows 129–150 %. The demand that cannot be served disappears from the headline.
- **Fix:** show both "Beds filled 100 %" and "Demand / capacity 122 %", plus the unroutable count, on the card.
  Folded into `p2-fix-route-demo.md`.

**Q6 — Wrong "Highest expected cases" KPI on the dashboard at 2024-08-05.**
- **Observed:** the tile shows 20.0 for Ward 10, while the list beside it shows DSCC_Ward_06 at 21.0 and Ward_04 at
  20.6. It is correct at 2024-06-17.
- **Where:** `apps/web/src/components/dashboard/shell/useWorkspaceSignals.ts:43-46,73`. The tile takes `alerts[0]`
  from the "peak" map cells and filters them by alert tier, but the list uses a different measure or horizon.
- **Impact:** the printed ward brief includes the same wrong tile.
- **Fix:** `p2-fix-dashboard-kpi.md`.

**Q7 — The Offline badge does not react to Wi-Fi loss in the browser.**
- **Where:** the provenance strip shows "Offline" only when the API reports `offline: true`.
  - The API's probe flips within 30 s only for a real outage on the API host. In the demo, API and web run on the
    same laptop, so the API is local and stays "online".
  - The web app listens to no `offline` event and does no connectivity polling.
  - `?demo=1` already shows "Demo mode · offline" while online.
- **Impact:** the 5:40 offline beat in `docs/demo-7min.md` will not light the badge unless the API was started with
  `ABHAS_OFFLINE=1`.
- **Also:** in offline mode the Phase 1 "Live Open-Meteo" toggle still returns `source=live` (cached) data, and the
  Phase 1 header shows no Offline badge.
- **Fix:** folded into `p2-fix-offline-honesty.md`.

### LOW (added to `p2-fix-low-batch.md`)

- **Q8** `POST /plans` labels accept control and bidi characters (`\u0000`, `\n`, `‮`). They are stored and
  returned as-is, and do not reach the brief.
- **Q9** Dispatch with a `plan_id` silently ignores a conflicting `origin_week`. The response echoes 2020-08-03 while
  the facts come from the 2024 plan. It should return 422.
- **Q10** Compare drawer:
  - it does not show each plan's scope (a 20-ward plan is compared with a 60-ward plan);
  - the list is capped at `limit=50`;
  - "last saved plan" is global across users;
  - it has no `role="dialog"` or `aria-modal`.
- **Q11** Weak end-to-end tests, which can pass without exercising what they claim:
  - `offline.spec.ts:189-276`: `page.request` bypasses the route abort.
  - `offline.spec.ts:117`: images still loading skip the broken-image check.
  - `dashboard.spec.ts:458-464`: the assertion sits inside `if count() > 0`.
  - `dashboard.spec.ts:285-286`: a non-retrying `expect(await count())`.
  - `command.spec.ts:72-84`: the Lime check reads only `borderColor` and ignores fill and stroke.
  - `console-features.spec.ts:90-99`: `find(...)!` throws a TypeError instead of failing an assertion.
- **Q12** End-to-end isolation:
  - e2e and the test-mode API write to `data/abhas.db` (`apps/api/app/core/config.py:45`), adding 4 plans per run, so
    the demo drawer fills up with test plans.
  - Playwright `reuseExistingServer: false` combined with one `next dev` per folder means `npm run e2e` aborts while
    any dev server is running.
- **Q13** `npm run eval` rewrites 4 tracked files (`apps/api/evals/history.jsonl`, `report.md`, `results/eval.json`,
  `results/latest-heldout.json`), so a fresh clone ends up dirty.
- **Q14** Step 5 at 60 %: CCC_Ward_02 gets saline 14 / 72 = 19.4 %, below the stated 20 % floor. Fixed by the
  ceiling floors now required in `p2-fix-allocation-integer.md`.
- **Q15** Small UI items:
  - the Step 4 crew input says "1–300" but the slider stops at 60;
  - Step 5's default wards include CCC wards when the scope is Dhaka South;
  - the per-horizon table clips its Tier column at 1280 px;
  - "Ask Abhas AI" covers card corners;
  - scope is not kept in the URL;
  - `?tab=command` without `lang=` opens in the last-used language;
  - an early click before hydration is lost in dev.

## Demo-script mismatches (`docs/demo-7min.md`) — see `p2-fix-demo-script.md`

1. **Scope.** Step 1 says "select Dhaka South". With that scope, step 2 solves 20 wards and step 3 shows one city with
   19 unroutable, not 5 cities with 61. Keep **All cities**, or change the narration.
2. **Offline beat at 5:40.** Turning Wi-Fi off does not light the badge (Q7). Start the API with `ABHAS_OFFLINE=1` for
   that segment, or say exactly what changes on screen.
3. **Figures.** The band's upper bound is **112.5**, not 112.6, and beds avoided are **26.99**, not "27.0".
4. **Labels.** The button reads "Save as plan", not "Save Plan". "Compare plans" is in the provenance strip, not in
   Step 4.
5. **Route.** The script reads "61 unroutable" over the H2 sentence (see `p2-fix-route-demo.md`).

## Other observations (not defects in the code under test)

- **The repository now has a tag and a branch named `version-onsite-final`.** The tag points to `e2c5b7e` (the merge
  to main) and the branch to `b4c2460`.
  - `git log version-onsite-final` and `git merge version-onsite-final` resolve to the **tag** and print "refname is
    ambiguous". Use `heads/version-onsite-final` or `tags/version-onsite-final` explicitly.
  - Any script that passes the bare name (`LEAD_BRANCH`) to `git merge`, `git diff` or `gates.mjs merge` targets the
    tag.
- **A commit `1137a81` was made on the QA worktree's detached HEAD:** "feat: add evaluation history, metrics report,
  and results artifacts", author akramrafid, 15:16 +0600. It holds only the 4 eval files rewritten by
  `npm run eval` (Q13). It is on no branch and will be discarded with the scratch worktree. Its origin is unknown.
  Every QA lane was told not to commit; the human should check whether an IDE auto-commit picked up the worktree.
- At demo week 2024-08-05 all 60 wards are Critical, so tier weights do not differentiate; density alone orders the
  wards. This matches the model. Mention it in Q&A if asked why everything is red.

## Evidence

The report files are in the reviewer's scratchpad. They are not committed, because the screenshots are large.

| Lane | Location | Contents |
|---|---|---|
| A | `qa-reports/lane-a/` | Probe scripts and step logs |
| B | `qa-reports/lane-b/` | `lint.log`, `typecheck.log`, `build.log`, `e2e.log`, `offline.log`, `notes.md` |
| C | `qa-reports/lane-c/screenshots/` | 53 screenshots, including `29-cmd-step3-allcities.png` (H2, Q5), `42-dispatch-savedplan-b2.png` (B2), `43-cmd-step3-bn.png` (Q2), `05-dashboard-initial.png` (Q6), `52-offline-riskmap-map.png` (M2) and `61-online-api-browser-offline-event.png` (Q7) |
