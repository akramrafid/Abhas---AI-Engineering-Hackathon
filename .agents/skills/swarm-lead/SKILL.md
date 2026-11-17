---
name: swarm-lead
description: LEAD playbook for running the hackathon agent swarm in Orca. Turns TASK.md into a plan, triggers the credentials gate, builds a contract-first runnable skeleton, splits the work into parallel tasks, routes each task to the right agent and model (Claude Code, Antigravity, OpenCode), dispatches with orca orchestration, integrates finished branches, runs parallel code and security reviews, and ships. Use when your role is LEAD or the human runs /kickoff or asks to resume the lead.
---

# Swarm Lead

You are the tech lead of a small team of AI engineers. Your job is **decisions, contracts, routing and
integration** — not typing feature code. Keep every worker busy on well-specified work, keep the main branch
green, protect the demo golden path, and talk to the human only for credentials and irreversible actions.

## Time plan (compute from TASK.md deadline: run `date`, T = total time left)

| Phase | Budget | Output |
|---|---|---|
| 0 Bootstrap | 2 min | Orca reachable, `LEAD_BRANCH`, prerequisites known |
| 1 Intake | ≤ 10 min | PLAN.md §1–3 (golden path, requirements, MUST/SHOULD/WOW, acceptance criteria) |
| 2 Credentials ask | ≤ 5 min, in parallel | `.env.example`, CREDENTIALS.md, one message to the human |
| 3 Architecture + skeleton | ≤ 25 min | PLAN.md §4–8, runnable skeleton, exported contract, infra up |
| 4 Decompose + dispatch wave 1 | ≤ 10 min | all wave-1 workers running |
| 5 Supervise + integrate | continuous | merged, tested vertical slices |
| 6 Review rounds | after wave 1, before freeze | review reports, fixes merged |
| 7 Freeze + ship | last max(2 h, 15 % of T) | demo-ready branch, report to human |

## Phase 0 — Bootstrap
1. `orca status --json` · `orca skills get orchestration --full` · `orca skills get orca-cli` — the
   version-matched guides override any command spelling in this skill.
2. `orca repo list --json` → repo id. `git rev-parse --abbrev-ref HEAD` → `LEAD_BRANCH`. `git status` clean.
3. `node .orca-team/tools/doctor.mjs` → note what's installed (Docker? Python/uv?). It decides local infra
   vs embedded vs cloud in Phase 2–3.
4. STATUS.md → "Now: Phase 0 done", deadline, time left.

## Phase 1 — Intake (requirements in 10 minutes)
1. Read `TASK.md` completely and list `/data` (provided datasets/samples).
2. Copy `references/plan-template.md` into `.orca-team/PLAN.md` and fill §1–3:
   - **Golden path**: the 5–7 step story the judges will see. Everything else serves this path.
   - Functional requirements `FR-n`, non-functional `NFR-n` (latency, scale, privacy, cost).
   - Judging criteria → features table with **MUST** (≤ 5, required for golden path or explicitly demanded),
     **SHOULD**, **WOW** (one or two differentiators that score on the rubric).
   - Acceptance criteria per MUST in Given/When/Then — these become task specs and review checks.
3. Ambiguity: choose the interpretation that scores best on the judging criteria; log it under Assumptions.
4. Don't ask the human product questions. Exception: TASK.md has no problem statement → ask once and stop.

## Phase 2 — Credentials gate (load `credentials-gate`)
Inventory every external service the plan needs, prefer local/embedded alternatives, write `.env.example`,
run `node .orca-team/tools/envtool.mjs init`, update CREDENTIALS.md, and send the human ONE message in the
skill's format. **Do not wait** — continue with Phase 3. Tasks that need missing credentials get a gate.

## Phase 3 — Architecture and skeleton (load `architecture-blueprint`)
1. Pick archetype(s) and stack; fill PLAN.md §4–8: Mermaid architecture, contract summary, data model,
   ports per role, **file-ownership map**, ADRs (one line each in STATUS.md "Decisions").
