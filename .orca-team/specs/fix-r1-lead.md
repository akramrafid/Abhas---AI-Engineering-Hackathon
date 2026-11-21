ROLE: CORE · fixes on LEAD-owned contract/setup files (LEAD delegated: human rule = Neon writes all code) · hat build
LEAD_BRANCH: lead   TASK: fix-r1-lead — Fix r1 findings CR-1 (BLOCKER), CR-3 (HIGH), CR-10, CR-16
OWNED PATHS: scripts/setup.mjs · apps/api/app/core/** · apps/api/app/features/*/schemas.py · apps/api/app/main.py ·
  contracts/openapi.json (regenerate only via `npm run contracts`) · apps/api/tests/test_skeleton.py · apps/api/tests/test_contract_*.py
FINDINGS TO FIX:
  CR-1 BLOCKER scripts/setup.mjs: shell only for PATH shims; absolute exe paths (venv python) must bypass the shell.
       Prove: run the no-uv branch from a folder whose path contains a space (temporarily hide uv from PATH).
  CR-3 HIGH contract: dataset-mode origin_week range 2016-02-29…2025-12-29 as a field validator (422 naming
       body.origin_week) on ForecastRequest and ScenarioRequest; heatmap query too. Keep live mode unrestricted.
       Re-export contracts (`npm run contracts`), keep the drift test green. (Unknown-ward 404 on /forecast and
       /scenario is CORE's job in core-forecast — do not touch the routers.)
  CR-10 config: normalise APP_ENV "prod" → "production" (or drop it) so production guards apply.
  CR-16 /readyz: ready only after the DB is migrated and seeded (ward count > 0); expose a hook CORE can extend for
       the model load (e.g. app.state.checks dict) — do not load the model yourself.
GATE TO PASS: node .orca-team/tools/gates.mjs contracts slices  (+ npm run ci)
SKILLS: production-standards, production-hardening, receiving-code-review, verification-before-completion, backend-engineering
READ FIRST: .orca-team/reviews/r1-code.md (the findings below quote file:line and the exact fix), AGENTS.md §6, docs/PRD.md.
DONE WHEN: each finding has a test proving the fix where testable (name tests after the CR id, e.g. test_cr_7_...),
  `npm run ci` is green, the gates listed below pass, and your worker_done report maps finding → commit → test.
  Small commits on your branch: "lead-delegated: fix CR-n <what>". Never edit files outside OWNED PATHS; need one → orca orchestration ask LEAD.
  Claude Opus reviews your branch before merge.
