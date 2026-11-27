ROLE: CORE (AI engineer) · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp3 — Counterfactual simulator and crew assignment (rubric P3 10 pts, P1 crews)
SKILLS: production-standards, ai-engineering, property-based-testing, verification-before-completion
READ FIRST: docs/contracts-phase2.md §2.3, §4, §5 (CounterfactualForecaster) · docs/algorithms-phase2.md §3, §5 ·
  ADR-0011, ADR-0013 · ml/train.py monotone_constraints_for_horizon · app/shared/forecast_engine.py.
DEPENDS ON: WP0 and WP1 merged (uses supply ratios; wires crews into allocation).

OWNED PATHS
- apps/api/app/shared/intervention.py · apps/api/app/shared/optimizer.py (greedy_crews only)
- apps/api/app/shared/forecast_engine.py (add the CounterfactualForecaster methods: reduction applied to the built
  feature rows, never to raw weather; never write counterfactuals to predictions_cache)
- apps/api/app/features/simulator/{service,deps,router}.py
- apps/api/app/features/allocation/service.py (crew wiring only: call greedy_crews with the simulator's marginal)
- apps/api/tests/shared/test_intervention.py, tests/features/simulator/** (new)

ACCEPTANCE CRITERIA
- WP3-1 (P3 model-driven) Given deployments, when simulator/run runs, then baseline and counterfactual come from the same
  LightGBM for h = 2, 3, 4 and only the treated wards' monotone rain features change.
- WP3-2 (P3 safety) Given any ward, horizon and preset at origin 2024-08-05, then counterfactual ≤ baseline (T3).
- WP3-3 (P3 ROI) Given several treated wards, then wards are ranked by cases prevented per crew, with beds and saline
  avoided and the low/high sensitivity band per ward and in totals.
- WP3-4 (P1 crews) Given total_crews = N in allocation/plan, then crews sum to min(N, 5 × wards) and follow the greedy
  marginal rule; crew_method reports "greedy (approximate)" if a marginal sequence is not non-increasing.
- WP3-5 Given auto_crews = N in simulator/run, then the placement equals allocation's crew placement for the same
  origin and N.
- WP3-6 p95 latency for a 10-ward deployment < 800 ms locally.

TESTS: E1, T1, T2, T3, G1–G3 exactly; MONOTONE_RAIN_FEATURES equals ml/train.py; concavity of B_i on the presets;
endpoint integration test.
GATE TO PASS: npm run ci · node .orca-team/tools/gates.mjs contract slices eval (Phase 1 eval must not regress)
MERGE ORDER: 3rd (after WP1).

WORKER RULES: as in p2-wp0.md.
