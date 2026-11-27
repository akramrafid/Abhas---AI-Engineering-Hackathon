ROLE: CORE + UI (AI/Backend engineer + Frontend engineer) · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp10-trigger-structural — Early-action trigger (ADR-0020) & Structural-fix planner (ADR-0021)
SKILLS: production-standards, ai-engineering, backend-engineering, frontend-engineering, property-based-testing, verification-before-completion
READ FIRST: docs/architecture.md (ADR-0020, ADR-0021) · docs/algorithms-phase2.md §7, §8 ·
  docs/contracts-phase2.md §2.5, §2.7, §2.8, §2.9, §4, §5 · app/shared/features.py · app/shared/tiers.py ·
  app/features/validation/ · app/features/dispatch/ · apps/web/src/features/validation/.
DEPENDS ON: version-onsite-final baseline (16c4a2c or later).

OWNED PATHS
- Precomputation scripts & committed artefacts (run offline once; SHA-256 locked to the onsite dataset):
  - apps/api/ml/fit_trigger_structural.py (fits ADR-0020 trigger on 2016–2023, evaluates 2024–2025 hold-out vs
    Abhas LightGBM h=3, fits ADR-0021 Poisson GLM + LightGBM PD + 500-resample cluster bootstrap CIs + build-vs-send
    join, writes both JSON artefacts)
  - apps/api/config/trigger_evaluation.json
  - apps/api/config/structural_planner.json
- Pure shared maths (NumPy/SciPy only, zero FastAPI/ORM/network imports):
  - apps/api/app/shared/trigger.py
  - apps/api/app/shared/structural.py
- Ports & adapters:
  - apps/api/app/ports/planning.py
  - apps/api/app/adapters/config_planning.py
- API slices & wiring:
  - apps/api/app/features/validation/{schemas,service,deps,router}.py (add GET /api/v1/validation/trigger)
  - apps/api/app/features/planning/{__init__,schemas,service,deps,router}.py (new read-only slice: GET /api/v1/planning/structural?city=)
  - apps/api/app/features/dispatch/templates.py (print auditable early-action rule + ward drainage match on commissioner briefs, EN & BN)
  - apps/api/app/main.py (register planning router, wire precomputed JSON checks in /readyz)
- Contracts & generated frontend types:
  - contracts/openapi.json (regenerated via `npm run contracts`)
  - apps/web/src/lib/api/generated.ts (regenerated via `npm run web:types`)
- Web UI (optional minimal integration into Validation tab + Structural Planner panel, EN & BN, zero Lime in data view, WCAG 2.2 AA):
  - apps/web/src/lib/api/client.ts (hooks for `GET /api/v1/validation/trigger` and `GET /api/v1/planning/structural`)
  - apps/web/src/features/validation/ (Early-Action Trigger card comparing clipboard rule vs Abhas model)
  - apps/web/src/features/planning/ (new vertical slice: Structural-Fix Planner with GLM vs LightGBM PD 95% CIs, Build-vs-Send table, and mandatory disclaimer banner)
- Tests:
  - apps/api/tests/shared/test_trigger.py (TR1–TR5 + Hypothesis properties)
  - apps/api/tests/shared/test_structural.py (ST1–ST5 + Hypothesis properties)
  - apps/api/tests/features/test_trigger_structural_api.py (contract, city filter, 422, brief rule rendering, socket-guard offline check)
  - apps/web/e2e/ (extend validation/offline E2E to assert trigger card, structural planner disclaimer, and zero Lime / WCAG AA)

ACCEPTANCE CRITERIA (Given / When / Then)

1. Early-action trigger — zero-leakage fit & hold-out scorecard (ADR-0020)
- **AC-WP10-1 (Zero-leakage threshold fit):**
  Given the locked onsite dataset (`dataset_sha256 = 24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0`),
  When `ml/fit_trigger_structural.py` selects `(R, W)` for `"2-week rain > R mm AND water_logging_risk_index >= W"`,
  Then the grid search uses ONLY 2016–2023 rows (asserted by unit test rejecting any row with year > 2023), maximises
  the Peirce skill score for predicting `dengue_cases >= 8` at `h = 3`, and reproduces the reference rule region
  (`R = 80 mm`, `W = 0.30`).

