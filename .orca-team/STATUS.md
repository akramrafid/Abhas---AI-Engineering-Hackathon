# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
Phase: 2 — Design + contracts lock (in progress) · Deadline: 2026-11-22 14:00 BST · Feature freeze 08:00 ·
Updated 2026-11-21 16:25 BST (≈ 21.5 h left) · LEAD_BRANCH: `lead` (pushed to origin) · Run: `run_de147862c969`

Next action (LEAD):
1. Finish the API walking skeleton in `apps/api/` (started, uncommitted): done so far — `pyproject.toml`,
   `app/__main__.py`, `app/core/{config,errors,types,logging,ratelimit}.py`. Still to write: `app/ports/`
   (weather, forecast_model, llm, repositories), `app/features/<slice>/{schemas,router}.py` stubs for wards,
   forecast (+scenario), lags, heatmap, validation, weather, advisory, ops; `app/main.py`, `export_openapi.py`,
   `healthcheck.py`, `__init__.py` files, a health test; root `package.json`, `scripts/py.mjs`,
   `scripts/setup.mjs`; `uv lock` + `uv export > requirements.txt`; `npm run contracts` → `contracts/openapi.json`.
2. `apps/web` was scaffolded with create-next-app 16.4.6 (TS, Tailwind v4, App Router, src/); `npm install`
   ran in the background — check `apps/web/node_modules` exists.
3. Write `docs/architecture.md` (C4 context + containers, 2 mermaid blocks) and ADRs 0001–0006 (vertical slices;
   SQLite + Alembic; LightGBM Poisson direct multi-horizon; Open-Meteo single call + cache; deterministic
   advisory + optional Haiku; client data fetching with TanStack Query). Gate: `gates.mjs adr`.
4. Commit the skeleton on `lead`, push, then dispatch wave Frame/Design: DATA `data-pipeline`, UI-2
   `ui-brand`, UI `ui-dashboard` (UX flow + wireframes), DESIGN `system-design` (after architecture views).
   Specs go in `.orca-team/specs/`. Use `--model "Gemini 4 Neon (XHigh)"` / `"Gemini 4 Hydrogen (XHigh)"`
   (no `--effort` for antigravity — the effort is part of the model id).

## Tasks
| Task id | Role | Title | Agent / model | Branch | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_0eb53049fa9f | DESIGN | PRD critique → `.orca-team/reviews/prd-critique.md` | antigravity / Gemini 4 Neon (XHigh) | design-prd-critique-2 | ctx_33e498a5723c | Frame | running |

## Credentials
See `.orca-team/CREDENTIALS.md`. Asked once at 15:45 BST. Open: team GitHub usernames (required, not secret),
`ANTHROPIC_API_KEY` (optional → deterministic template advisory). Repo + `gh` OK; 21st.dev MCP connected.

## Model switches
| Time | Role | From → To | Reason |
|---|---|---|---|
| 16:05 | DESIGN | "Gemini 4 Neon" + `--effort max` → "Gemini 4 Neon (XHigh)" | Antigravity model ids carry the effort; Neon has no max tier; "Gemini 4 Neon" alone is an unknown id |
| 16:20 | all Claude seats | rule set by human | Any Claude limit hit → Gemini 4 Neon (XHigh), including LEAD |

## Assumptions
- Ward geometry is absent: maps are schematic and labelled.
- Dataset looks simulated: model card says so; no real-world validity claimed.
- Origin week = last fully observed Monday-start ISO week; horizons are whole weeks after it.

## Decisions (short ADR log)
- Seats: Claude Code Opus 5.5 (LEAD, reviews, OUTSIDER) + Antigravity Gemini 4 Neon/Hydrogen (all builders).
- Gate thresholds from `docs/KICKOFF-PROMPT.md` §5 in `.orca-team/gates.json`; `deploy` skipped (localhost demo).
- Stack (TASK.md "Our preferences"): FastAPI + LightGBM, Next.js 16 + Tailwind v4 + shadcn, SQLite via
  SQLAlchemy + Alembic; no Docker, no Neon.
- Branches: workers branch from `lead`; `lead` pushed after every green merge; `main` fast-forwarded per green phase.

## Review rounds
| Round | Code verdict | Security verdict | Open BLOCKER | Open HIGH |
|---|---|---|---|---|

## Merged into LEAD_BRANCH
- `4d27783` docs(prd): frame Abhas and route seats to Opus + Gemini
