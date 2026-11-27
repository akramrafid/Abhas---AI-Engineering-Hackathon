# Phase 2 final review — 2026-11-27 — reviewer: claude/opus-5.5 (max)

Range: `phase1-final..version-onsite-final` at **`9688857`**. This covers every work package: WP0, WP0b, WP1–WP6, the
data profile, hardening up to `eb12315`, and the docs, exports and REVIEW-REQUEST commits. The review started at
`c5a8195`. Findings that the team fixed while it was running are listed below as fixed and were re-verified on
`9688857`. Authors: Gemini 4 Neon (XHigh).

**Verdict: FIX-BLOCKERS** (1 BLOCKER, 3 HIGH, 3 MEDIUM, 6 LOW; 2 found during the review and already fixed)

The maths core is strong:
- The supply constants, overflow routing and contracts all check out.
- Every hand-solved case passes exactly (A1–A5, R1–R2).
- On 300 random cities, routing reaches the brute-force minimum of the maximum utilisation.
- The simulator re-runs the real model.
- Every simulator and allocation number quoted in `docs/qa-prep.md`, README and `docs/demo-7min.md` reproduces
  exactly on `9688857`.

What blocks:
- **Dispatch invents numbers (B2).** It still makes up supply numbers and case counts for any ward missing from the
  chosen plan, and presents them as model output. This was reproduced on `9688857`.
- **Integer allocation (H1).** It is neither optimal nor monotone in the stock slider, and its property test was
  weakened to hide that.
- **Route step text (H2).** At the demo date it says every ward is within capacity while 61 patients have no bed.
- **Docs (H3).** README and `docs/qa-prep.md` state a wrong simulator formula, wrong presets and wrong features, plus
  several overclaims.

## Evidence (read-only; detached scratch worktrees outside the repo)

- **pytest.**
  - At `c5a8195`: 184 passed, 3 failed. Two failures were readyz test drift, fixed by `c98cc25`. The third
    (`test_py_runner_reports_clear_api_port_in_use_error`) fails only because the scratch worktree has no `.venv`.
  - At `6749549` with `ABHAS_OFFLINE=1`: 200 passed, plus that same 1 env-only failure. The socket guard reported
    zero non-loopback connections.
  - At `9688857`: see the addendum at the end.
- **Gates.**
  - `gates.mjs slices`: PASS.
  - OpenAPI drift between the live `create_app().openapi()` and `contracts/openapi.json`: none.
  - Branches `p2-wp4` and `p2-wp5` merged with no conflicts (checked with `git merge-tree` before their merge).
- **Independent maths script.**
  - A1–A5, R1 and R2 exact.
  - Routing, 300 random cities checked against brute force: optimal u*, conservation, no ward that both sends and
    receives, unroutable = max(ΣD − ΣH, 0). **0 failures.**
  - Allocation: **85 of 400** cities are not integer-optimal, **29 of 300** break slider monotonicity, and
    `available_stock` gives **392** half-up mismatches.
  - End to end, Dhaka South, 2024-08-05, stock 30 %:
    - totals: saline 2072 → 622, kits 1013 → 304, beds 289 → 87;
    - deficit levels recomputed independently: all match;
    - output is deterministic.
- **Latency** (warm, local):

  | Call | p95 |
  |---|---|
  | allocation, scope all, no crews | 47 ms |
  | overflow, scope all | 16.5 ms |
  | overflow with 60 overrides | 303 ms |

  The team measured allocation with 10 crews at 139 ms. The model is loaded once (`adapters/runtime.py:48`).
- **Numbers re-checked on `9688857`** (they match the docs):
  - `auto_crews=10`: 90.56 cases prevented, band 48.61–112.55, 26.99 beds avoided, 215.99 saline avoided;
  - DSCC_Ward_04 at stock 60 %: 53.38 cases, saline 155/155, beds 21/21;
  - `total_crews` 1–4 and `auto_crews=1`: **200** (B1 fixed).