- **AC-WP10-2 (Hold-out report & model comparison):**
  Given the precomputed `config/trigger_evaluation.json`,
  When a client calls `GET /api/v1/validation/trigger` (including with `ABHAS_OFFLINE=1` and the pytest socket guard enabled),
  Then the API returns HTTP 200 with `RunMeta`, `rule`, `holdout_rule` (hit rate ≈ 0.94, FAR ≈ 0.63, Peirce ≈ 0.73,
  alerts vs High weeks, and lead-time quartiles with median ≈ 4 weeks), `holdout_model` (Abhas LightGBM `h = 3` scored on
  the exact same 2024–2025 hold-out ward-weeks), and `comparison` showing whether the model matches/exceeds the rule's
  hit rate with lower FAR and higher Peirce score.

- **AC-WP10-3 (Zero-model commissioner brief):**
  Given any valid `ward_id` and `origin_week`,
  When `GET /api/v1/dispatch/brief/{ward_id}.html` is rendered in English (`lang=en`) or Bangla (`lang=bn`),
  Then the HTML brief prints the auditable rule (`2-week rain > R mm AND water_logging_risk_index >= W`), states whether
  that ward's `water_logging_risk_index >= W`, escapes all ward text, and passes existing CSP and offline socket checks.

2. Structural-fix planner — dual estimation, CIs & Build-vs-Send (ADR-0021)
- **AC-WP10-4 (Dual estimation with bootstrap 95% CIs):**
  Given the locked onsite dataset and production model `abhas-lgbm-1.1.2`,
  When `ml/fit_trigger_structural.py` builds `config/structural_planner.json`,
  Then it estimates seasonal % reductions and per-ward annualised cases prevented for `water_logging_risk_index`
  (`-0.1`, `-0.2`, clamped ≥ 0) and `sanitation_score` (`+0.1`, `+0.2`, clamped ≤ 1) using BOTH a Poisson GLM
  (`rainfall_lag_2`, `rainfall_lag_3`, `rainfall_lag_4` + `population_density_sqkm`, `water_logging_risk_index`,
  `sanitation_score`) AND LightGBM partial dependence (modifying ONLY the target trait), attaches deterministic
  bootstrap 95% CIs (`ci_low <= estimate <= ci_high` for every metric), and aligns with reference magnitudes
  (`-0.1` water-logging ≈ 8.3%/season; `+0.1` sanitation ≈ 3.4%/season; top wards ≈ 31–34 cases/yr for `-0.2`
  water-logging).