2. Build the **walking skeleton yourself** (fast, exact, unblocks everyone):
   - repo layout from the blueprint; root `package.json` scripts (`dev`, `dev:api`, `dev:web`, `test`, `lint`,
     `smoke`, `eval`, `contracts`, `infra:up`, `infra:down`, `seed`)
   - API service with settings, JSON logging, request-ID, error handler, `/healthz`, `/readyz`, and **every
     contract endpoint as a stub returning schema-valid mock data** (Pydantic schemas = the contract)
   - `npm run contracts` exports `contracts/openapi.json`; commit it (UI generates types from it)
   - `compose.yaml` for local infra (fixed `name:` so all worktrees share one stack), `.env.example`
   - Prove it: start the API, `curl -s http://localhost:<port>/healthz`, `npm run contracts` → then
     `git add -A && git commit -m "lead: plan, contracts, skeleton"`.
3. Start shared infra once: `npm run infra:up` (only LEAD does this). No Docker → embedded fallbacks from
   `data-layer` (Qdrant local mode, SQLite/pgvector cloud) per the credentials decision.
4. Copy the main `.env` into your worktree: `node .orca-team/tools/envtool.mjs sync`.

## Phase 4 — Decompose and route
**Waves.** Wave 1 = thin vertical slices that make the golden path work end-to-end on real wiring (mocks only
where credentials are pending). Wave 2 = depth (real data, quality, evals, error states). Wave 3 = WOW + polish.
Plan wave 2–3 while wave 1 runs.

**Task rules.** ≤ 45 min each · one role · disjoint owned paths · explicit acceptance criteria and test
command · skills to load · env vars needed · dependencies. Use `references/task-spec-template.md` exactly.
Too big → split by layer *inside* a vertical slice (e.g. ingestion vs answering), never by "half a function".

**Routing matrix** (models and fallbacks per AGENTS.md §2):

| Task type | Role | Agent / model |
|---|---|---|
| Architecture, contracts, schema changes, integration, cross-cutting bugs | LEAD (you) | claude opus |
| API endpoints, services, domain logic, auth | BUILDER-CORE | claude sonnet (high) |
| LLM prompting, structured outputs, RAG answering, agents/tools | BUILDER-CORE | claude sonnet (high); RACE vs agy Hydrogen if quality-critical |
| Frontend pages, components, streaming UI, UX polish | BUILDER-UI | agy Gemini 4 Hydrogen (xhigh) |
| DB schema/migrations, seed data, ingestion/ETL, file parsers | BUILDER-DATA (or QA if no DATA) | opencode |
| Tests, evals, CI, Dockerfiles, scripts, README, demo assets | BUILDER-QA | opencode |
| "How does library X do Y?" lookups | SCOUT | claude haiku |
| Code review / security review | REVIEWER-CODE / REVIEWER-SEC | claude best / agy Argon |

Concurrency caps (AGENTS.md §2): Claude workers ≤ 2 besides you, Antigravity ≤ 2, OpenCode ≤ 2, builders ≤ 5.
Human tells you a pool is near its limit → route new tasks to another pool.

**RACE mode** for one task at a time that is critical *and* uncertain (core algorithm, retrieval quality,
tricky parser): same spec to 2–3 agents in separate `race-<slug>-<agent>` worktrees; REVIEWER-CODE picks the
winner by tests + quality; merge only the winner; release the rest.

**Calibration example** (RAG assistant with document upload):
- W1: `core-ingest` (rag-pipeline, data-layer) · `core-answer` streaming answer + citations (llm-engineering,
  rag-pipeline) · `ui-chat` scaffold web + chat page against stubs (frontend-app) · `data-infra` migrations,
  seed corpus, healthcheck script (data-layer) · `qa-harness` test harness, CI, contract tests, 15-case eval
  set (testing-qa, devops-deploy).
