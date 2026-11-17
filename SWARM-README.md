# Hackathon Swarm Kit v2 — Orca · Claude Code · OpenCode · Antigravity

You paste the problem into `TASK.md` and type `/kickoff` in a Claude pane. The LEAD agent plans the system,
asks you for any credentials, builds a runnable skeleton, splits the work into parallel tasks, sends each task
to the right agent and model, merges results, runs parallel code + security reviews, and gets the demo ready.

## What's inside
| Path | Purpose |
|---|---|
| `AGENTS.md` | The constitution: roles, models, fallbacks, skills per role, rules (read by every agent) |
| `CLAUDE.md` | Claude Code entry point (imports AGENTS.md + TASK.md) |
| `TASK.md` | **The only file you edit on the day** — paste the problem statement |
| `.agents/skills/` | 15 skills (canonical) — read by Antigravity and OpenCode |
| `.claude/skills/` | Mirror of the same skills — read by Claude Code |
| `.claude/commands/kickoff.md` | `/kickoff` — starts the LEAD |
| `.claude/commands/swarm-status.md` | `/swarm-status` — 12-line status summary |
| `.claude/settings.json` | Claude permissions: auto-accept edits, common commands allowed, `.env` unreadable |
| `opencode.json` | OpenCode: reads TASK.md + PLAN.md, permissions |
| `.orca-team/PLAN.md` · `STATUS.md` · `CREDENTIALS.md` | LEAD's plan, live log, credential requests |
| `.orca-team/tools/doctor.mjs` | Checks every tool and repo setting |
| `.orca-team/tools/envtool.mjs` | `.env` helper that never prints values (`where`, `init`, `check`, `sync`) |
| `.orca-team/tools/sync-skills.mjs` | Copies `.agents/skills` → `.claude/skills` after you edit a skill |
| `.orca-team/setup-worktree.ps1` / `.sh` | Orca's setup command: installs dependencies in each new worktree |
| `.worktreeinclude` | Orca copies your `.env` into each new worktree |

## The 15 skills
| Skill | Used by | What it makes the agent do |
|---|---|---|
| `swarm-lead` | LEAD | Intake → credentials → skeleton → decompose → route → dispatch → integrate → review → ship |
| `credentials-gate` | LEAD | Find every key/service needed, prefer local, ask you once, verify without reading values |
| `architecture-blueprint` | LEAD (+ all) | Default stack, repo layout, ownership, ports, archetypes, contract-first workflow |
| `production-standards` | all builders + reviewers | The production bar + definition of done |
| `backend-api` | CORE | FastAPI patterns: settings, logging, errors, health, streaming, layering |
| `llm-engineering` | CORE | LLM adapter, fallbacks, structured outputs, prompts as files, injection safety, evals |
| `rag-pipeline` | CORE / DATA | Ingest, chunk, embed, Qdrant/pgvector, hybrid retrieval, citations, RAG evals |
| `ai-agents` | CORE | Tool registry, bounded agent loop, approvals, SSRF/sandbox safety, MCP |
| `data-layer` | DATA / CORE | Compose infra, schema, migrations, seed, datasets, healthcheck |
| `frontend-app` | UI | Next.js + typed API client, streaming chat, safe Markdown, four UI states |
| `testing-qa` | QA | Test harness, contract drift test, evals runner, smoke, Playwright |
| `devops-deploy` | QA / LEAD | Dockerfiles, one-command compose, CI, deploy checklist |
| `code-review` | REVIEWER-CODE | Verify, review, severity, verdict, RACE winner, report |
| `security-review` | REVIEWER-SEC | Threat model, scans, OWASP web/API/LLM checks, hands-on attacks, report |
| `demo-readiness` | QA / LEAD | Clean-clone check, README, 3-min demo script, demo safety, submission |

## Commands you'll use
```
node .orca-team/tools/doctor.mjs            # is everything installed?
node .orca-team/tools/envtool.mjs where     # which .env file do I edit?
node .orca-team/tools/envtool.mjs check --main   # which keys are still missing? (names only)
node .orca-team/tools/sync-skills.mjs       # after editing a skill in .agents/skills
```
In the LEAD's Claude pane: `/kickoff` to start · `/swarm-status` for a summary · type `creds done` after
filling `.env`.

## Manual mode (if `orca orchestration` misbehaves)
Create one Orca worktree per role with the right agent and paste one line:
```
ROLE: BUILDER-CORE. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md §8. Load your skills.
ROLE: BUILDER-UI. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md §8. Load your skills.
ROLE: BUILDER-QA. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md §8. Load your skills.
ROLE: REVIEWER-CODE. Review git diff main...lead. Report to .orca-team/reviews/r1-code.md
ROLE: REVIEWER-SEC. Review git diff main...lead. Report to .orca-team/reviews/r1-security.md
```
Then tell the LEAD which branches are finished so it merges them.
