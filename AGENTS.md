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

## 2. Roles, skills, models, fallbacks

Three subscriptions = separate quota pools. Spread parallel work across pools.

| Role | Owns | Load these skills | Orca `--agent` | Primary model | Fallback ladder (move right when out of quota) |
|---|---|---|---|---|---|
| **LEAD** | plan, contracts, skeleton, dispatch, merge, ship | `swarm-lead`, `credentials-gate`, `architecture-blueprint` | `claude` | `opus`, effort `high` | agy `AG_OPUS` → agy `ARGON` → opencode `OC_STRONG` |
| **BUILDER-CORE** | API, domain logic, LLM / RAG / agent pipelines | `production-standards` + per task: `backend-api`, `llm-engineering`, `rag-pipeline`, `ai-agents`, `data-layer` | `claude` | `sonnet`, effort `high` | agy `AG_SONNET` → opencode `OC_STRONG` → agy `G_PRO` |
| **BUILDER-UI** | frontend, UX, client state | `production-standards`, `frontend-app` | `antigravity` | `G_HYDROGEN`, effort `xhigh` | agy `G_PRO` → claude `sonnet` → opencode `OC_STRONG` |
| **BUILDER-DATA** (optional) | DB schema, migrations, ingestion/ETL, seed data | `production-standards`, `data-layer`, `rag-pipeline` | `opencode` | `OC_STRONG` | agy `G_HYDROGEN` (high) → claude `sonnet` |
| **BUILDER-QA** | tests, evals, CI, Docker, scripts, README, demo | `production-standards`, `testing-qa`, `devops-deploy`, `demo-readiness` | `opencode` | `OC_STRONG` | claude `haiku` → agy `G_FLASH` → claude `sonnet` |
| **REVIEWER-CODE** | correctness / quality review | `production-standards`, `code-review` | `claude` | `best`, effort `xhigh` | claude `opus` (xhigh) → agy `AG_OPUS` → agy `ARGON` |
| **REVIEWER-SEC** | security review | `security-review` | `antigravity` | `ARGON` | agy `G_PRO` → claude `opus` (xhigh) → opencode `OC_STRONG` |
| **SCOUT** (optional) | read-only lookups, docs, codebase Q&A | — | `claude` | `haiku` | agy `G_FLASH` → opencode `OC_STRONG` |

LEAD may run two workers of the same role at once (e.g. `core-rag`, `core-api`) only with disjoint owned paths.
Concurrency caps (defaults): Claude workers ≤ 2 besides LEAD · Antigravity ≤ 2 · OpenCode ≤ 2 · builders ≤ 5.

### Model IDs (verify once with `/model` in each tool)
```
claude:      best | opus | sonnet | haiku        (aliases for `claude --model`)
             best = newest Fable your plan allows, else Opus 5.5. If Fable asks for usage credits and you
             don't want that, set REVIEWER-CODE primary to `opus`.
antigravity: G_HYDROGEN = "Gemini 4 Hydrogen"    (BUILDER-UI with --effort xhigh; agy's default)
             ARGON      = "Gemini 4 Argon"
             G_PRO      = "Gemini 3.1 Pro (High)"
             G_FLASH    = "Gemini 3.8 Flash"
             AG_OPUS    = "Claude Opus 5.5 (Thinking)"
             AG_SONNET  = "Claude Sonnet 5.5 (Thinking)"
opencode:    OC_STRONG  = OpenCode's default model (picked by the human in `/models`). Never pass --model.
```
### Quota pools (Orca's bottom usage bar)
Claude Code · Antigravity "Gemini" · Antigravity "Claude/GPT" (AG_OPUS + AG_SONNET) · Antigravity "Gemini 4 Argon" ·
OpenCode Go (one dollar budget for all its models). A fallback in the SAME pool doesn't help when that pool is
exhausted — skip to a rung in another pool.

### Review independence
Claude-written code gets its security review from Gemini; Gemini-written code (BUILDER-UI) gets its code review
from Claude. If fallbacks put both reviewers on one model family, LEAD logs it and adds the missing checklist.

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
LEAD's own quota runs out → human opens agy in the `lead` worktree, `/model` → `AG_OPUS` (or `ARGON`), types:
`ROLE: LEAD. Load swarm-lead. Resume from .orca-team/STATUS.md.` — so keep STATUS.md current.

## 5. LEAD protocol (summary — full detail in skill `swarm-lead`)

0. Bootstrap: `orca status --json`; `orca skills get orchestration --full`; `orca skills get orca-cli`
   (the version-matched guides win over anything here); `orca repo list --json`; `LEAD_BRANCH` = current branch.
