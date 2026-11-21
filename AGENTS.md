# AGENTS.md — Hackathon Swarm Constitution (Orca · Claude Code · OpenCode · Antigravity)

Read automatically by **OpenCode** and **Antigravity CLI (agy)**; **Claude Code** reads it via `CLAUDE.md`.
This file is short on purpose. The detailed playbooks are **skills** (§2). Load the skills for your role.

## 0. Golden rules (everyone, always)

1. **The task is in `TASK.md`.** Never ask the human to restate it. Missing detail → make the most
   reasonable assumption, record it in `.orca-team/STATUS.md` → "Assumptions", keep moving.
2. **Production grade is the bar.** Every builder and reviewer loads `production-standards` before working.
   Hackathon speed changes *scope*, never *quality of what ships*: fewer features, all of them solid.
3. **Credentials are asked for, never invented.** Only LEAD asks the human (skill `credentials-gate`).
   Need a key you don't have? `orca orchestration ask` the LEAD. Never hardcode, print, log, commit, or
   paste secrets into prompts. Never read `.env` contents; check it with `node .orca-team/tools/envtool.mjs check`.
4. **Stay in your lane.** Edit only the paths your task spec says you own. Contracts/shared schemas change
   only through LEAD.
5. **Stop and ask the human only for irreversible actions:** pushing to `main`, public deploys, deleting data,
   spending money, submitting the project — and for credentials (via LEAD).
6. Orca CLI: use `$ORCA_CLI_COMMAND` if set, otherwise `orca` (Linux outside Orca terminals: `orca-ide`).

## 1. Which role am I?

1. Your Orca task spec / worker preamble has a line `ROLE: <NAME>`, or
2. the first line of your prompt says `ROLE: <NAME>`, or
3. you were started by the human in the `lead` worktree (or via `/kickoff`) → **LEAD**.

## 2. Seats, skills, models, fallbacks

Sixteen roles in five hats (Frame · Design · Build · Prove · Ship) are filled by the seats below. The full
role → skill → hand-off → gate map is in skill `swarm-lead` and `node .orca-team/tools/gates.mjs list`.
**Models live in one file: `.agents/skills/swarm-lead/references/model-routing.md`** — change them there only;
this table mirrors it.

| Seat · worker | Roles it fills | Load these skills | Primary: agent · model · effort | Out of quota → (in order) |
|---|---|---|---|---|
| **LEAD** | 1 PRD · 3 architecture · 8 integration; contracts, `gates.json`, merges, pushes, ARCHITECTURE.md | `swarm-lead`, `credentials-gate`, `product-requirements`, `solution-architecture`, `tech-lead-integration` | claude · `opus` · max | agy · Gemini 4 Neon (XHigh) |
| **DESIGN** | 4 system design · PRD and architecture critiques (read-only) | `system-design` | agy · Gemini 4 Neon (XHigh) | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max |
| **CORE** · `core-forecast` | 5 AI engineer · 9 backend · 15 LLMOps | `ai-engineering` / `backend-engineering` / `llmops-observability` (+ `claude-api` for the advisory) | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max |
| **DATA** · `data-pipeline` | 6 data · 7 database | `data-engineering` / `database-engineering` | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max |
| **UI** · `ui-dashboard` | 2 UX · 10 frontend | `ux-flow-design` / `frontend-engineering` + `frontend-design`, `vercel-react-best-practices`, `web-design-guidelines`, `webapp-testing` | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max |
| **UI-2** · `ui-brand` | brand kit, `/brand` page | `frontend-engineering` + `frontend-design`, `web-design-guidelines` | agy · Gemini 4 Hydrogen · xhigh | agy · Gemini 4 Neon · xhigh → claude · `opus` · max |
| **QA** · `qa-*` | 11 evals · 12 SQA · 14 deploy prep · 16 demo & docs | `eval-engineering` / `sqa-testing` / `vercel-deploy` / `demo-docs` (+ `webapp-testing`, `property-based-testing`) | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max |
| **REVIEWER-CODE** | every merge and review round (all builder code is Gemini-written) | `code-review`, `production-standards`, `find-bugs`, `web-design-guidelines`, `webapp-testing` | claude · `opus` · max | LEAD reviews the merge itself; Claude out → agy · Gemini 4 Neon (XHigh) |
| **REVIEWER-SEC** | 13 red team + security review | `ai-red-team`, `security-review`, `differential-review`, `semgrep`, `supply-chain-risk-auditor` | claude · `opus` · max; agy · Gemini 4 Neon · xhigh for LEAD-written contracts and core | agy · Gemini 4 Neon · xhigh |
| **OUTSIDER** | UX hallway test, scored demo dry run (read-only) | `webapp-testing` | claude · `opus` · max, fresh session with no project context | agy · Gemini 4 Neon (XHigh) (same family: log it) |

