# Abhas Phase 2 — Technical Judge Q&A Prep (25 Hardest Questions)

Crisp, numbers-backed answers for onsite judging. Every number below was measured directly on `version-onsite-final` (`abhas-lgbm-1.1.2`, `data_as_of: 2025-12-29`).

---

## A. Constrained Allocation & Equity Floor (ADR-0010)

### 1. Why use a linear programme (HiGHS) for allocation when a single-budget weighted knapsack reduces to sorting by priority weight?
Two reasons: (1) **Explicit constraint guarantees** — the HiGHS LP directly enforces both the per-ward equity floor (`ℓ_i ≤ x_i ≤ d_i`) and city stock conservation (`Σ x_i ≤ S`) with auditable primal feasibility rather than ad-hoc nested loops; (2) **Extensibility** — municipal health offices routinely add multi-depot transfer caps, minimum hospital buffer sizes, or cross-resource bundling constraints, which drop straight into the LP matrix without rewriting the algorithm. At 60 wards across 5 cities (15 LPs + 10 greedy crews), total `solve_ms` is **134.4 ms** (`p95 = 139.3 ms`).

### 2. How does the 20% equity floor behave during an extreme shortage (e.g., 30% stock with a 50% equity floor)?
Each ward's integer equity floor is `f_i = min(d_i, ceil(floor_pct × d_i / 100))` so no ward ever dips below the promised 20% floor due to rounding. When `Σ f_i > S`, we apportion the `S` available units one at a time via exact rational D'Hondt (Jefferson) scaling proportional to `f_i` (capped at `f_i`, ties by priority weight then `ward_id`), set `floors_scaled: true` in the response so the operator sees the floor was compressed, and solve cleanly without raising an infeasibility error. Hand-solved test `A3` (`stock=30%`, `floor=50%`, demands `(100,100,100)`) yields exact `(30, 30, 30)` with `floors_scaled = true`.

