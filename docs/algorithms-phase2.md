# Phase 2 algorithms — notation, plain words, hand-solved examples

_Owner: LEAD. Every example below was solved by hand and checked numerically with SciPy (HiGHS) outside the repo.
Neon turns each example into a test named after its ID (e.g. `test_alg_A1_priority_fill`). The team uses the plain-
words paragraphs in Q&A._

Constants used in the examples (the dataset's exact rule, ADR-0009): saline 2.385 bags/case, kits 1.164 kits/case,
beds 0.298 beds/case, applied as round_half_up(c × cases). Efficacy presets (ADR-0013): low E_max 0.25, k 0.35 · base 0.40, 0.50 · high 0.55, 0.70.

---

## 1. Supply conversion (`shared/supply.py`, ADR-0009)

**Notation.** For ward i and forecast weeks h in the window W = {h_start … h_end}, the model gives a mean μ_h and a
negative-binomial size r_h (from the horizon's calibration, variance μ + μ²/r). Window cases N = Σ_h N_h.
Moment matching: M = Σ μ_h, V = Σ (μ_h + μ_h²/r_h). If V > M, N ≈ NB(r_W, p) with r_W = M²/(V − M) and
p = r_W/(r_W + M); otherwise N ≈ Poisson(M). Planned cases Q_s = the s-quantile of N (s = 0.8 for saline and
kits). Because hospital beds are reused week to week, planned beds use the peak single-week quantile
Q_0.9,peak = max_{h ∈ W} Q_0.9(N_h). Planned supply = round_half_up(c × Q) = ⌊c·Q + 0.5⌋ — the same rule that
generated the dataset's supply columns.

**Plain words.** We forecast a range, not a point. To order supplies we take the number of cases we will not exceed
four weeks in five (beds: nine in ten), then multiply by how many bags, kits and beds each case has needed
historically. In this dataset that relation is exact: every one of the 31,320 rows equals round(c × cases).

| ID | Input | Working | Expected output |
|---|---|---|---|
| **S0** | Dataset rule, cases k = 0, 1, 2, 5, 10, 15, 20 | round_half_up(c·k) | (saline, kits, beds) = **(0,0,0), (2,1,0), (5,2,1), (12,6,1), (24,12,3), (36,17,4), (48,23,6)** — and 100 % of the 31,320 rows |
| **S1** | One week, μ = 10, r = 2 | V = 10 + 100/2 = 60 > M; r_W = 100/50 = 2. Q₀.₈ = 15, Q₀.₉ = 20 | saline round(2.385×15 = 35.775) = **36**, kits round(17.46) = **17**, beds round(0.298×20 = 5.96) = **6** |
| **S2** | Window h=2..4, μ = (4, 6, 8), r = 3 each | Window: M = 18, V = 56.667, r_W = 8.3793 → Q₀.₈ = 24. Peak week (μ = 8, r = 3): Q₀.₉ = 15 | saline round(57.24) = **57**, kits round(27.936) = **28**, peak-week beds round(0.298×15 = 4.47) = **4** *(window bed-weeks: Q₀.₉ = 28 → 8)* |
| **S3** | Window μ = (2, 3), r very large (V ≤ M) | Poisson(5); Q₀.₈ = 7 | saline round(16.695) = **17**, kits round(8.148) = **8** |
| **S4** | All μ = 0 | M = 0 | Q = **0** and every supply **0** (no division by zero) |

Property tests: Q_s is non-decreasing in s and in every μ_h; supplies are non-decreasing in Q.

---

## 2. Constrained allocation (`shared/optimizer.py`, ADR-0010)

**Notation.** City c, wards i with planned demand d_i (one resource at a time), tier weight t_i ∈ {1, 2, 4, 8}
(Low, Medium, High, Critical), density factor f_i = clip(ρ_i / median_c(ρ), 0.5, 2), weight w_i = t_i·f_i.
Available stock uses integer round-half-up: S = (stock_pct × Σ d_i + 50) // 100, target T = min(S, Σ d_i).
Integer equity floors use ceiling rounding: ℓ_i = min(d_i, ⌈equity_floor_pct · d_i / 100⌉) = min(d_i, (floor_pct · d_i + 99) // 100).
When Σ ℓ_i ≤ T, HiGHS solves
  maximise Σ w_i x_i  subject to  Σ x_i ≤ T,  ℓ_i ≤ x_i ≤ d_i
whose vertex is integral (one budget row + integer box bounds + integer RHS), yielding the exact integer optimum.
When Σ ℓ_i > T, T units are apportioned over the floors one unit at a time by D'Hondt / Jefferson (maximising ℓ_i / (x_i + 1),
ties by higher weight then lower ward_id, capped at ℓ_i) with `floors_scaled = true`, guaranteeing strict monotonicity in stock_pct.
Deficit: x_i < d_i. Critical: (tier ∈ {High, Critical} and x_i < d_i) or x_i/d_i < 0.5.

**Plain words.** Every ward first gets a guaranteed share (20 % of its need) so no one is abandoned. The rest of the
stock goes to the wards where it matters most: Critical before High before Medium before Low, and denser wards first
within a tier. Because there is one budget, the optimum simply fills the highest-weight wards completely before the
next; the LP makes that explicit and lets us add constraints later.

| ID | Input | Working | Expected output |
|---|---|---|---|
| **A1** | d = (100, 60, 40), w = (12, 4, 0.5) [Critical×1.5, High×1.0, Low×0.5], stock 50 %, floor 20 % | S = 100; floors (20, 12, 8) = 40; remaining 60 → highest weight first: ward 1 gets +60 | x = **(80, 12, 8)**; fulfilment 80 %, 20 %, 20 %; levels **critical, critical, critical** (ward 1 Critical < 100 %; ward 2 High < 100 %; ward 3 < 50 %) |
| **A2** | Same, stock 100 % | S = 200 = Σ d | x = **(100, 60, 40)**; all **none** |
| **A3** | d = (100, 100, 100), w = (8, 4, 1), stock 30 %, floor 50 % | S = 90; floors 150 > 90 → scale by 0.6 → 30 each | x = **(30, 30, 30)**, `floors_scaled = true`, all critical (30 % < 50 %) |
| **A4** | Largest remainder: values (2.4, 1.4, 1.2), total 5, ward_ids a, b, c | Floors (2, 1, 1) = 4; one unit left; remainders 0.4 (a), 0.4 (b), 0.2 (c); tie a/b → ward_id order | **(3, 1, 1)** |
| **A5** | Density factor, city median 40,000: ρ = 74,252 / 40,000 / 18,314 | 1.856 / 1.0 / 0.458 → clip | **1.856, 1.0, 0.5** |

Property tests: Σ x = min(S, Σ d); 0 ≤ x ≤ d; raising stock_pct never lowers any ward's allocation (monotone);
permuting ward order does not change the result.

---

## 3. Crew assignment (`shared/optimizer.greedy_crews`, ADR-0011)

**Notation.** B_i(c) = cases prevented in ward i with c crews (from the simulator). Marginal m_i(c) = B_i(c) − B_i(c−1).
Greedy: repeat total_crews times, give one crew to argmax_i m_i(c_i + 1) (cap 5 per ward; ties by priority weight,
then ward_id).

**Plain words.** Each next crew goes where it prevents the most extra cases. Because each extra crew in the same ward
helps a bit less than the one before (diminishing returns), picking the best next crew every time is provably the
best possible plan for the whole budget.

| ID | Input | Working | Expected output |
|---|---|---|---|
| **G1** | Two wards with B_A(c) = 20·E(c), B_B(c) = 10·E(c), base preset, 3 crews | Marginals A: 3.1478, 1.9092, 1.1580; B: 1.5739, 0.9546, 0.5790. Picks A (3.148), A (1.909), then B (1.574 > 1.158) | **A = 2, B = 1**, total prevented **6.6308** |
| **G2** | Same wards, 0 crews | — | **A = 0, B = 0**, prevented 0 |
| **G3** | Ward A capped at 2, 4 crews | After A reaches the cap, remaining crews go to B | **A = 2, B = 2** |

---

## 4. Overflow routing (`shared/routing.py`, ADR-0012)

**Notation.** In one city, required r_i, capacity κ_i ≥ 1, deficit D_i = max(r_i − κ_i, 0), headroom
H_j = max(κ_j − r_j, 0). Transfers t_ij ≥ 0 only from deficit wards to headroom wards, i ≠ j.
Stage 1 (LP): minimise u − ε·Σ t subject to Σ_j t_ij ≤ D_i, Σ_i t_ij ≤ H_j, and (r_i − out_i + in_i)/κ_i ≤ u.
Stage 2 (MILP): with u ≤ u* and Σ t ≥ placed*, integer t and binary arc indicators y_ij (t_ij ≤ D_max·y_ij),
minimise Σ y_ij. City utilisation before = Σ r/Σ κ; after = Σ min(load, κ)/Σ κ; unroutable = Σ max(load − κ, 0).

**Plain words.** First we spread overflow patients so that no ward is more overloaded than it has to be. Among all
plans that achieve that, we pick the one with the fewest hand-offs, because each transfer is an ambulance trip and a
phone call. Patients never leave their city. If the whole city is full, we say how many patients have no bed.

| ID | City input (ward: required/capacity) | Working | Expected output |
|---|---|---|---|
| **R1** | W1 9/5, W2 2/6, W3 3/5 | D = (4, 0, 0), H = (0, 4, 2). W1 cannot go below 5/5 = 1.0, so u* = 1.0; fewest arcs: all 4 to W2 | transfers **W1→W2: 4**; loads (5, 6, 3); ward utilisation after (1.0, 1.0, 0.6); city before 14/16 = **0.875**, after **0.875**; unroutable **0**; headroom after **2** |
| **R2** | W1 10/4, W2 3/4, W3 4/5 | D = (6, 0, 0), H = (0, 1, 1). Only 2 fit; u* = 8/4 = 2.0 | transfers **W1→W2: 1, W1→W3: 1**; loads (8, 4, 5); city before 17/13 = **1.3077**, after **1.0**; unroutable **4**; headroom after **0** |
| **R3** | Dhaka North W1 8/5 (D = 3), no headroom in Dhaka North; Dhaka South has 10 free beds | Pools are separate | **no transfer**; Dhaka North unroutable **3**; Dhaka South untouched |

Property tests: conservation per city; never a cross-city arc; a ward never both sends and receives; unroutable =
max(Σ D − Σ H, 0) per city; deterministic.

---

## 5. Counterfactual simulator (`shared/intervention.py`, ADR-0013)

**Notation.** Effect E(c) = E_max·(1 − e^(−k·c)). For horizon h, the model's monotone rain features F_h
(h = 2: `rainfall_lag_0/1/2`, `rain_sum_0_3`, `rain_anomaly`; h = 3: `rainfall_lag_0/1`, `rain_sum_0_3`,
`rain_anomaly`; h = 4: `rainfall_lag_0`, `rain_sum_0_3`, `rain_anomaly`). Counterfactual row: each rain feature in
F_h × (1 − E(c)); `rain_anomaly` − E(c) × the rain it is built on. Cases prevented_h = μ_h(baseline) − μ_h(counterfactual)
≥ 0. Beds avoided = Σ_h prevented × 0.298; saline avoided = Σ_h prevented × 2.385 (unrounded: these are expected
savings, not orders). ROI = Σ_h prevented / c.

**Plain words.** Spraying removes breeding water. In the model, breeding water is the recent rain that turns into
cases two to four weeks later. We shrink exactly that rain signal in the treated ward by an amount that grows with
crews but with diminishing returns, then ask the same model again. The model was trained so that less of that rain can
never mean more cases, so spraying can never look harmful. Efficacy is an assumption we state, with a low–high band.

| ID | Input | Working | Expected output |
|---|---|---|---|
| **E1** | Effect curve, c = 0..3 | E = E_max(1 − e^(−kc)) | low (0, 0.0738, 0.1259, 0.1625); base (0, **0.1574, 0.2528**, 0.3107); high (0, 0.2769, 0.4144, 0.4826) |
| **T1** | Toy model cases = 2 + 0.05 × rain_sum_0_3, baseline rain_sum = 200, 2 crews, base | baseline 12.0; counterfactual 2 + 10 × (1 − 0.2528) = 9.4715 | prevented **2.5285**, beds **0.7535**, saline **6.0305**, ROI **1.2642** per crew |
| **T2** | Same toy, low / high presets | E(2) = 0.1259 / 0.4144 | prevented **1.2585 / 4.1437** (the sensitivity band) |
| **T3** | Real model, every ward and horizon, all presets, origin 2024-08-05 | — | counterfactual ≤ baseline **everywhere** (property test) |

`MONOTONE_RAIN_FEATURES` must equal `ml/train.py:monotone_constraints_for_horizon`; a test compares them, so a model
retrain cannot silently break the guarantee.

---

## 6. Dispatch encoding (`features/dispatch`, ADR-0014)

**Rules.** If every character is in the GSM 03.38 basic set (extension characters `^ { } \ [ ~ ] | €` count 2), the
message is GSM-7: one segment up to 160 characters, else ⌈n/153⌉. Otherwise UCS-2 (all Bangla): one segment up to 70,
else ⌈n/67⌉.

| ID | Input | Expected output |
|---|---|---|
| **D1** | 160 × "A" / 161 × "A" / 306 / 307 | GSM-7: **1 / 2 / 2 / 3** segments |
| **D2** | 70 × "অ" / 71 / 134 / 135 | UCS-2: **1 / 2 / 2 / 3** segments |
| **D3** | 80 × "[" / 81 × "[" | GSM-7 160 → **1**; 162 → **2** |
| **D4** | English sample (contracts §2.4) | GSM-7, **141** characters, **1** segment |
| **D5** | Bangla sample "আভাস ওয়ার্ড ০৪ ঢাকা দক্ষিণ, ২৬ আগস্ট সপ্তাহ: সংকটপূর্ণ। প্রত্যাশিত রোগী ১৯। স্যালাইন ৩৮/৪৫, কিট ১৮/২২, শয্যা ৬/৬। দল ২।" | UCS-2, **120** characters, **2** segments |
| **D6** | Ward name `<script>x</script>` in the brief | Rendered as `&lt;script&gt;x&lt;/script&gt;` |

Number faithfulness: extract every number (Bangla digits mapped to 0–9) from each rendered notice; each must equal a
value in `NoticeFacts` (integers exactly, cases to one decimal or rounded integer).