Only Claude Code (Opus 5.5) and Antigravity (Gemini 4 Neon, Gemini 4 Hydrogen) are used; no OpenCode,
Sonnet, Kimi or Muse. Every builder also loads `production-standards` and `verification-before-completion`;
fix tasks add `production-hardening` and `receiving-code-review`.
One worker per **feature slice**: slices own disjoint paths, so two builders can run at once.
Concurrency: Claude = LEAD + 1 Opus worker (REVIEWER-CODE / REVIEWER-SEC / OUTSIDER, one at a time) ·
Antigravity ≤ 4. Waves: Frame/Design = DESIGN + DATA + UI-2 · Build = CORE + DATA + UI + UI-2, then QA
replaces UI-2 · Prove = CORE + UI + QA (fix tasks).

### Model names for `worker-start` (verify once: `/model` in agy and Claude)
```
--agent claude       --model opus    --effort max      # Claude Opus 5.5
--agent antigravity  --model "Gemini 4 Neon (XHigh)"        # effort is part of the model id; Neon has no max
--agent antigravity  --model "Gemini 4 Hydrogen (XHigh)"
```
A name or effort is rejected → start without it, log it in STATUS.md "Model switches", fix model-routing.md.

### Quota pools
**Human rule: any Claude limit hit → Gemini 4 Neon (XHigh)** (LEAD and every Opus seat); **when the limit resets,
switch back to Claude Opus 5.5 max** for LEAD and every Opus seat (see model-routing.md rule 0).
Claude Code (Opus) · Antigravity Gemini (Neon, Hydrogen — may share one quota). **Out of quota → Gemini 4 Neon
xhigh**; if Neon is out too → Gemini 4 Hydrogen xhigh → Claude Opus 5.5 (only when the Claude slot is free).
LEAD logs every `LIMIT HIT`, keeps Neon max (DESIGN) tasks short, batches reviews per wave when Opus runs low,
and queues work rather than over-booking either quota.

### Review independence
A checker never shares the author's model family: Anthropic (Opus) · Google (Neon, Hydrogen). All review of
Gemini-written code is done by Opus; LEAD-written code (contracts, core) is security-checked by Neon; the
OUTSIDER hallway test and dry run are Claude because the UI and docs are Gemini-written. A fallback that puts a
checker in the author's family → LEAD adds a second checker from the other family and logs it in STATUS.md.

## 3. Skills — where they live and how to load them

Canonical copies: `.agents/skills/<name>/SKILL.md` (Antigravity, OpenCode). Mirror: `.claude/skills/` (Claude Code,
also read by OpenCode). Edit only `.agents/skills`, then run `node .orca-team/tools/sync-skills.mjs`.
Load a skill: Claude Code → Skill tool or `/<name>` · OpenCode → `skill` tool · agy → automatic or `/<name>`.
If a skill can't be loaded, open its `SKILL.md` and read it — the content is what matters.

## 4. Limits and failures (LEAD runs this; workers just report)

Signs: output contains `usage limit`, `rate limit`, `quota`, `429`, `exhausted`, `credits`, `overloaded`,
`LIMIT HIT`; no new output for 10 min; `worker-start` fails.
1. `orca orchestration worker-read --dispatch <dispatchId> --limit 50 --json` to confirm.
2. `orca orchestration worker-stop --dispatch <dispatchId> --json`.
3. Re-start the same task on the next ladder rung (another pool). New spec says
   "Continue from branch `<old-branch>`: run `git merge <old-branch>` first."