### 3. How are fractional LP solutions converted to integer bags, kits, and beds without losing or inventing stock?
Floors are integers (ceiling of 20% of need, capped at demand), and available stock is computed by integer round-half-up `(stock_pct × Σ d_i + 50) // 100`, so the HiGHS LP vertex is already integral. The result is the exact integer optimum, with no rounding step that could favour a low-priority ward. Under floor scaling (`Σ f_i > S`) we apportion units one at a time (D'Hondt), so raising stock never lowers any ward. Hypothesis tests prove conservation, the bounds, permutation invariance, **strict monotonicity in `stock_pct`**, and optimality against brute force on small cities.

### 4. Why weight wards by `tier_weight × clipped_density_factor` instead of expected cases alone?
Expected cases alone can under-prioritize an accelerating **Critical** ward with high transmission density relative to a large **Medium** ward. The weight is tier (`Low = 1, Medium = 2, High = 4, Critical = 8`) × density factor, and the density factor is clipped to `[0.5, 2.0]`. So tier dominates unless the density gap is extreme: a Critical ward (`8`) can be outranked only by a High ward whose density factor is at least `2×` its own, for example High at `2.0` (weight `8`) against Critical at `0.5` (weight `4`). Within a tier, denser wards come first. We chose a product rather than strict tier-first ordering because the brief asks to prioritise "high-risk, high-density wards" together (`A5`).

### 5. What triggers a `critical` deficit alert versus a regular `deficit`?
Per ADR-0010, any shortfall (`allocated < required`) in a **High** or **Critical** tier ward, OR any ward whose fulfilment drops below **50%** on any resource (`2 * allocated < required`), is classified as `critical` with explicit per-resource human-readable reasons. Under `stock_pct = 60%` on `2024-08-05` in Dhaka South, the top 7 highest-priority wards (including `DSCC_Ward_04` at `155/155` saline, `76/76` kits, and `10/10` **peak-week beds**) reach 100% fulfilment while 13 lower-priority Critical wards flag `critical` deficit with exact shortfall counts (e.g., `DSCC_Ward_07` receives `29/67` saline, `14/33` kits, and `1/5` peak-week beds).

---

## B. Greedy Spraying-Crew Assignment (ADR-0011)

### 6. When is greedy marginal crew placement provably globally optimal, and what happens if LightGBM breaks concavity?
When every ward's marginal benefit sequence `m_i(c) = B_i(c) − B_i(c−1)` is non-increasing (diminishing returns), assigning each next crew to `argmax_i m_i(c_i + 1)` is provably globally optimal by a standard matroid/discrete-concavity exchange argument. Because piecewise-constant LightGBM decision trees can occasionally exhibit a non-concave step between tree split thresholds, `greedy_crews` explicitly monitors every evaluated marginal pair: if `m_i(c) > m_i(c−1) + 1e-9` is ever observed, it flips `approximate = True` and reports `crew_method: "greedy (approximate)"` in the API response instead of silently claiming global optimality.

### 7. Why cap spraying crews at 5 per ward, and how are ties broken?
Beyond 5 crews in a single ward, marginal breeding-water clearance saturates (`E(5) = 0.367` of `E_max = 0.40` under base preset — 91.8% of ceiling) and operational logistics crowd out field coverage. Ties break deterministically by **priority weight descending**, then **`ward_id` ascending**. Total crews assigned always equals `min(total_crews, 5 × len(wards))`.

### 8. How do you guarantee `auto_crews = N` in the Simulator produces the exact same placement as `total_crews = N` in Allocation?
Both `AllocationService` and `SimulatorService` delegate to the **single shared function** `app.shared.intervention.assign_crews_for_wards(...)` using identical per-city priority weights over `h ∈ {2, 3, 4}` and the same `CounterfactualForecaster` batch evaluation. Automated integration test `test_wp3_4_5_auto_crews_matches_allocation_crew_placement` asserts exact dictionary equality (`sim_crews == alloc_crews`) for `N = 10` on `2024-08-05`.

---

## C. Model-Driven Monotone Counterfactual Simulator (ADR-0013)

### 9. Why not simply multiply predicted cases by `(1 − E(c))` instead of re-running LightGBM?
Because a flat multiplier ignores the non-linear interaction between rainfall, water-logging index, sanitation score, temperature, and seasonality learned by LightGBM. Two wards with identical baseline cases can have very different rainfall sensitivity: spraying a ward whose surge is driven by recent monsoon rain (`rain_sum_0_3`, `rain_anomaly`) prevents far more cases per crew than spraying a ward driven purely by baseline endemic crowding. Re-running the actual LightGBM boosters (`h = 2, 3, 4`) captures that heterogeneity directly.

### 10. How do you mathematically guarantee that adding spraying crews can NEVER predict MORE dengue cases?
During Phase 1 training (`ml/train.py:monotone_constraints_for_horizon`), LightGBM enforced `+1` monotone constraints on the exact causal rainfall features for each horizon (`MONOTONE_RAIN_FEATURES[2/3/4]`). At simulation time, `apply_reduction(...)` reduces ONLY those exact `+1`-constrained features (scaling positive rain lags/sums by `1 − E(c)` and subtracting `E(c) × rainfall_lag_0` from `rain_anomaly`) while leaving every unconstrained feature untouched. A CI test asserts `MONOTONE_RAIN_FEATURES == ml/train.py`, and test `T3` verifies `counterfactual ≤ baseline` across **all 60 wards × 3 horizons × 3 presets × 3 crew levels** (1,620 checks) with zero violations.

### 11. Where do the efficacy parameters (`E_max`, `k`) come from? Are they fitted to data?
**No — and we state that explicitly in every API response and UI panel.** The dataset has zero vector-control or spraying intervention labels, so any "fitted" efficacy would be fabricated. We document three transparent operational presets in ADR-0013 (`low: 0.25/0.35`, `base: 0.40/0.50`, `high: 0.55/0.70`) and always return the full **`[low, high]` sensitivity band** per ward and in totals. On `2024-08-05` with `auto_crews = 10`, the base estimate is **90.56 cases prevented**, with a transparent sensitivity band of **[48.61 – 112.55] cases prevented** (`26.99` beds avoided, `215.99` saline bags avoided).

### 12. Why does the counterfactual simulator evaluate horizons `h = 2, 3, 4` and exclude `h = 1`?
Biologically, *Aedes aegypti* larval maturation plus extrinsic and intrinsic dengue incubation takes roughly **14–21 days**. Larviciding breeding water today cannot prevent patients already infected who will present at clinics in week `+1`; its measurable impact begins at weeks `+2` to `+4` (the exact window where lagged rainfall correlation peaks at `r = 0.468` in week `+3`).

### 13. Does running counterfactual simulations pollute the forecast cache or slow down the UI?
Never. `ForecastEngine.counterfactual_grid(...)` never writes to `predictions_cache` (verified by SQLite row-count assertion in `test_wp3_6`), never mutates raw observations, and runs fast `raw_score=True` vectorized LightGBM inference (skipping unnecessary TreeSHAP during counterfactual sweeps) — delivering **10-ward simulations in `45.6 ms` p95** (17× under the 800 ms target) and **60-ward `auto_crews=10` in `224.6 ms` p95**.

---

## D. Supply Conversion Ratios & Newsvendor Quantiles (ADR-0009)

### 14. How were the supply ratios (`2.385` saline, `1.164` kits, `0.298` beds per case) derived?
Our read-only profiler (`apps/api/scripts/profile_onsite.py`, `docs/data-profile-onsite.md`) inspected all **31,320 rows** of the onsite dataset (SHA-256 `24fac543...ef9b0`) and discovered that the dataset's three supply columns are deterministic integer roundings (`floor(c × dengue_cases + 0.5)`) with exact narrow valid intervals: `2.385`, `1.164`, and `0.298` reproduce **31,320 / 31,320 rows (100.00%)** across all 5 cities and all 10 years. `ml/fit_supply.py` verifies the dataset SHA-256 and 100% row-match before emitting `apps/api/config/supply_ratios.json`, and `/readyz` fails closed (`503`) if tampered.

### 15. Why convert the P80 / P90 case quantile into supplies instead of multiplying the mean forecast by the ratio?
Ordering to the mean under-stocks a ward in a large share of weeks — for a right-skewed negative binomial, a bit under half the time — which is unacceptable under asymmetric stockout costs. Following classic newsvendor inventory sizing, we match the first two moments of summed window cases `N = Σ_h N_h` using each horizon's 2023-calibrated Negative Binomial dispersion `r_h` (falling back to Poisson when `V ≤ M`, tests `S1–S4`) to take **P80** for consumable saline and kits, and take the **peak single-week P90** across the window (`max_h Q_0.90(N_h)`) for reusable hospital beds (so bed demand is on the exact same weekly scale as overflow routing), before applying the dataset's `round_half_up` rule.

---

## E. Hospital Bed Capacity & Overflow Routing (ADR-0012)

### 16. The onsite dataset has no hospital bed capacity column. How did you avoid inventing arbitrary numbers?
We explicitly disclose that capacity is absent in the dataset (`ward_capacity.json` carries `"assumption": "Derived: the dataset has no capacity column. Replace with real hospital capacity before deployment."`). We derived a reproducible, leakage-free baseline strictly on training years **2016–2022**: `κ_i = max(1, ceil(1.10 × P95(weekly hospital_beds_required, 2016–2022)))`, giving **3–7 beds per ward (284 beds total across 60 wards)** with zero use of 2023–2025 data. Furthermore, the UI and API accept per-ward **`capacity_overrides`** so an officer can enter actual hospital bed counts on the spot and re-route immediately (`solve_ms = 12.6 ms`).

### 17. Why use two-stage optimisation (min-max utilisation then min-arcs MILP) for overflow routing?
Stage 1 ensures **equity of clinical load**: no ward is left at 180% overload while another ward in the same city sits at 105%. Stage 2 then selects, among all plans achieving that exact minimum peak utilisation `u*` and maximum patient placement `P* = min(Σ D, Σ H)`, the plan with the **fewest distinct ward-to-ward transfer arcs** — because every active arc represents a separate ambulance coordination channel and clinical hand-off (`R1`, `R2`).

### 18. Why are patients never routed across cities (e.g., Dhaka North to Dhaka South), and why does `2024-08-05` show 61 unroutable patients?
The brief requires overflow routing **within the same city**, and we have no inter-ward distances, so each city is its own pool. Moving patients between cities would need road travel times and referral agreements we don't have (`R3`). On peak monsoon week `2024-08-05` (`horizon = 3`, `P90`), all 5 cities simultaneously exceed 120% of historical baseline capacity (`345` beds required vs `284` derived beds), producing **61 honestly reported unroutable patients** (`21` DNCC, `19` DSCC, `10` CCC, `6` GCC, `5` NCC) — an explicit signal to activate temporary field wards rather than hiding overflow. In shoulder weeks routing does move patients — for example `2024-08-12`, `h = 3`: **5 transfers in 2 cities** (`3` DNCC, `2` CCC) while **10 patients stay unroutable** — and an officer's capacity override immediately creates in-city transfers.

### 19. How fast is your MILP solver, and what stops it from hanging or failing on degenerate inputs?
Stage 1 runs an exact rational (`fractions.Fraction`) discrete max-heap water-filling algorithm (provably optimal by exchange argument, eliminating HiGHS MIP presolve errors on degenerate instances — caught and hardened via Hypothesis!). Stage 2 runs HiGHS MILP with tight per-arc bounds, degree cuts, a `2.0 s` wall-clock `time_limit`, a 1,500-node limit, a `presolve=False` retry, and a deterministic northwest-corner fallback. Across all 60 wards in 5 cities, full routing completes in **`12.6 ms` (`p95 = 18.4 ms`)**.

---

## F. Offline Resilience, Dispatch Integrity & Security (ADR-0014, ADR-0015, ADR-0016)

### 20. What actually happens if the internet drops mid-crisis inside a municipal health office?
Every core workflow — forecasting, allocation, overflow routing, counterfactual simulation, bilingual SMS/WhatsApp/A4 brief generation, and the SQLite plans log — executes **100% locally on CPU** with zero external dependencies and zero browser-side third-party weather calls. `ABHAS_OFFLINE=1` acts as an instant kill switch; without it, the browser header and provenance strip react immediately to `navigator.onLine` (`Offline (network)`) while a background API daemon probe (2 s TCP timeout, never on startup or request paths) detects outages within ≤ 30 s and switches `"offline": true`. External clients (Open-Meteo, Gemini, Claude) enforce 2 s connect timeouts and 3-failure / 60 s circuit breakers, and the web console serves self-hosted fonts/icons/portraits plus a bundled GeoJSON/SVG map fallback. Proven automatically by `npm run offline:check` (**223/223 API tests under socket guard + 3/3 Playwright offline tests covering all 5 Command Center steps and the Risk Map weather layer, 0 external calls**).

### 21. How do you guarantee that dispatch SMS/WhatsApp/HTML notices never hallucinate a single number or inject XSS?
Zero LLMs touch Phase 2 dispatch. Every channel is rendered deterministically from one validated `NoticeFacts` object (`features/dispatch/templates.py`). A ward that is not in the chosen plan returns `409 ward-not-in-plan` (and a mismatched `origin_week` returns `422 origin-mismatch`); dispatch never builds a row the allocation didn't produce. Automated tests extract every numeric token (mapping Bangla digits `০–৯` to ASCII `0–9`) from SMS, WhatsApp, and `<main>` HTML and assert 100% membership in `NoticeFacts`. Every dynamic string in HTML briefs is escaped with `html.escape(..., quote=True)` (test `D6` verifies `<script>x</script>` renders inert), briefs carry a strict `Content-Security-Policy` header (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'`), and briefs contain zero `http://` or `https://` URLs.

### 22. Why do English SMS notices fit in 1 segment while Bangla SMS uses 2–3 segments?
Per 3GPP TS 23.038 (GSM 03.38), pure ASCII/GSM-7 characters pack **160 septets** in 1 segment (153/seg multipart, extension characters counting 2 septets), whereas Unicode Bangla scripts require **UCS-2** encoding (**70 characters** in 1 segment, **67/seg** multipart). Our classifier (`classify_sms`, tests `D1–D5`) accurately computes encoding, character/septet count, and segment count — keeping every Dhaka South English SMS in **1 segment (107–147 chars)** and every Bangla SMS in **2–3 segments (122–162 chars)** so health offices know exact gateway SMS billing upfront.

---

## G. Limitations, Governance & Real DGHS Transition Plan

### 23. What are the biggest honest limitations of Abhas today?
Four transparent limits: (1) **Simulated challenge dataset** — supply ratios are exact synthetic multipliers and ward coordinates are approximated around city centroids; (2) **Derived bed capacity** — `ward_capacity.json` estimates capacity from 2016–2022 P95 demand because real hospital bed counts are absent; (3) **Uncalibrated intervention efficacy** — `E(c)` presets are stated assumptions until field spraying outcomes are logged; (4) **Weekly cadence** — inputs operate at ISO-week granularity rather than daily clinic admissions.

### 24. How would Abhas transition to real DGHS / DNCC / DSCC operations without a rewrite?
Because Abhas uses **Hexagonal Ports & Adapters (ADR-0001)** enforced by `gates.mjs slices` (`14 API slices · 12 Web slices · 0 violations`), transitioning to production requires swapping only adapters while keeping the domain math untouched:
- **`ObservationRepository`:** point `DATABASE_URL` to managed PostgreSQL (Alembic `0001`+`0002` already Postgres-compatible) fed by weekly DGHS/IEDCR MIS case ingestion.
- **`BedCapacitySource`:** replace `config/ward_capacity.json` with live DGHS hospital bed registry counts (already overridable per ward via API/UI).
- **`SupplyRatioSource`:** implement `SupplyRatioSource` over real CMSD or hospital consumption logs. `shared/supply.fit_ratios` already has an OLS-through-origin fallback, but `ml/fit_supply.py` deliberately refuses any dataset other than SHA `24fac543…` and requires a 100% exact match. The real-data adapter needs its own fit script with residual quantiles.
- **Dispatch & GIS:** wire municipal bulk-SMS gateway webhooks onto `DispatchResponse.notices` (already GSM-7/UCS-2 metered) and drop official BBS/DNCC GeoJSON ward polygons into `apps/web/public/`.

### 25. How is every operational decision audited after an outbreak?
Every saved plan writes an **append-only** record (`plans` + `plan_runs`, Alembic `0002`, no `PUT`/`DELETE`) capturing validated `inputs_json`, full `outputs_json`, `headline_json`, `solve_ms`, `model_version`, `git_sha`, `data_as_of`, and `offline` flag. Officers can compare any two historical runs side-by-side via `GET /api/v1/plans/compare` (even across different plan kinds) and trace every number in a printed A4 commissioner brief back to the exact commit SHA and model version.

---

### 26. Why include a two-number early-action trigger if Abhas already runs LightGBM? (ADR-0020)
Field resilience and honest benchmarking. The clipboard rule — **"act when 2-week rain > 80 mm AND `water_logging_risk_index` ≥ 0.30"** — is fitted strictly on **2016–2023** (zero hold-out peeking) by maximising the Peirce skill score for predicting High risk (`≥ 8` cases) 3 weeks ahead, and is printed directly on every commissioner brief (EN & BN) so officers can act even with no laptop or server. On the locked **2024–2025 hold-out** (`6,300` ward-weeks, `713` High weeks), the zero-model rule achieves **94.1% hit rate**, **63.4% FAR**, **0.733 Peirce skill score**, and **6.0-week median wave lead time** (Q25 = 3w, Q75 = 8w, covering 136/158 waves). Scoring Abhas LightGBM (`h = 3`) on the exact same hold-out achieves **0.800 Peirce skill score** (`+0.068`), slashes FAR from **63.4% → 50.5%** (`−13.0` percentage points), and cuts **496 false-alarm ward-weeks** (1,324 vs 1,835 alerts) while covering **156/158** outbreak waves — proving what the full ML model earns over a strong zero-compute baseline.

### 27. Why choose the trigger cut-offs with Peirce skill score instead of F1 or accuracy? (ADR-0020)
Outbreak weeks (`≥ 8` cases) are a minority (`713 / 6,300 = 11.3%` on 2024–2025). Accuracy rewards never alerting (`88.7%` by doing nothing), and F1 shifts with base-rate prevalence. The **Peirce skill score** ($\text{PSS} = \text{Hit Rate} - \text{False-Alarm Rate}$) is base-rate invariant and standard in meteorological early warning: random or always-on rules score `0.0`, while our frozen `(80 mm, 0.30)` rule scores **`0.733`** and Abhas LightGBM scores **`0.800`** on unseen years. We also restrict `W` to non-vacuous drainage cutoffs (`≥ 0.30`, above the minimum ward index `~0.22`) so both clauses of the rule actively screen wards.

### 28. Are the structural-fix numbers ("8.5% fewer cases", "34 cases/yr") real causal estimates? (ADR-0021)
**No — and both `GET /api/v1/planning/structural` and the Command Center UI display the mandatory disclaimer verbatim:** *"associations in simulated data, not causal real-world estimates."* In this dataset, `water_logging_risk_index` and `sanitation_score` are static per-ward attributes with no capital-project intervention labels. To expose functional-form uncertainty honestly, we report **both** a log-link Poisson GLM (`rainfall_lag_2..4` + the three ward traits, fit on 2016–2023) **and** a LightGBM partial-dependence cross-check (shifting only the target trait), each with **500-resample ward-year cluster bootstrap 95% CIs**:
- **`−0.1` water-logging:** GLM **`8.48%` `[7.86, 9.13]%`** vs LightGBM PD **`6.54%` `[6.07, 6.96]%`** fewer cases/season (`−0.2`: GLM **`16.24%`** vs PD **`13.05%`**).
- **`+0.1` sanitation:** GLM **`3.37%` `[2.56, 4.15]%`** vs LightGBM PD **`1.74%` `[1.57, 1.91]%`** fewer cases/season (`+0.2`: GLM **`6.45%`** vs PD **`3.12%`**).
Both estimators agree in direction across every trait; real municipal capital planning would replace these simulated associations with longitudinal DGHS surveillance and pre/post drainage audit data.

### 29. How does a City Corporation Mayor use the "Build vs Send" table? (ADR-0021)
It pairs **permanent capital drainage fixes ("build")** against **recurring monsoon spraying crews ("send")** on the same scale: cases prevented per year vs simulator 1-crew peak-season ROI (`2024-08-05`, base preset). The top three drainage-leverage wards for a `−0.2` water-logging reduction are:
1. **`CCC_Ward_03` (Chattogram):** **`34.2` cases/yr** (GLM `[31.9, 36.8]`; PD `30.8`) vs **`9.68` cases/crew** → equivalent to **`3.54×`** peak crew deployments *every year*.
2. **`DNCC_Ward_12` (Dhaka North):** **`33.7` cases/yr** (GLM `[31.4, 36.2]`; PD `26.1`) vs **`7.61` cases/crew** → **`4.43×`** peak crew deployments/yr.
3. **`DSCC_Ward_04` (Dhaka South):** **`32.9` cases/yr** (GLM `[30.6, 35.3]`; PD `39.1`) vs **`9.61` cases/crew** → **`3.42×`** peak crew deployments/yr.
Planners direct multi-year drainage budgets to chronic `Build + Send` hotspots while deploying mobile crews to acute rainfall spikes citywide.
