# Hackathon Swarm Kit v4 — Orca · Claude Code · OpenCode · Antigravity

You paste the problem into `TASK.md` and type `/kickoff` in a Claude pane. The LEAD agent plans the system,
asks you for any credentials, writes the PRD, locks the contracts, builds one thin end-to-end slice, splits the
work across 16 roles in five hats (Frame · Design · Build · Prove · Ship), sends each task to the right agent and
model, merges through the merge gate, runs code + security reviews, and ships when every gate is green.

## What's inside
| Path | Purpose |
|---|---|
| `AGENTS.md` | The constitution: roles, models, fallbacks, skills per role, rules (read by every agent) |
| `CLAUDE.md` | Claude Code entry point (imports AGENTS.md + TASK.md) |
| `TASK.md` | **The only file you edit on the day** — paste the problem statement |
| `.agents/skills/` | Skills (canonical) — read by Antigravity and OpenCode |
| `.claude/skills/` | Mirror of the same skills — read by Claude Code |
| `.claude/commands/kickoff.md` | `/kickoff` — starts the LEAD |
| `.claude/commands/swarm-status.md` | `/swarm-status` — 12-line status summary |
| `.claude/settings.json` | Claude permissions: auto-accept edits, common commands allowed, `.env` unreadable |
| `opencode.json` | OpenCode: reads TASK.md + PLAN.md, permissions |
| `.orca-team/PLAN.md` · `STATUS.md` · `CREDENTIALS.md` | LEAD's plan, live log, credential requests |
| `.orca-team/tools/doctor.mjs` | Checks every tool and repo setting |
| `.orca-team/tools/envtool.mjs` | `.env` helper that never prints values (`where`, `init`, `check`, `sync`) |
| `.orca-team/tools/gates.mjs` + `.orca-team/gates.json` | The 18 runnable done checks, one per role (`list`, `<id>`, `all`, `merge`, `promote`) |
| `.orca-team/tools/with-server.mjs` · `vercel-env.mjs` | Run a check against a test server · push `.env` to Vercel without printing values |
| `.orca-team/tools/sync-skills.mjs` | Copies `.agents/skills` → `.claude/skills` after you edit a skill |
| `.orca-team/setup-worktree.ps1` / `.sh` | Orca's setup command: installs dependencies in each new worktree |
| `.worktreeinclude` | Orca copies your `.env` into each new worktree |

## The skills
Each role skill names its hand-off files and its done check (`node .orca-team/tools/gates.mjs <check>`).

| Hat | # | Role | Skill | Seat | Done check |
|---|---|---|---|---|---|
| Frame | 1 | Product owner / requirements | `product-requirements` | LEAD | `prd` |
| Frame | 2 | UX designer | `ux-flow-design` | UI | `ux` |
| Design | 3 | Solution architect | `solution-architecture` | LEAD | `adr`, `contracts` |
| Design | 4 | System designer | `system-design` | DESIGN | `resilience` |
| Design | 5 | AI engineer | `ai-engineering` | CORE | `baseline` |
| Design | 6 | Data engineer | `data-engineering` | DATA | `retrieval` |
| Design | 7 | Database engineer | `database-engineering` | DATA | `migrations` |
| Build | 8 | Tech lead / integrator | `tech-lead-integration` | LEAD | `merge`, `promote`, `slices` |
| Build | 9 | Backend engineer | `backend-engineering` | CORE | `contract` |
| Build | 10 | Frontend engineer | `frontend-engineering` | UI | `e2e` |
| Prove | 11 | Eval engineer | `eval-engineering` | QA | `eval` |
| Prove | 12 | SQA engineer | `sqa-testing` | QA | `ci`, `load` |
| Prove | 13 | AI red team | `ai-red-team` | REVIEWER-SEC | `redteam` |
| Ship | 14 | Platform & deploy (Vercel) | `vercel-deploy` | QA / LEAD | `fresh-clone`, `deploy` |
| Ship | 15 | LLMOps / SRE | `llmops-observability` | CORE | `traces` |
| Ship | 16 | Demo & docs | `demo-docs` | QA | `dryrun` |

Seats map to models in one file, `.agents/skills/swarm-lead/references/model-routing.md`: LEAD and
REVIEWER-CODE on Claude Opus 5.5 · CORE on Claude Sonnet 5.5 · DESIGN and UI on Gemini 4 Neon (UI-2 on Gemini 4
Hydrogen) · DATA and QA on Kimi K3.1 Pro · REVIEWER-SEC and OUTSIDER on Muse Wonder. Out of quota → Gemini 4 Neon.
Code is built as vertical slices (one feature = one backend + one frontend worker); gate `slices` enforces it.

| Skill | Used by | What it does |
|---|---|---|
| `swarm-lead` | LEAD | Runs the five hats, routes the 16 roles to models, merges, review rounds, ships |
| `credentials-gate` | LEAD | Finds every key/service, prefers mocks, asks you once, never reads or prints secrets |
| `production-standards` | every builder + reviewer | The production bar + definition of done |
| `code-review` | REVIEWER-CODE | Runs ci + gates, reviews the diff, scorecard, verdict |
| `security-review` | REVIEWER-SEC | OWASP Top 10:2025, API Top 10, LLM Top 10 2026 review |
| `production-hardening` | the code's owner | Fix pass: failing test first, smallest fix, re-check |

Supporting skills also in `.agents/skills`: `frontend-design`, `vercel-react-best-practices`,
`web-design-guidelines`, `webapp-testing`, `claude-api`, `qdrant-clients-sdk`, `mcp-builder`,
`supabase-postgres-best-practices`, `api-design-principles`, `property-based-testing`, `find-bugs`,
`differential-review`, `semgrep`, `supply-chain-risk-auditor`, `systematic-debugging`,
`verification-before-completion`, `receiving-code-review`, `deploy-to-vercel` and others.

## Commands you'll use
```
node .orca-team/tools/doctor.mjs            # is everything installed?
node .orca-team/tools/envtool.mjs where     # which .env file do I edit?
node .orca-team/tools/envtool.mjs check --main   # which keys are still missing? (names only)
node .orca-team/tools/gates.mjs list        # every role's done check
node .orca-team/tools/sync-skills.mjs       # after editing a skill in .agents/skills
```
In the LEAD's Claude pane: `/kickoff` to start · `/swarm-status` for a summary · type `creds done` after
filling `.env`.

## Manual mode (if `orca orchestration` misbehaves)
Create one Orca worktree per role with the right agent and paste one line:
```
ROLE: CORE. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md. Load your skills (AGENTS.md §2).
ROLE: UI. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md. Load your skills (AGENTS.md §2).
ROLE: DATA. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md. Load your skills (AGENTS.md §2).
ROLE: QA. LEAD_BRANCH: lead. Take your tasks from .orca-team/PLAN.md. Load your skills (AGENTS.md §2).
ROLE: REVIEWER-CODE. Review git diff main...lead. Report to .orca-team/reviews/r1-code.md
ROLE: REVIEWER-SEC. Review git diff main...lead. Report to .orca-team/reviews/r1-security.md
```
Then tell the LEAD which branches are finished so it merges them.
