ROLE: CORE · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp2 — Intra-city hospital overflow routing (rubric P2, 10 pts)
SKILLS: production-standards, backend-engineering, property-based-testing, verification-before-completion
READ FIRST: docs/contracts-phase2.md §2.2, §3, §4 · docs/algorithms-phase2.md §4 · ADR-0012.
DEPENDS ON: WP0 merged; reads config/ward_capacity.json produced by WP1 (use a test fixture file until it lands).

OWNED PATHS
- apps/api/app/shared/routing.py · apps/api/app/adapters/config_capacity.py (new)
- apps/api/app/features/overflow/{service,deps,router}.py
- apps/api/tests/shared/test_routing.py, tests/features/overflow/** (new)

ACCEPTANCE CRITERIA
- WP2-1 (P2) Given a city where some wards' planned beds exceed capacity and others have headroom, when overflow/route
  runs, then patients move only to wards in the same city, placed patients = min(Σ D, Σ H), and every ward shows
  net_deficit, utilisation_before and utilisation_after.
- WP2-2 (P2 headroom) Given the response, then each city shows capacity_total, required_total, utilisation before and
  after, headroom_after and unroutable_patients.
- WP2-3 Given a city whose pool is exhausted, then unroutable_patients > 0 and no transfer crosses a city boundary
  even when another city has free beds (case R3).
- WP2-4 Given capacity_overrides for a ward, then that ward's capacity_source is "override" and routing uses it;
  an unknown ward_id returns 404 unknown-ward.
- WP2-5 Given capacity_method, then it states the derivation (ceil(1.10 × P95 …, 2016–2022)).

TESTS: R1–R3 exactly; properties (conservation, no cross-city arc, no ward both sends and receives, unroutable formula,
determinism); endpoint integration test at origin 2024-08-05 for all five cities.
GATE TO PASS: npm run ci · node .orca-team/tools/gates.mjs contract slices
MERGE ORDER: 2nd (parallel with WP1, WP4).

WORKER RULES: as in p2-wp0.md.
