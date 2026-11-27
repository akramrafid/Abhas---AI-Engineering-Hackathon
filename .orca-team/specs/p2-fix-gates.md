ROLE: CORE + QA · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-gates — make `contract` and `load` honest and green (QA Q3, Q4, Q12, Q13)
PRIORITY: P2 (MEDIUM)
SKILLS: production-hardening, sqa-testing, api-design-principles, verification-before-completion

## Problems
- **Q3 `test:contract` is red depending on the seed.**
  - Seed: `50551620195904918134333368941541352245`.
  - A body over 64 KB to `POST /api/v1/chat/stream` correctly gets `413 payload-too-large`, as problem+json.
  - 413 is not in the documented responses, so Schemathesis ST201 reports "Schema-violating request accepted".
- **Q4 `load` is red.**
  - p95 was 513 ms and 418 ms against the 300 ms threshold, with 0 % errors.
  - The run shared the host with other QA lanes.
  - `tests/load/smoke.js` hits only Phase 1 endpoints.
- **Q12 e2e and the test-mode API write into the demo database `data/abhas.db`** (`apps/api/app/core/config.py:45`).
  - Each run adds 4 plans, so the compare drawer fills with test plans before the demo.
  - With `reuseExistingServer: false`, `npm run e2e` aborts whenever any `next dev` is running in `apps/web`.
- **Q13 `npm run eval` rewrites 4 tracked files** (`apps/api/evals/history.jsonl`, `report.md`, `results/eval.json`,
  `results/latest-heldout.json`), so a fresh clone becomes dirty.

## Owned paths
- `apps/api/app/core/errors.py`: add 413 to `PROBLEM_RESPONSES`; the same applies if a separate POST responses map
  exists.
- `contracts/openapi.json` and `apps/web/src/lib/api/schema.d.ts`, only by running
  `npm run contracts && npm run web:types`.
- `tests/load/smoke.js`
- `apps/web/playwright.config.ts`
- `apps/api/app/core/config.py`: the test-mode database URL only.
- `apps/api/evals/run.py`: output paths only.
- `.gitignore`

## Expected behaviour
1. **413 documented.** Every POST operation documents a 413 problem+json response. Re-running Schemathesis with the
   seed above passes.
2. **Phase 2 load test.**
   - Add weighted Phase 2 requests to `tests/load/smoke.js`:
     - `allocation/plan` scope all, stock 60, crews 10;
     - `overflow/route` scope all;
     - `simulator/run` with 3 deployments;
     - `dispatch/notices` scope Dhaka South, EN SMS.
   - Keep the p95 < 300 ms threshold for Phase 1 GETs.
   - Use per-endpoint thresholds for Phase 2. Allocation with crews is measured at about 139 ms p95 warm.
   - Run the gate alone on an idle machine and record the result in `.orca-team/GATES.md`.
3. **Test database isolation.**
   - When `APP_ENV=test`, the API defaults to `data/abhas-test.db` unless `DATABASE_URL` is set; `npm run setup`
     still seeds `data/abhas.db`.
   - Playwright seeds or migrates the test database through the existing setup step before starting.
   - Add `data/abhas-test.db*` to `.gitignore`.
4. **e2e alongside a dev server.** e2e runs while a developer has `npm run dev` open. Set
   `NEXT_DIST_DIR=.next-e2e`, or use `reuseExistingServer: !process.env.CI` with distinct ports. Pick one approach
   and document it in README "Testing".
5. **Eval output.** `npm run eval` writes run artefacts to `apps/api/evals/results/runs/<timestamp>/` (gitignored) and
   updates the tracked `latest-*.json` / `history.jsonl` only with `--record`. The `eval` gate passes `--record` only
   when LEAD runs it for a release.

## Tests that prove the fix
- `uvx schemathesis run … --seed 50551620195904918134333368941541352245` (the `test:contract` command with that
  seed) exits 0.
- `npm run load` on an idle machine exits 0, with the Phase 2 scenarios in the summary.
- Run `npm run e2e` twice. `GET /api/v1/plans` on the dev database (`data/abhas.db`) shows no new plans.
- On a fresh clone, `npm run eval` followed by `git status --porcelain` prints nothing.

## Gate
`node .orca-team/tools/gates.mjs contract load e2e eval`. One commit per item:
`version-onsite-final: fix(gates): <item>`.