4. Log in STATUS.md → "Model switches". If `worker-start` rejects `--model`, start without it and log it.
Next rung = the seat's fallback in §2 (Gemini 4 Neon first).
LEAD's own quota runs out → human opens agy in the `lead` worktree, `/model` → Gemini 4 Neon (max), types:
`ROLE: LEAD. Load swarm-lead. Resume from .orca-team/STATUS.md.` — so keep STATUS.md current.

## 5. LEAD protocol (summary — full detail in skill `swarm-lead`)

Every phase ends on a runnable gate: `node .orca-team/tools/gates.mjs <id>` (`list` shows all 18).
0. Bootstrap: `orca status --json`; `orca skills get orchestration --full`; `orca skills get orca-cli`
   (the version-matched guides win over anything here); `orca repo list --json`; `LEAD_BRANCH` = current branch;
   `node .orca-team/tools/doctor.mjs`. Roles not needed (e.g. `Deploy: no`) → `skip` in `.orca-team/gates.json`.
1. Frame: `docs/PRD.md` (skill `product-requirements`; rubric, golden path, MUSTs, Given/When/Then ACs) and
   `.orca-team/PLAN.md` (template `swarm-lead/references/plan-template.md`). In parallel: credentials gate
   (skill `credentials-gate` — ask the human ONCE, keep working), UI → `ux-flow-design`, DESIGN → PRD critique.
   Exit: gate `prd`.
2. Design + contracts lock (skill `solution-architecture`): modular monolith, one vertical slice per MUST
   capability (`apps/api/app/features/<name>/`, `apps/web/src/features/<name>/`), ports & adapters around the
   LLM, embeddings, vector store and DB (blueprint §3). C4 + ADRs, walking skeleton from
   `solution-architecture/references/blueprint.md`, OpenAPI exported, first migration, eval set ≥ 30 cases.
   DESIGN seat → `system-design` once the architecture views are committed. Commit on `LEAD_BRANCH`.
   Exit: gates `prd adr contracts resilience slices`; broadcast "contracts locked" to `@all`.
3. Build one thin hardened slice (wave 1), then widen (waves 2–3). Tasks ≤ 45 min, disjoint ownership, specs from
   `swarm-lead/references/task-spec-template.md`, routed by §2:
   `orca orchestration run-create --objective "<one line>" --json`
   `orca orchestration task-create --task-title "<SEAT>: <title>" --spec "<spec>" [--deps '["<taskId>"]'] --json`
   `orca orchestration worker-start --task <taskId> --worktree new-child --name <seat>-<slug> --agent <agent> [--model <m>] [--effort <e>] --setup run --json`
   (`--effort` for claude/antigravity only; never `--model` for opencode.)
4. Wait without polling loops: end the turn, or one blocking
   `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json`.
   Reply: `orca orchestration reply --id <msgId> --body "..."` · one worker: `orca orchestration send --to dispatch:<id> --subject "..." --body "..." --json` · all: `--to @all`.
5. Integrate (skill `tech-lead-integration`): non-author review → `.orca-team/reviews/merge-<branch>.md` →
   `node .orca-team/tools/gates.mjs merge <branch>` (no-commit merge + `slices` check + `npm run ci`, commit or abort).
6. Prove — review rounds in parallel (`--worktree current`, read-only): REVIEWER-CODE + REVIEWER-SEC →
   `.orca-team/reviews/r<N>-*.md`; then `gates.mjs all` → `.orca-team/GATES.md`. BLOCKER/HIGH and red gates →
   fix tasks to the owner seat with `production-hardening`. Max 2 full rounds.
   Gate shipping: `orca orchestration gate-create --task <id> --reason "..."` / `gate-resolve --gate <id> --decision approve --note "..."`.