- **Bounds.** These all return 422: stock 29 / 101 / 50.5, crews 301, `h_end < h_start`, service_level 1.0, floor 51.
- **Supply traceability.** `config/supply_ratios.json` = data profile = TASK.md: 2.385 / 1.164 / 0.298, `row_match`
  1.0, SHA guard at `ml/fit_supply.py:135`.
- **Simulator.**
  - `counterfactual_grid` re-runs `booster.predict` on reduced feature rows. The `raw_score=True` fast path is the
    same model, without SHAP.
  - It never writes the prediction cache.
  - Test T3 checks 60 wards × 3 horizons × 3 presets × 3 crew levels on raw outputs.
- **Brief HTML.** `html.escape(…, quote=True)` on every dynamic string; no external URLs.
- **PDF notes to AI assistants.** Not acted on: no "BLUEPINE" in README or anywhere else in the repo.

## Fixed during the review (re-verified on `9688857`)

- **B1 — `greedy_crews` look-ahead.**
  - The fault, found by this review on `6749549`: `optimizer.py:431-435` asked for the next marginal past
    `max_c = min(cap, total_crews)` (`intervention.py:131`), which raised `KeyError`. `total_crews=1` and
    `auto_crews=1` returned 500.
  - **Fixed in `b601ccd`** by adding the guard `(step_idx + 1) < steps`, with a regression test. Verified: crews 1–4
    and auto 1 now return 200.
- **CI drift.** `c5a8195` added readyz checks without updating two tests. Fixed in `c98cc25`.

## Findings

### BLOCKER

**B2 — Dispatch invents case and supply numbers for wards missing from the chosen plan.**
- **Where:** `apps/api/app/features/dispatch/service.py:109-164` (`_fallback_row_for_ward`), called at `:328` and
  `:403`.
- **Defect:** when a ward is not in the allocation outputs, the code builds a row from a template. It takes the first
  ward's numbers × density / 45,000 (default 24 cases, supplies 60 / 30 / 8) and applies its own tier cut-offs
  (42 / 24 / 10).
- **Reproduced on `9688857`:**
  1. Save a Dhaka South allocation plan (`POST /plans`, stock 60).
  2. Request `POST /dispatch/notices {"ward_ids":["GCC_Ward_01"],"plan_id":<that plan>}`. It returns 200 with:
     - **72.1 predicted cases;**
     - **saline 209 / 125, kits 103 / 62, beds 28 / 17;**
     - deficit level `critical`;
     - a pre-written emergency instruction ("Deploy emergency larviciding … escalate supply deficit requests…").
  3. The real allocation for GCC_Ward_01 is **37.6 cases, saline 110 / 110, beds 15 / 15, no deficit**.
  4. `GET /dispatch/brief/GCC_Ward_01.html?plan_id=…` also returns 200 with the invented numbers.
- **Failure scenario:** the officer-facing SMS, the WhatsApp message and the printed commissioner brief carry made-up
  numbers and a false emergency. The number-faithfulness test passes vacuously, because the facts are the invented
  row.