1. Intake → `.orca-team/PLAN.md` (requirements, MUST/SHOULD/WOW, acceptance criteria).
2. Credentials gate (skill `credentials-gate`): ask the human ONCE, early; keep working while they fill `.env`.
3. Architecture + contracts + runnable skeleton (skill `architecture-blueprint`); commit on `LEAD_BRANCH`.
4. Decompose into ≤ 45-min tasks with disjoint ownership; route by §2; dispatch all ready tasks:
   `orca orchestration run-create --objective "<one line>" --json`
   `orca orchestration task-create --task-title "<ROLE>: <title>" --spec "<spec>" [--deps '["<taskId>"]'] --json`
   `orca orchestration worker-start --task <taskId> --worktree new-child --name <role>-<slug> --agent <agent> [--model <m>] [--effort <e>] --setup run --json`
   (`--effort` for claude/antigravity only; never `--model` for opencode.)
5. Wait without polling loops: end the turn, or one blocking
   `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json`.
   Reply: `orca orchestration reply --id <msgId> --body "..."` · one worker: `orca orchestration send --to dispatch:<id> --subject "..." --body "..." --json` · all: `--to @all`.
6. Integrate each finished branch into `LEAD_BRANCH` (`git merge --no-ff`), run all tests + smoke.
7. Reviews in parallel (`--worktree current`, read-only): REVIEWER-CODE + REVIEWER-SEC → `.orca-team/reviews/`.
   Gate shipping: `orca orchestration gate-create --task <id> --reason "..."` / `gate-resolve --gate <id> --decision approve --note "..."`.
8. Fix loop (max 2 full rounds), then `demo-readiness`, then report to the human. Release workers with
   `orca orchestration worker-release --dispatch <id> --json`. Update STATUS.md after every step.

## 6. BUILDER rules

1. Read `TASK.md`, `.orca-team/PLAN.md`, your spec; load the skills your spec lists (+ `production-standards`).
   If PLAN.md still says `PLACEHOLDER`, run `git merge <LEAD_BRANCH>` first.
2. Run `node .orca-team/tools/envtool.mjs check`. Missing keys you need → `orca orchestration ask` LEAD, build
   against the mock/local path meanwhile. `.env` changed upstream → `node .orca-team/tools/envtool.mjs sync`.
3. Edit only owned paths. Contract change needed → `ask` LEAD and end your turn.
4. Dependencies: only what your task needs, only in the manifest you own; list them in your report.
5. Small commits on your branch: `<role>: <what>`. Never push, never touch `main`, never rebase/merge others
   (except merging `LEAD_BRANCH` when told).
6. Use the dev port PLAN.md assigns you. Shared infra (DB, Qdrant, Redis) is started once by LEAD; don't start
   your own copies.
7. Done = the definition of done in `production-standards` + your acceptance criteria pass.
8. Finish: final commit, then send `worker_done` exactly as your Orca preamble shows (its injected IDs and
   `--outcome succeeded|failed`). Body: branch · commits · what works · how to test · gaps · new deps · new env vars.
9. Usage/rate limit hit → print `LIMIT HIT: <agent>/<model>` and stop. Manual mode (no Orca orchestration) →
   write `.orca-team/handoff/<ROLE>.md` with the step-8 report and commit it.

## 7. REVIEWER rules

Read-only except your report file. Load your skill (`code-review` / `security-review`) and follow its report
format: severity BLOCKER/HIGH/MEDIUM/LOW · `file:line` · why · concrete fix · verdict `SHIP` / `FIX-BLOCKERS` /
`REWORK`. Commit the report, then `worker_done` with the verdict and counts.

## 8. Conventions

- Branches: `<role>-<slug>` builders · `race-<slug>-<agent>` races · `LEAD_BRANCH` integrates.
- Commands: the project's root `package.json` scripts are the single task runner (`npm run dev|test|lint|smoke|eval`).
- Secrets: only in `.env` (gitignored; Orca copies it into new worktrees via `.worktreeinclude`). `.env.example`
  is committed and documents every variable.
- Files: `TASK.md` (problem) · `.orca-team/PLAN.md` (LEAD) · `.orca-team/STATUS.md` (LEAD) ·
  `.orca-team/CREDENTIALS.md` (LEAD) · `.orca-team/reviews/` · `.orca-team/handoff/`.
- Nobody edits `AGENTS.md`, `CLAUDE.md` or the skills during the event.
