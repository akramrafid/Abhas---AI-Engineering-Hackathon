ROLE: QA · roles 11–12 · hat prove
LEAD_BRANCH: lead   TASK: fix-r1-qa — Fix r1 findings CR-4, CR-5, CR-6, CR-11, CR-14, CR-15
OWNED PATHS: apps/api/evals/** (not evals/redteam*) · apps/api/tests/integration/** · scripts/smoke.mjs · tests/load/** · docs/test-plan.md
FINDINGS TO FIX:
  CR-4: --lock refuses to overwrite an existing heldout_sha256 (needs --relock, logged); tamper check never skipped;
        load_raw_dataset verifies the dataset SHA-256 (reuse EXPECTED_SHA256 from scripts.seed).
  CR-5: dev split must not score the artifact in-sample: pass the artifact's stored normals/max_normal_year;
        refuse --split dev for an artifact with train_end_year > 2018 and point dev scoring at ml/backtest.py folds.
  CR-6: NFR-1 p95 from 200 single-row calls timing feature build + predict; keep amortized number separately.
  CR-11: smoke requires 404 with type ending /unknown-ward.
  CR-14: write eval.json only for --split heldout.
  CR-15: count climatology-fallback rows as skipped; fail the held-out run when > 0.
  Start this only after core-forecast is merged (it hooks the model into evals) — LEAD dispatches it then.
GATE TO PASS: node .orca-team/tools/gates.mjs eval retrieval  (+ npm run ci)
SKILLS: production-standards, production-hardening, receiving-code-review, verification-before-completion, eval-engineering, sqa-testing
READ FIRST: .orca-team/reviews/r1-code.md (the findings below quote file:line and the exact fix), AGENTS.md §6, docs/PRD.md.
DONE WHEN: each finding has a test proving the fix where testable (name tests after the CR id, e.g. test_cr_7_...),
  `npm run ci` is green, the gates listed below pass, and your worker_done report maps finding → commit → test.
  Small commits on your branch: "qa: fix CR-n <what>". Never edit files outside OWNED PATHS; need one → orca orchestration ask LEAD.
  Claude Opus reviews your branch before merge.