- **Docs affected:** this contradicts `docs/qa-prep.md` Q21 ("never hallucinate a single number") and TASK.md ("no
  mocked or hardcoded outputs").
- **Fix:** `p2-fix-dispatch-fallback.md`.

### HIGH

**H1 — Integer allocation is not optimal and not monotone in stock %; the property test was weakened.**
- **Where:** `apps/api/app/shared/optimizer.py:240-254`, `:298-303` and `:61`, plus
  `apps/api/tests/shared/test_optimizer.py:109`.
- **Rounding:** the solver puts fractional floors φ·dᵢ into the LP, then applies largest-remainder rounding, which
  ignores priority.
  - Example: d = (8, 2), w = (8, 1), stock 55 %, floor 35 % gives (5, 1); (6, 0) is better.
  - Largest remainder is also not monotone in the total. Example: d = (28, 23, 16, 26, 21, 22), stock 65 % → 70 %
    lowers ward 6 from 5 to 4.
  - Measured: 85 / 400 suboptimal, 29 / 300 non-monotone.
- **Weakened test:** `docs/algorithms-phase2.md` §2 says raising stock never lowers a ward. The Hypothesis test was
  relaxed to `x_hi + 1 >= x_lo`.
- **Stock rounding:** `available_stock` uses Python `round()`, which rounds halves to even on a float, so 30 % of 15
  gives 4 instead of 5. That is inconsistent with the round-half-up rule used everywhere else.
- **Failure scenario:** a ward loses a unit when the judge raises the slider. "Is the integer plan optimal?" currently
  has the answer no.
- **Fix:** `p2-fix-allocation-integer.md`. The algorithm was validated outside the repo: 0 / 213,000 slider steps
  non-monotone, 0 suboptimal against brute force, and A1–A3 unchanged.

**H2 — The Route step says the opposite of the truth at the demo date.**
- **Where:** `apps/web/src/features/command/StepRoute.tsx:123-131`.
- **Data:** at 2024-08-05 with h = 3, every city has zero headroom. The result is 0 transfers and 61 unroutable
  patients (21 / 19 / 10 / 6 / 5).
- **UI defect:** whenever `transfers.length === 0`, the Sankey panel prints "No intra-city overflow transfers required
  … all wards remain within bed capacity".
- **Failure scenario:** `docs/demo-7min.md` (2:40–3:40) opens Step 3 at exactly this state and says "61 unroutable"
  while that sentence is on screen, before the capacity override is applied. Rubric P2 gives full marks for a "clear
  deficit/headroom breakdown".
- **Fix:** `p2-fix-route-demo.md`. Keep the override beat in the demo script.

**H3 — Public docs state the simulator wrongly, and `docs/qa-prep.md` has several wrong or weak answers.**
- **README.md:77** says the simulator reduces "`lags 1..4`" with "`1 - (1 - e)^c`" and presets "`0.15 / 0.25 / 0.35`".
  All three are wrong. The code (`intervention.py`) uses:
  - E(c) = E_max·(1 − e^(−k·c));
  - presets as (E_max, k): low (0.25, 0.35), base (0.40, 0.50), high (0.55, 0.70);
  - reduced features per horizon: h = 2: `rainfall_lag_0/1/2`; h = 3: lags 0/1; h = 4: lag 0; plus `rain_sum_0_3`
    and `rain_anomaly` at every horizon.
- **`.orca-team/reviews/REVIEW-REQUEST.md:82`** repeats the wrong presets.
- **`docs/qa-prep.md`:**

  | Question | Problem |
  |---|---|
  | Q4 | Says Critical wards "always fill first". False: weight = tier × density factor in [0.5, 2], so a dense High ward (4 × 2 = 8) outranks a sparse Critical ward (8 × 0.5 = 4). `docs/algorithms-phase2.md:48` has the same wording. |
  | Q18 | Claims each city corporation runs an independent referral network. That is an overclaim; the brief simply requires intra-city routing. |
  | Q21 | False until B2 is fixed. |
  | Q3 | Omits the rounding defect (H1). |
  | Q5 | Quotes "21 / 21 beds" for one ward that has 7 beds of capacity (M1). |
  | Q20 | "Zero external calls" — false until M2 is fixed. |
  | Q24 | Says `npm run fit:supply` would handle real data via OLS. In fact the CLI exits on any other dataset SHA and requires a 100 % exact match. |

- **Fix:** `p2-fix-qa-prep.md`, which gives the corrected answer for each item.

### MEDIUM

**M1 — Allocation sums hospital beds over the 3-week window.**
- **Where:** `apps/api/app/features/allocation/service.py:200-212`.
- **Numbers at 2024-08-05:**

  | Measure | Beds |
  |---|---|
  | Allocation "required" (bed-weeks) | **873** |
  | Overflow, one week | **345** |
  | Capacity | **284** |

  DSCC_Ward_04 "needs 21 beds", but its capacity is 7 and its single-week need is about 7–8. The demo script says
  "21 beds needed for Ward 04".
- **Fix:** `p2-fix-beds-peak.md`. This needs a LEAD decision; peak week is recommended.

**M2 — The browser calls Open-Meteo directly.**
- **Where:** `apps/web/src/features/risk-map/components/RiskMapView.tsx:172-199`.
- **Defect:** the call bypasses the API cache and circuit breaker and ignores `NEXT_PUBLIC_ABHAS_OFFLINE`. That
  contradicts `README.md:144`/`:205` and `docs/qa-prep.md` Q20.
- **Fix:** `p2-fix-offline-honesty.md`.

**M3 — The offline end-to-end test can pass without exercising the Command Center.**
- **Where:** `apps/web/e2e/offline.spec.ts:169-176`.
- **Defect:** the walk is conditional (`count() > 0`) and makes no assertion per step.
- **Fix:** `p2-fix-offline-honesty.md`.

### LOW (one batch: `p2-fix-low-batch.md`)

- **L1** `apps/api/app/shared/routing.py:305,313`: the MILP has no `time_limit`.
- **L2** `apps/api/app/features/overflow/service.py:256`: overrides outside `scope` are silently ignored.
- **L3** `apps/api/app/adapters/gemini_chat.py:263-267,381-385`: the budget check runs after the breaker grants the
  half-open probe, so the slot can leak.
- **L4** Brief route `dispatch/router.py`: no CSP header.
- **L5** `apps/api/app/core/run_meta.py:76`: `git_sha` is read once and has no dirty flag. Restart the API after the
  final commit, before recording (P6 commit-hash rule).
- **L6** `CommandCenterView.tsx:96-119`: the scenario state is not in the URL, as the WP5 spec requires.

## Q&A risks

1. **"Why does a ward lose stock when I add stock? Is the integer plan optimal?"** (H1)
2. **"Ward 04 needs 21 beds but has 7, and the city needs 873 against 284?"** (M1)
3. **"Critical always first?"** No, density can reorder adjacent tiers (H3, Q4).
4. **"Which rain features does spraying change, and with what formula?"** README:77 is wrong (H3). The correct
   answer: lags 0–2 plus the 4-week sum and the anomaly, with E(c) = E_max(1 − e^(−kc)).
5. **"Show me a notice for a ward outside the plan."** It currently invents numbers (B2).
6. **"Your app claims zero external calls, but the weather layer calls Open-Meteo from the browser."** (M2)
7. **"Why does routing show nothing at the peak?"** Every ward's capacity comes from its own history and they all
   peak together. Shoulder weeks show transfers; verified weeks:

   | Origin | Horizon | Result |
   |---|---|---|
   | 2024-08-12 | 3 | 5 transfers in 2 cities, 10 unroutable |
   | 2024-07-01 | 3 | 6 transfers in 4 cities |

   The override beat demonstrates routing.
8. **"Why does ROI rank one-crew wards higher?"** Average against marginal gain; diminishing returns.
9. **"Does the commit hash in the video match?"** (L5)
10. **"Is the data real?"** It is simulated, as the model card says.

## Notes

- **Addendum — pytest at `9688857` with `ABHAS_OFFLINE=1`:** **210 passed, 1 failed**. The failure is the
  port-in-use test, which needs `.venv` and so fails only in the scratch worktree. The socket guard reported zero
  non-loopback connections. CI is green even though B2 is present, because no test asks for a ward outside the plan.
- Local `version-onsite-final` is ahead of `origin` (unpushed since `c5a8195`).
- `.orca-team/reviews/REVIEW-REQUEST.md` §5 item 3 must be corrected together with README:77. That file is
  LEAD-owned.