7. Ship (freeze = fixes only): gates `traces`, `fresh-clone`; ask the human before deploying; then `deploy`,
   OUTSIDER dry run (`dryrun`), and `gates.mjs promote`. Tell the human the exact merge/tag commands and wait.
   Release workers with `orca orchestration worker-release --dispatch <id> --json`. Update STATUS.md after every step.

## 6. BUILDER rules (seats UI, CORE, DATA, QA)

1. Read `TASK.md`, `.orca-team/PLAN.md`, your spec; load the skills your spec lists (+ `production-standards`).
   If PLAN.md still says `PLACEHOLDER`, run `git merge <LEAD_BRANCH>` first.
2. Run `node .orca-team/tools/envtool.mjs check`. Missing keys you need → `orca orchestration ask` LEAD, build
   against the mock/local path meanwhile. `.env` changed upstream → `node .orca-team/tools/envtool.mjs sync`.
3. Edit only owned paths — normally your feature slice. Never import another feature; services stay free of
   FastAPI, SDKs and the ORM (gate `slices`). Contract change needed → `ask` LEAD and end your turn.
4. Dependencies: only what your task needs, only in the manifest you own; list them in your report.
5. Small commits on your branch: `<seat>: <what>`. Never push, never touch `main`, never rebase/merge others
   (except merging `LEAD_BRANCH` when told).
6. Use the dev port PLAN.md assigns you. State is managed services (Neon Postgres branches, Qdrant Cloud or
   pgvector) set up by LEAD; no Docker, don't start your own copies.
7. Done = the definition of done in `production-standards` + your acceptance criteria pass + the gate on your
   spec's `GATE TO PASS` line (`node .orca-team/tools/gates.mjs <id>`) and `npm run ci` are green.
8. Finish: final commit, then send `worker_done` exactly as your Orca preamble shows (its injected IDs and
   `--outcome succeeded|failed`). Body: branch · commits · what works · how to test · gaps · new deps · new env vars.
9. Usage/rate limit hit → print `LIMIT HIT: <agent>/<model>` and stop. Manual mode (no Orca orchestration) →
   write `.orca-team/handoff/<ROLE>.md` with the step-8 report and commit it.

## 7. REVIEWER rules

Read-only except your report file. Load the skills on your spec (REVIEWER-CODE: `code-review` · REVIEWER-SEC:
`security-review`, `ai-red-team`) and follow the report format: severity BLOCKER/HIGH/MEDIUM/LOW · `file:line` ·
why · concrete fix · verdict `SHIP` / `FIX-BLOCKERS` / `REWORK`. Run `npm run ci` and the gates your spec names
as evidence. DESIGN critiques and OUTSIDER runs write only the output file their spec names, max 15 bullets. Commit the
report, then `worker_done` with the verdict and counts.

## 8. Conventions

- Branches: `<seat>-<feature>` builders, one per slice (e.g. `core-ask`, `ui-ask`) · `race-<slug>-<agent>` races · `LEAD_BRANCH` integrates.
- Commands: the project's root `package.json` scripts are the single task runner (`npm run dev:api|dev:web|ci|
  contracts|eval|eval:retrieval|db:check|test:contract|e2e|load|redteam|check:traces`); the gates call them.
- Checks: `node .orca-team/tools/gates.mjs list|<id>|hat <hat>|all|merge <branch>|promote` → `.orca-team/GATES.md`.
- Secrets: only in `.env` (gitignored; Orca copies it into new worktrees via `.worktreeinclude`). `.env.example`
  is committed and documents every variable.
- Files: `TASK.md` (problem) · `.orca-team/PLAN.md` (LEAD) · `.orca-team/STATUS.md` (LEAD) ·
  `.orca-team/CREDENTIALS.md` (LEAD) · `.orca-team/gates.json` (gate config, `skip`) · `docs/` (PRD, ux, adr,
  architecture, system-design) · `contracts/openapi.json` · `.orca-team/reviews/` · `.orca-team/handoff/`.
- Nobody edits `AGENTS.md`, `CLAUDE.md` or the skills during the event.
