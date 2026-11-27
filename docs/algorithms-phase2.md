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

---

## 7. Early-action trigger (`shared/trigger.py`, ADR-0020)

**Notation.** For ward $i$ at origin week $t$, define strictly causal 2-week rainfall
$R_{2\text{w}}(i, t) = \text{rainfall\_lag\_0}(i, t) + \text{rainfall\_lag\_1}(i, t)$ and static ward drainage risk
$w_i = \text{water\_logging\_risk\_index}_i$. Given thresholds $(R, W)$, the binary alert indicator is
$$A_{i,t}(R, W) = \mathbf{1}\!\left[R_{2\text{w}}(i, t) > R \;\wedge\; w_i \ge W\right].$$
The $h = 3$ outbreak event is $E_{i,t} = \mathbf{1}[\text{dengue\_cases}_{i,t+3} \ge 8]$ (High or Critical tier,
`DEFAULT_TIER_CUTOFFS[1] = 8.0`). Over all scored ward-weeks with observed $t + 3$, form contingency counts
$a = \text{TP}$ ($A=1, E=1$), $b = \text{FP}$ ($A=1, E=0$), $c = \text{FN}$ ($A=0, E=1$), $d = \text{TN}$ ($A=0, E=0$):
- **Hit rate (POD / recall):** $H = \frac{a}{a + c}$ (0 if $a + c = 0$).
- **False-alarm rate (POFD / FPR):** $F = \frac{b}{b + d}$ (0 if $b + d = 0$).
- **False-alarm ratio (FAR):** $\text{FAR} = \frac{b}{a + b}$ (fraction of alerts that do not become High; 0 if $a + b = 0$).
- **Peirce skill score (PSS / Hanssen–Kuipers):** $\text{PSS} = H - F \in [-1, 1]$.
- **Alerts vs High weeks:** total alerts $a + b$ vs observed High weeks $a + c$.

**Threshold fit.** Search candidate grids $R \in \{20, 30, \dots, 200\}\text{ mm}$ and
$W \in \{0.0, 0.05, \dots, 0.90\}$ strictly on **2016–2023** to maximise $\text{PSS}$ (ties broken by lower FAR, then
higher $R$, then higher $W$). Freeze $(R^*, W^*)$ and evaluate once on the locked **2024–2025** hold-out alongside
Abhas LightGBM $h = 3$ alerts on the exact same ward-weeks.

**Episode lead-time quartiles.** For each ward, define a High spell onset as any week $t_0$ with
$\text{cases}_{i,t_0} \ge 8$ preceded by $\text{cases}_{i,t_0-1} < 8$ (or the first week of the hold-out). Look back
$k \in \{1, \dots, 8\}$ weeks before $t_0$ for contiguous pre-onset alerts; if at least one alert fired in
$[t_0 - 8, t_0 - 1]$, the spell's lead time is $\ell = t_0 - t_{\text{earliest}}$ weeks (using the earliest alert of
the run preceding $t_0$). Report `(q25, median, q75)` across all covered spells plus `spells_covered / total_spells`.

**Plain words.** A field officer without a computer needs one rule they can check on paper: if two weeks of rain pass
the rainfall cutoff and the ward has poor drainage, start larviciding now — three weeks before hospitals fill up. We
pick the cutoffs only on 2016–2023 using the Peirce skill score (which rewards catching High weeks without crying wolf),
freeze them, and test them on 2024–2025. Then we score our LightGBM model on the exact same weeks to prove the model
keeps the same high catch rate while cutting false alarms.

