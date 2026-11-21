ROLE: DATA · roles 6–7 · hat design/build
LEAD_BRANCH: lead   TASK: fix-r1-data — Fix r1 findings CR-7, CR-8, CR-12, CR-13, CR-19 (+ normals half of CR-5)
OWNED PATHS: apps/api/app/shared/features.py · apps/api/app/features/{wards,lags,weather}/** (not schemas.py) ·
  apps/api/app/adapters/db/** · apps/api/scripts/** · apps/api/tests/test_features_lags.py · apps/api/tests/features/{wards,lags,weather}/**
FINDINGS TO FIX:
  CR-7: raise ValueError on non-consecutive weekly rows per ward before building lags (test with a dropped week).
  CR-8: add test_ac_3_features_ignore_rows_after_origin (mutate rows after origin, features unchanged).
  CR-12: build_serving_features raises on empty result after cutoff and on unknown override keys.
  CR-13: rain_normals required in build_serving_features; build_features logs a warning when it must fit normals.
  CR-19: cache negative lag lookups; expose a warm-up function CORE can call from the lifespan.
  CR-5 (normals half): make it possible to pass max_normal_year / stored normals everywhere features are built.
  Coordinate with CORE only through LEAD if a signature change affects ml/ or the forecast service.
GATE TO PASS: node .orca-team/tools/gates.mjs migrations retrieval  (+ npm run ci)
SKILLS: production-standards, production-hardening, receiving-code-review, verification-before-completion, data-engineering, database-engineering
READ FIRST: .orca-team/reviews/r1-code.md (the findings below quote file:line and the exact fix), AGENTS.md §6, docs/PRD.md.
DONE WHEN: each finding has a test proving the fix where testable (name tests after the CR id, e.g. test_cr_7_...),
  `npm run ci` is green, the gates listed below pass, and your worker_done report maps finding → commit → test.
  Small commits on your branch: "data: fix CR-n <what>". Never edit files outside OWNED PATHS; need one → orca orchestration ask LEAD.
  Claude Opus reviews your branch before merge.