- **AC-WP10-5 (Build-vs-Send API & city filter):**
  Given `config/structural_planner.json`,
  When a client calls `GET /api/v1/planning/structural` (or `?city=Dhaka South`),
  Then it returns HTTP 200 offline with `RunMeta`, all 60 wards (or only the requested city's wards), both GLM and
  LightGBM PD estimates + 95% CIs, and a `build_vs_send` object comparing annual drainage cases prevented against
  simulator crew ROI (`crew_deployments_equiv`, guarded when ROI = 0); an invalid `city` returns RFC 9457 `422`.

- **AC-WP10-6 (Mandatory disclaimer everywhere):**
  Given any response from `GET /api/v1/planning/structural` or any rendered Structural Planner UI view (EN/BN),
  When inspected by API contract tests or Playwright E2E,
  Then the exact disclaimer `"associations in simulated data, not causal real-world estimates"` is present in the API
  JSON payload and visibly rendered in the UI with zero Lime (`#D4F53C`) and zero WCAG 2.2 AA violations.

- **AC-WP10-7 (Offline, latency & slice hygiene):**
  Given both endpoints are backed solely by precomputed JSON files verified by `dataset_sha256` in `/readyz`,
  When tested under `ABHAS_OFFLINE=1` and `gates.mjs slices contract migrations ci offline`,
  Then both endpoints respond in < 10 ms p95 with zero network calls, zero cross-slice imports, and zero Phase 1/2 regressions.

TESTS REQUIRED
- Unit tests named after hand-solved IDs: `test_alg_TR1_contingency_peirce`, `test_alg_TR2_rule_boundaries`,
  `test_alg_TR3_lead_time_quartiles`, `test_alg_TR4_zero_alerts_guard`, `test_alg_TR5_holdout_replay_reference`,
  `test_alg_ST1_glm_scaling`, `test_alg_ST2_trait_clamping`, `test_alg_ST3_lgbm_pd_toy`,
  `test_alg_ST4_build_vs_send_ratio`, `test_alg_ST5_ci_and_disclaimer_invariants`.
- Hypothesis property tests: PSS in `[-1, 1]`; trigger alert count non-increasing in `R` and `W`; permutation
  invariance of contingency metrics; trait clamp stays in `[0, 1]`; `-0.2` benefit ≥ `-0.1` benefit ≥ 0 when
  `beta_wl > 0`; `ci_low <= ci_high`.
- Integration & offline tests: `GET /api/v1/validation/trigger`, `GET /api/v1/planning/structural`,
  `?city=Dhaka South`, `?city=InvalidCity` → `422`, commissioner brief rule check (EN + BN), socket-guard pass.

GATE TO PASS
- `npm run contracts && npm run web:types`
- `npm run ci`
- `node .orca-team/tools/gates.mjs slices contract migrations eval offline e2e`

---

JUDGE Q&A TALKING POINTS (30-pt Technical Q&A)

1. **Why publish a simple rainfall + water-logging trigger if you already built LightGBM?**
   - Resilience and auditability. In a monsoon power outage or field clinic without a laptop, a commissioner can check
     two numbers — 2-week rain > 80 mm and ward water-logging ≥ 0.30 — printed right on the brief and act 3–4 weeks
     ahead of High caseloads (94% hold-out hit rate, 4-week median lead). At the same time, benchmarking LightGBM
     against this strong baseline on the locked 2024–25 hold-out proves the ML model earns its complexity by keeping
     the same ~94%+ hit rate while sharply cutting false alarms (lower FAR, higher Peirce score).

2. **Why choose `(R, W)` by Peirce skill score instead of F1 or accuracy?**
   - Accuracy rewards never alerting when High weeks are a minority, and F1 shifts with outbreak prevalence. Peirce
     skill score ($\text{PSS} = \text{Hit Rate} - \text{False-Alarm Rate}$) is base-rate invariant and standard in
     meteorological warning verification (WMO): a random or always-on rule scores `0`, while our frozen rule achieves
     `0.73` on the unseen 2024–25 hold-out with zero hold-out tuning.

3. **Wait — isn't a 0.63 False-Alarm Ratio (FAR) high for the clipboard rule?**
   - Yes, and we report FAR transparently right beside hit rate! Because High weeks are rare outside peak monsoon,
     catching 94% of High weeks with a two-number threshold means ~63% of alert weeks do not reach ≥ 8 cases three weeks
     later — which is *exactly* why the Abhas LightGBM model exists (it incorporates temperature, humidity, full 0–8
     week rain lags, seasonality, and density to maintain high recall while cutting false alarms) and why the clipboard
     rule is positioned as an auditable low-cost early-action screen and offline fallback.

4. **Are the structural drainage numbers ("8.3% fewer cases", "31–34 cases/yr") real causal estimates?**
   - **No — and we enforce that disclaimer directly in the API schema and UI:** *"associations in simulated data, not
     causal real-world estimates."* In this dataset, `water_logging_risk_index` and `sanitation_score` are static ward
     attributes with no historical infrastructure interventions. Showing both a parametric Poisson GLM (controlling for
     rain lags 2–4 and density) and LightGBM partial dependence with bootstrap 95% CIs tells planners how sensitive the
     simulated association is to model form, while signalling clearly that real capital budgets require longitudinal
     DGHS surveillance and pre/post drainage audit data.

5. **Why report BOTH Poisson GLM and LightGBM partial dependence for structural fixes?**
   - A log-linear Poisson GLM enforces smooth global slopes ($\exp(\beta \Delta x)$) that extrapolate cleanly across
     `0.1/0.2` shifts, whereas LightGBM partial dependence captures non-linear interactions with rainfall and density
     using the exact production forecasting model. When both methods agree within their bootstrap 95% CIs, planners can
     trust the directional ranking of wards; where they diverge, the UI surfaces the model uncertainty instead of
     hiding it behind one point estimate.

6. **How should a City Corporation Mayor read the "Build vs Send" table?**
   - Spraying crews ("send") are a recurring monsoon expense that prevents ~7–10 cases per crew during a 3-week peak,
     whereas drainage remediation ("build") is a one-time capital upgrade linked in the data to ~31–34 cases/yr in the
     worst-drained high-density wards (equivalent to ~4+ peak crew deployments *every single year*). The table pairs
     both numbers per ward so capital budgets target chronic water-logged hotspots while mobile crews cover acute
     rainfall spikes everywhere else.

7. **Why precompute both endpoints into JSON instead of computing on the fly?**
   - Both analyses depend only on locked historical data (`dataset_sha256`) and the frozen model artefact — never on
     user-typed inputs. Precomputing offline eliminates multi-second bootstrap latency during live judging, keeps
     `GET /api/v1/validation/trigger` and `GET /api/v1/planning/structural` strictly deterministic and `< 10 ms` p95,
     and guarantees 100% offline operation verified by `/readyz` SHA-256 checks.