| ID | Input | Working | Expected output |
|---|---|---|---|
| **TR1** | Contingency counts $a = 16, b = 18, c = 4, d = 62$ ($N = 100$) | $H = 16/20 = 0.80$; $F = 18/80 = 0.225$; $\text{FAR} = 18/34 = 0.5294$; $\text{PSS} = 0.80 - 0.225 = 0.575$ | hit rate **0.8000**, FPR **0.2250**, FAR **0.5294**, Peirce **0.5750**, alerts **34** vs High **20** |
| **TR2** | Boundary test, rule $R = 80, W = 0.30$: `(80.0, 0.30)`, `(80.1, 0.30)`, `(140.0, 0.29)` | Strict `>` on rain; inclusive `≥` on water-logging | alerts **(0, 1, 0)** |
| **TR3** | Five High spells with earliest pre-onset alert leads `[2, 3, 4, 5, 6]` weeks | Quartiles Q25, Q50, Q75; all 5 covered | **Q25 = 3.0, median = 4.0, Q75 = 5.0** weeks; coverage **5/5 (1.0)** |
| **TR4** | Zero alerts fired: $a = 0, b = 0, c = 5, d = 95$ | Zero-division guard on FAR | hit rate **0.0**, FPR **0.0**, FAR **0.0**, Peirce **0.0** (no NaN) |
| **TR5** | Locked 2024–25 hold-out replay (reference benchmark) | Fitted on 2016–2023 → $R = 80\text{ mm}, W = 0.30$ | hit rate **≈ 0.94**, FAR **≈ 0.63**, Peirce **≈ 0.73**, median lead **4 weeks**; Abhas model target: hit rate ≥ rule, FAR < rule |

Property tests: $-1 \le \text{PSS} \le 1$; raising $R$ or $W$ never increases total alerts (monotone); permuting
ward-week rows does not change contingency counts or PSS; 2016–2023 fit never reads any 2024–2025 row.

---

## 8. Structural-fix planner (`shared/structural.py`, ADR-0021)

**Notation.** Each ward $i$ has static traits `(population_density_sqkm, water_logging_risk_index, sanitation_score)`
denoted $(\rho_i, w_i, s_i)$ with $w_i, s_i \in [0, 1]$. For improvement step $\delta \in \{0.1, 0.2\}$, the clamped
trait shifts are:
$$\Delta w_i(\delta) = -\min(\delta, w_i) \le 0 \quad\text{(lower water-logging risk)}, \qquad
\Delta s_i(\delta) = \min(\delta, 1 - s_i) \ge 0 \quad\text{(higher sanitation)}.$$

**Estimator 1 — Poisson GLM (log link).** Fit on 2016–2023 weekly ward observations:
$$\log \mu_{i,t} = \beta_0 + \beta_{r2}\,\text{rainfall\_lag\_2}_{i,t} + \beta_{r3}\,\text{rainfall\_lag\_3}_{i,t} + \beta_{r4}\,\text{rainfall\_lag\_4}_{i,t} + \beta_{\text{dens}}\,\rho_i + \beta_{\text{wl}}\,w_i + \beta_{\text{san}}\,s_i.$$
Holding weather fixed, shifting $w_i \to w_i + \Delta w_i$ multiplies expected cases by $\exp(\beta_{\text{wl}} \Delta w_i)$, so:
- **Seasonal % reduction** (for an unclamped shift $\Delta$): $p_{\text{glm}}(\Delta) = 100 \cdot \bigl(1 - \exp(\beta_j \Delta)\bigr)$.
- **Annualised cases prevented in ward $i$:** $\Delta Y^{\text{glm}}_{i,\text{yr}} = \bar{Y}_{i,\text{yr}} \cdot \bigl(1 - \exp(\beta_j \Delta x_i)\bigr)$, where $\bar{Y}_{i,\text{yr}} = \frac{52}{T_i}\sum_t y_{i,t}$ is the ward's historical annualised case burden.

