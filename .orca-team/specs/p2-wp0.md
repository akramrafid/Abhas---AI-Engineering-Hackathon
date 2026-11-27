ROLE: CORE (contracts builder) · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp0 — Build the Phase 2 contracts and walking skeleton exactly as specified
SKILLS: production-standards, backend-engineering, api-design-principles, database-engineering, verification-before-completion
READ FIRST: docs/contracts-phase2.md (the contract — build it exactly), docs/architecture.md (Phase 2 section and
  ADR-0009..0016), docs/algorithms-phase2.md (names only), AGENTS.md §6, TASK.md "Phase 2".

WHY FIRST: every other work package builds against these schemas, ports, stub routers and tables. Nothing else starts
until WP0 is merged and `contracts/openapi.json` plus `apps/web/src/lib/api/schema.d.ts` are regenerated.

OWNED PATHS
- apps/api/app/core/run_meta.py (new) · apps/api/app/core/command_requests.py (new)
- apps/api/app/features/{allocation,overflow,simulator,dispatch,plans}/ (new: __init__.py, schemas.py, router.py
  returning schema-valid fixtures, deps.py, service.py with `raise NotImplementedError` bodies)
- apps/api/app/ports/{supply,capacity,intervention}.py (new) · apps/api/app/ports/repositories.py (add PlanStore)
- apps/api/app/shared/{supply,optimizer,routing,intervention,plan_registry}.py (new: typed signatures + docstrings
  from contracts §4; bodies `raise NotImplementedError`; constants EFFICACY_PRESETS and MONOTONE_RAIN_FEATURES filled in)
- apps/api/app/main.py (mount the 5 routers; register plan runners; readyz adds git_sha and offline — read the env
  var ABHAS_GIT_SHA or "unknown" for now, offline from ABHAS_OFFLINE)
- apps/api/migrations/versions/0002_phase2_plans.py (contracts §6, reversible) · apps/api/app/adapters/db/models.py
- contracts/openapi.json and apps/web/src/lib/api/schema.d.ts (regenerated only via `npm run contracts && npm run web:types`)
- apps/api/tests/test_p2_contracts.py (new)
- .orca-team/gates.json (`offline` command) · package.json (`offline:check` placeholder that runs the socket-guard
  tests that exist so far; WP6 fills it in)

ACCEPTANCE CRITERIA (Given/When/Then)
- WP0-1 (P1–P4 contract) Given the app starts, when GET /openapi.json is read, then it lists POST allocation/plan,
  POST overflow/route, POST simulator/run, POST dispatch/notices, GET dispatch/brief/{ward_id}.html, POST plans,
  GET plans, GET plans/compare with the request and response schemas of contracts §2.
- WP0-2 (P5 provenance) Given any Phase 2 stub endpoint, when it answers, then the body has model_version, git_sha,
  data_as_of and offline.
- WP0-3 Given an invalid request (stock_pct 20, h_end < h_start, both deployments and auto_crews, neither ward_ids nor
  scope), when posted, then 422 problem+json names the field.
- WP0-4 (slice rule) Given the code, when `node .orca-team/tools/gates.mjs slices` runs, then no feature imports another
  feature (plans uses core/command_requests and shared/plan_registry).
- WP0-5 Given migration 0002, when db:check runs up → down → up, then it passes and the three tables exist with the
  indexes and check constraint of contracts §6.

TESTS: tests/test_p2_contracts.py — one schema-valid fixture round-trip per endpoint; the four 422 cases above;
MONOTONE_RAIN_FEATURES equals ml/train.py monotone_constraints_for_horizon for h = 2, 3, 4 (the sets);
contract drift test stays green.
GATE TO PASS: node .orca-team/tools/gates.mjs contracts slices migrations · npm run ci
MERGE ORDER: 1st (blocks WP1–WP6).

WORKER RULES: never end your turn while a command is still running; small commits
"version-onsite-final: core: <what>" with `Co-Authored-By: Gemini 4 Neon <noreply@google.com>`; edit only owned paths;
contract questions go to LEAD with `orca orchestration ask` — do not change a contract on your own. Do not implement
the maths: bodies stay NotImplementedError; stubs return fixtures. Finish with worker_done listing commits and gates.
