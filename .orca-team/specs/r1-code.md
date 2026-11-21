ROLE: REVIEWER-CODE
LEAD_BRANCH: lead
TASK: r1-code — Review round 1 (cross-family: every merged builder change was written by Gemini and approved by a Gemini LEAD)
SKILLS: code-review, production-standards, find-bugs, web-design-guidelines, webapp-testing
DIFF RANGE: git diff c0a05a8...lead   (base = PRD lock). Ignore lockfiles (package-lock.json, uv.lock), generated
  files (apps/web/src/lib/api/schema.d.ts, contracts/openapi.json) and .agents/.claude skill copies.
AUTHORS IN RANGE: data (apps/api/app/adapters/db, app/shared/features.py, app/features/{wards,lags,weather},
  migrations, scripts) DATA antigravity Gemini 4 Neon (XHigh) · evals (apps/api/evals, tests/integration,
  tests/load, docs/test-plan.md) QA Neon · brand (apps/web brand tokens, /brand, public/brand) UI-2 Gemini 4
  Hydrogen (XHigh) · dashboard (apps/web/src/features, e2e, docs/ux) UI Neon · docs/system-design.md DESIGN Neon ·
  commit ff89e58 "fix(arch)" and contract edits in apps/api/app/core/* written by the Neon LEAD.
FOCUS, in order:
  1. Correctness of the lag/feature pipeline (app/shared/features.py): lags grouped by ward_id on date-sorted rows,
     no cross-ward leakage, no data after origin_week, normals fit on years ≤ 2023 only (PRD AC-2, AC-3, ADR-0004).
  2. Eval integrity (apps/api/evals): hold-out 2024–2025 really locked by SHA-256 before tuning; golden cases and
     scoring match docs/KICKOFF-PROMPT.md §5; no way for training to see the hold-out.
  3. Contract conformance: routes match contracts/openapi.json; problem+json errors; core/types.py changes
     (WARD_ID_PATTERN was loosened by the Neon LEAD — is unknown-ward still a 404 per AC-2/AC-4?).
  4. Dashboard: every PRD AC-6/AC-7/AC-8 state exists (empty/loading/error/success), tiers show EN/BN label +
     1–4 meter, no hard-coded hex (tokens only), Lime never in data views, a11y (WCAG 2.2 AA).
  5. Setup path (scripts/setup.mjs, package.json): works on Windows without uv, ≤ 180 s, zero keys.
GOLDEN PATH: docs/PRD.md "Golden path" steps 1–5 (forecast slice is still a stub until core-forecast merges).
HOW TO RUN: npm run ci · npm run dev:api · npm run dev:web · node .orca-team/tools/gates.mjs migrations contracts slices retrieval e2e
REPORT: .orca-team/reviews/r1-code.md (only file you may write); title line contains
  "reviewer: claude/opus-5.5 (max)". Severity BLOCKER/HIGH/MEDIUM/LOW · file:line · why · concrete fix ·
  verdict SHIP / FIX-BLOCKERS / REWORK. Max 25 findings, most severe first; group fixes by owner seat
  (DATA, QA, UI, UI-2, LEAD) so LEAD can route them. Commit it on your branch ("docs(review): r1 code review"),
  then worker_done with the verdict and counts per severity. Do not edit any code.
Time box: 45 minutes.