**Estimator 2 — LightGBM partial dependence (PD) cross-check.** Using the locked production LightGBM ($h = 3$) over
all historical feature rows $x_{i,t}$ of ward $i$, construct $x'_{i,t}$ by replacing **only** $w_i \to \max(0, w_i - \delta)$
(or $s_i \to \min(1, s_i + \delta)$) and leaving all weather lags, density, and calendar features identical:
$$\Delta Y^{\text{pd}}_{i,\text{yr}} = \frac{52}{T_i} \sum_{t=1}^{T_i} \Bigl(\hat{\mu}_3(x_{i,t}) - \hat{\mu}_3(x'_{i,t})\Bigr), \qquad
p_{\text{pd}} = 100 \cdot \frac{\sum_{i,t}\bigl(\hat{\mu}_3(x_{i,t}) - \hat{\mu}_3(x'_{i,t})\bigr)}{\sum_{i,t} \hat{\mu}_3(x_{i,t})}.$$

**Bootstrap 95 % CIs.** Run $B = 500$ deterministic-seed cluster resamples (resampling ward-year blocks with
replacement, refitting the Poisson GLM on each bootstrap draw and resampling evaluation ward-years for LightGBM PD)
and report the 2.5th and 97.5th percentiles `[ci_low, ci_high]` for every seasonal % reduction and per-ward annual
estimate.

**"Build vs send" ratio.** For each ward $i$, pair annualised permanent drainage benefit
$D_i = \Delta Y^{\text{glm}}_{i,\text{yr}}(\Delta w = -0.2)$ against the Phase 2 simulator's peak-season 1-crew ROI
$R^{\text{crew}}_i$ (cases prevented per crew over $h = 2..4$ at the reference peak origin `2024-08-05`, base preset,
ADR-0013):
$$\text{crew\_deployments\_equiv}_i = \begin{cases} D_i / R^{\text{crew}}_i & \text{if } R^{\text{crew}}_i > 0, \\ \text{null} & \text{otherwise.} \end{cases}$$

**Plain words.** Spraying crews are a recurring seasonal cost; fixing drainage or sanitation is a permanent capital
project. To estimate how many cases a year a drainage or sanitation upgrade could avoid in each ward, we fit a simple
Poisson regression controlling for rainfall 2–4 weeks earlier, and then cross-check it by nudging only that one trait
inside our trained LightGBM model. We show both numbers with 95 % uncertainty ranges and compare them side-by-side
with spraying ROI — always labelled clearly as **associations in simulated data, not causal real-world estimates**.

| ID | Input | Working | Expected output |
|---|---|---|---|
| **ST1** | GLM $\beta_{\text{wl}} = +0.8665$, $\beta_{\text{san}} = -0.3459$, ward $\bar{Y}_{\text{yr}} = 200$, $w_i = 0.70, s_i = 0.50$ | $1 - e^{-0.08665} = 0.0830$; $1 - e^{-0.1733} = 0.1591$; $1 - e^{-0.03459} = 0.0340$; $1 - e^{-0.06918} = 0.06684$ | `−0.1` wl: **8.30 % / 16.60 cases/yr**; `−0.2` wl: **15.91 % / 31.82 cases/yr**; `+0.1` san: **3.40 % / 6.80 cases/yr**; `+0.2` san: **6.68 % / 13.37 cases/yr** |
| **ST2** | Boundary clamping: $w_i = 0.05$ (`−0.2` requested), $s_i = 0.95$ (`+0.2` requested), $w_j = 0.0$ | Effective $\Delta w_i = -0.05$, $\Delta s_i = +0.05$, $\Delta w_j = 0.0$ | $w_i$: **4.24 %** (not 15.91 %); $s_i$: **1.71 %**; $w_j$: **0.0 % / 0.0 cases/yr** |
| **ST3** | LightGBM PD toy ward: 2 weeks, baseline $\hat{\mu} = (10.0, 14.0)$, shifted $\hat{\mu}' = (9.0, 12.6)$ | Mean weekly diff $= (1.0 + 1.4)/2 = 1.2$; annualised $= 52 \times 1.2$ | **62.40 cases/yr** prevented; **10.0 %** seasonal reduction |
| **ST4** | Build vs send: drainage **32.0 cases/yr** vs simulator ROI **8.0 cases/crew** (and edge case ROI `0.0`) | $32.0 / 8.0 = 4.0$; zero ROI guarded | **4.0** crew-deployments/yr equivalent (`null` when ROI = 0) |
| **ST5** | Reference onsite dataset replay | Poisson GLM + LightGBM PD, 60 wards | `−0.1` water-logging **≈ 8.3 %** fewer cases/season; `+0.1` sanitation **≈ 3.4 %**; top wards **≈ 31–34 cases/yr** for `−0.2` water-logging |

Property tests: clamped traits always stay in $[0, 1]$; `−0.2` reduction ≥ `−0.1` reduction ≥ 0 when $\beta_{\text{wl}} > 0$
(and symmetrically for `+0.2` vs `+0.1` sanitation when $\beta_{\text{san}} < 0$); `ci_low ≤ ci_high` for every CI;
exact mandatory disclaimer string `"associations in simulated data, not causal real-world estimates"` present on every
response.
