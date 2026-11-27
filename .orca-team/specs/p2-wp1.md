ROLE: CORE · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp1 — Supply conversion and constrained allocation (rubric P1, 15 pts)
SKILLS: production-standards, ai-engineering, backend-engineering, property-based-testing, verification-before-completion
READ FIRST: docs/contracts-phase2.md §2.1, §3, §4 · docs/algorithms-phase2.md §1, §2 · ADR-0009, ADR-0010.
DEPENDS ON: WP0 merged.

OWNED PATHS
- Reads apps/api/config/supply_ratios.json (created in WP0; do not change the constants).
- apps/api/app/shared/supply.py, apps/api/app/shared/optimizer.py (all functions except greedy_crews, which WP3 owns)
- apps/api/app/adapters/config_supply.py (new) · apps/api/app/features/allocation/{service,deps,router}.py
- No seed change and no retrain (human decision): keep abhas-lgbm-1.1.2; the runtime needs only the two JSON files.
- apps/api/tests/shared/test_supply.py, test_optimizer.py, tests/features/allocation/** (new)

ACCEPTANCE CRITERIA
- WP1-1 (P1) Given planned cases Q, then supplies equal round_half_up(c × Q) with c = 2.385 / 1.164 / 0.298, and for
  every historical row the same function reproduces the dataset's supply columns (S0).
- WP1-2 (P1) Given origin 2024-08-05 and Dhaka South, when stock_pct moves 100 → 30, then Σ allocated per resource equals
  round(stock_pct × Σ required) and Critical/High dense wards keep the highest fulfilment.
- WP1-3 (P1 deficit alerts) Given stock_pct < 100, when a High/Critical ward is below 100 % or any ward below 50 %, then
  deficit_level is "critical" with a reason string; at 100 % no ward is in deficit.
- WP1-4 (P1 live) Given the full scope (60 wards, 3 resources), when the endpoint runs, then p95 latency < 300 ms
  locally (forecasts cached).
- WP1-5 Given identical input twice, then identical output (determinism).

TESTS: algorithm cases S0–S4, A1–A5 exactly as in docs/algorithms-phase2.md; Hypothesis properties of §1 and §2
(sum, bounds, monotone in stock, permutation invariance); allocation endpoint integration test; ratio-fit test
of the constants on all rows.
GATE TO PASS: npm run ci · node .orca-team/tools/gates.mjs contract slices
MERGE ORDER: 2nd (with WP2 and WP4 in parallel). Crews stay 0 until WP3 wires greedy_crews.

WORKER RULES: as in p2-wp0.md (never end the turn mid-command; small commits "version-onsite-final: core: …";
owned paths only; contract changes only via LEAD).