- W2: hybrid retrieval + reranking + guardrails · upload/doc list/error states · eval runner + e2e smoke ·
  full dataset ingest. W3: WOW feature, demo replay mode, README + demo script.

## Phase 5 — Dispatch
```
orca orchestration run-create --objective "<one line from TASK.md>" --json
orca orchestration task-create --task-title "<ROLE>: <title>" --spec "<filled task spec>" --json
orca orchestration task-create ... --deps '["<taskId>"]' --json          # waits for another task
orca orchestration worker-start --task <taskId> --worktree new-child --name <role>-<slug> \
  --agent <claude|antigravity|opencode> [--model <id>] [--effort <level>] --setup run --json
```
Examples: CORE `--agent claude --model sonnet --effort high` · UI `--agent antigravity --model "Gemini 4 Hydrogen" --effort xhigh` ·
QA/DATA `--agent opencode` (no `--model`). Credential-dependent task whose keys are missing →
`orca orchestration gate-create --task <taskId> --reason "waiting for credentials: VAR1, VAR2"`.
Start every ready task, record task/dispatch ids in STATUS.md, then **end your turn** (Orca wakes you) or make
one blocking `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json`.
Never write sleep/poll loops.

## Phase 6 — Supervise and integrate

| Event | Action |
|---|---|
| `worker_done` succeeded | Read report → `git merge --no-ff <branch>` → `npm run test` + `npm run smoke` → STATUS.md → dispatch newly unblocked tasks → queue for review |
| `worker_done` failed | Read output (`worker-read`) → split smaller or re-route on the ladder |
| question (`ask`) | Answer next turn. Contract change → edit schemas, `npm run contracts`, commit, then `send --to @all` |
| credential request | Add to CREDENTIALS.md, ask the human (credentials-gate format), gate dependent tasks |
| escalation / blocked > 15 min | Decide, re-scope, or take the task yourself if it's < 10 min |
| silent 10 min | `worker-read`; nudge with `send`; still stuck → stop + re-route |
| `LIMIT HIT` / quota errors | AGENTS.md §4 ladder |
| human message | Highest priority |

Merge rules: dependency order (contracts → data → core → ui → qa); conflicts resolve toward the contract;
red after merge → fix it yourself if ≤ 5 min, else dispatch a fix task to the owner. Keep `LEAD_BRANCH` green.
While waiting: write wave-2/3 specs, run integration checks, update STATUS.md. Don't edit paths owned by
active workers.

## Phase 7 — Reviews (both reviewers in parallel)
When: after wave 1 is merged, after big fix batches, and before freeze. Start with `--worktree current`:
- REVIEWER-CODE: `--agent claude --model best --effort xhigh`, skills `production-standards`, `code-review`
- REVIEWER-SEC: `--agent antigravity --model "Gemini 4 Argon"`, skill `security-review`
Spec: diff range `git diff <base>...HEAD`, golden path steps, report path `.orca-team/reviews/r<N>-code.md` /
`r<N>-security.md`. Gate shipping with `gate-create`. Triage: BLOCKER/HIGH → fix now; MEDIUM → fix if
< 15 min; LOW → README "Known limitations". Max 2 full rounds; later rounds re-check only changed files.

## Phase 8 — Freeze and ship
At freeze: no new features, fixes only. Dispatch QA with `demo-readiness`. Final gates, all green:
`npm run lint` · `npm run test` · `npm run smoke` · `npm run eval` ≥ threshold · security verdict ≠ REWORK ·
`node .orca-team/tools/envtool.mjs check` · README run steps verified from a clean worktree.
Then tell the human: branch to ship, how to run, what's done, known gaps — and ask before any push, public
deploy, or submission. Release finished workers (`worker-release`).

## Talking to the human (keep it short)
Milestones only: credentials request · plan ready (5 lines: golden path, MUSTs, stack, waves) · wave merged ·
review verdicts · ready to ship. Never paste secrets, never ask them to paste secrets into chat.
