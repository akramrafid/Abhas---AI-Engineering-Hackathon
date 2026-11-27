ROLE: QA · Gemini 4 Neon (XHigh) · hat ship (docs)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-qa-prep — correct wrong and weak claims in README and docs/qa-prep.md (review H3)
PRIORITY: P1 (HIGH; P7 Q&A = 30 points, P5 docs). Text edits only. Do it now; re-check lines marked **[after fix]**
once the named fix spec is merged.
SKILLS: demo-docs, verification-before-completion

## Owned paths
- `README.md` (line 77, plus the lines listed below)
- `docs/qa-prep.md`
- `docs/demo-7min.md` (only the lines listed below)

LEAD-owned files with the same error (LEAD edits these, not Neon):
- `.orca-team/reviews/REVIEW-REQUEST.md:82`
- `docs/algorithms-phase2.md:48`

## Corrections (each one was verified against code on `9688857`)

### C1 — `README.md:77` (wrong simulator formula, features and presets)
Replace the Simulate cell's description with:

> Model-driven LightGBM counterfactual. In each treated ward, the rain features that the model is monotone in are
> scaled by (1 − E(c)):
> - h = 2: `rainfall_lag_0/1/2`;
> - h = 3: lags 0–1;
> - h = 4: lag 0;
> - every horizon: `rain_sum_0_3`, and `rain_anomaly`, which is reduced by E(c) × that week's rain.
>
> The model is then re-run for h = 2–4. Efficacy is E(c) = E_max·(1 − e^(−k·c)), with assumed presets
> (E_max, k): low (0.25, 0.35), base (0.40, 0.50), high (0.55, 0.70). Crews are placed greedily by marginal cases
> prevented, at most 5 per ward. With 10 crews at 2024-08-05: 90.56 cases prevented, band 48.61–112.55.

Source: `apps/api/app/shared/intervention.py:18-28` and `reduction()`. Keep the latency cell.

### C2 — `docs/qa-prep.md` Q4 ("Critical wards always fill first" is false)
Replace the last sentence with:

> The weight is tier × density factor, and the density factor is clipped to [0.5, 2]. So tier dominates unless the
> density gap is extreme: a Critical ward (8) can be outranked only by a High ward whose density factor is at least
> 2× its own, for example High at 2.0 (weight 8) against Critical at 0.5 (weight 4). Within a tier, denser wards come
> first. We chose a product rather than strict tier-first ordering because the brief asks to prioritise "high-risk,
> high-density wards" together.

### C3 — Q3 (rounding claim) **[after fix p2-fix-allocation-integer]**
Replace the answer with:

> Floors are integers (round-half-up of 20 % of need), so the LP vertex is already integral. The result is the exact
> integer optimum, with no rounding step that could favour a low-priority ward. Under floor scaling we apportion
> units one at a time (D'Hondt), so raising stock never lowers any ward. Hypothesis tests prove conservation, the
> bounds, permutation invariance, **strict monotonicity in stock_pct**, and optimality against brute force on small
> cities.

Until that fix is merged, say "LP-optimal, then largest-remainder rounding: within one unit per ward of the LP
optimum". Do not claim integer optimality or monotonicity before then.

### C4 — Q5 and Q1 numbers **[after fix p2-fix-beds-peak]**
"`21/21` beds" for DSCC_Ward_04 is a 3-week bed-week total against a capacity of 7. After the fix, re-measure the beds
figure and state "peak-week beds". If LEAD picks option B instead, write "21 bed-weeks over the 3-week window (about 7
beds at the peak week)". Apply the same change to `docs/demo-7min.md:17` ("21 beds needed").

### C5 — Q18 (overclaim about referral networks)
Replace the first sentence with:

> The brief requires overflow routing **within the same city**, and we have no inter-ward distances, so each city is
> its own pool. Moving patients between cities would need road travel times and referral agreements we don't have.

Keep the 61-unroutable numbers. Add:

> In shoulder weeks routing does move patients — for example 2024-08-12, h = 3: 5 transfers in 2 cities while 10
> patients stay unroutable — and an officer's capacity override immediately creates in-city transfers.

### C6 — Q21 ("never hallucinate a single number") **[after fix p2-fix-dispatch-fallback]**
After the fix, add one sentence:

> A ward that is not in the chosen plan returns 409 `ward-not-in-plan`; dispatch never builds a row the allocation
> didn't produce.

Until the fix is merged, this answer is false; do not use it on camera.

### C7 — Q20 and `README.md:205` ("zero external network calls") **[after fix p2-fix-offline-honesty]**
After the fix, the claim holds. Until then, qualify it: "except the optional 'Weather now' map layer, which calls
Open-Meteo from the browser and degrades to dataset weather".

### C8 — Q24 (supply refit claim)
Replace the `SupplyRatioSource` bullet with:

> Implement `SupplyRatioSource` over real CMSD or hospital consumption logs. `shared/supply.fit_ratios` already has an
> OLS-through-origin fallback, but `ml/fit_supply.py` deliberately refuses any dataset other than SHA `24fac543…` and
> requires a 100 % exact match. The real-data adapter needs its own fit script with residual quantiles.

### C9 — Q15 (wording)
Replace "under-stocked roughly 50% of the time" with:

> Ordering to the mean under-stocks a ward in a large share of weeks — for a right-skewed negative binomial, a bit
> under half the time.

Keep the rest.

## Test that proves the fix
- `grep -n "lags 1..4\|(1 - e)\|0.15 / 0.25" README.md docs/qa-prep.md` returns nothing.
- `grep -n "always fill first" docs/qa-prep.md` returns nothing.
- Every number left in Q1, Q5, Q11, Q16, Q18 and Q22 has a matching API response on the running app. Spot-check
  Q11 (`auto_crews=10` → 90.56) and Q18 (2024-08-12, h = 3 → 5 transfers).
- No **[after fix]** sentence is published before its fix commit is merged.

## Gate
Docs only. Commit as `version-onsite-final: docs(qa): correct simulator description and Q&A claims`.
