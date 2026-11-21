# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
Phase: 2/3 — Design + Wave 1A Build (4 workers running in parallel) · Deadline: 2026-11-22 14:00 BST · Feature freeze 08:00 ·
Updated 2026-11-21 16:11 BST (≈ 21.8 h left) · LEAD_BRANCH: `lead` (pushed `0b1687b` to origin) · Run: `run_de147862c969` · Active LEAD: `antigravity / Gemini 4 Neon (XHigh)` (Claude Opus 5.5 limit resets 19:20 BST — hand back on reset).

Next action (LEAD):
1. Wait for Orca wake on Wave 1A workers (`design-system`, `data-pipeline`, `qa-evals`, `ui-brand`).
2. As each settles: non-author review → `.orca-team/reviews/merge-<branch>.md` → `node .orca-team/tools/gates.mjs merge <branch>` → push `lead` to GitHub immediately (small, frequent pushes per human instruction).
3. As soon as `design-system` & `ui-brand` merge → dispatch `ui-dashboard` (`.orca-team/specs/ui-dashboard.md`); as soon as `data-pipeline` merges → dispatch `core-forecast` (`.orca-team/specs/core-forecast.md`).
4. Once `design-system` + `data-pipeline` + `qa-evals` merge → run `gates.mjs prd adr contracts resilience slices` → fast-forward `main` & push → broadcast `"contracts locked"` to `@all`.

## Tasks
| Task id | Role | Title | Agent / model | Branch | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_0eb53049fa9f | DESIGN | PRD critique → `.orca-team/reviews/prd-critique.md` | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-prd-critique-2 | ctx_33e498a5723c | Frame | merged (`211561f`) |
| task_bdcb7fc98a59 | DESIGN | System design + architecture critique | antigravity / Gemini 4 Neon (XHigh) | design-system | ctx_e12d4424c44c | 1A | running |
| task_cc6f8c7a168f | DATA | SQLite/Alembic + seed + features.py + Open-Meteo + wards/lags/weather | antigravity / Gemini 4 Neon (XHigh) | data-pipeline | ctx_b3be0c5e846b | 1A | running |
| task_72869ad95cf5 | QA | Locked 48-case hold-out eval + retrieval + k6 smoke + test plan | antigravity / Gemini 4 Neon (XHigh) | qa-evals | ctx_7beb2831257a | 1A | running |
| task_e68beba5a5d3 | UI-2 | Abhas brand tokens, SVGs, favicons, brand components, /brand | antigravity / Gemini 4 Hydrogen (XHigh) | ui-brand | ctx_0d41c9000339 | 1A | running |

## Credentials
See `.orca-team/CREDENTIALS.md`. Asked once at 15:45 BST. Open: team GitHub usernames (required, not secret),
`ANTHROPIC_API_KEY` (optional → deterministic template advisory). Repo + `gh` OK; 21st.dev MCP connected.

## Model switches
| Time | Role | From → To | Reason |
|---|---|---|---|
| 16:05 | DESIGN | "Gemini 4 Neon" + `--effort max` → "Gemini 4 Neon (XHigh)" | Antigravity model ids carry the effort; Neon has no max tier; "Gemini 4 Neon" alone is an unknown id |
| 16:20 | all Claude seats | rule set by human | Any Claude limit hit → Gemini 4 Neon (XHigh), including LEAD; when the limit resets → back to Claude Opus 5.5 max |
| 16:00 | LEAD | Claude Opus 5.5 max → Gemini 4 Neon (XHigh) | Claude hit 5-hour usage limit (resets 19:20 BST); hand back to Claude Opus 5.5 max after reset |

## Assumptions
- Ward geometry is absent: maps are schematic and labelled.
- Dataset looks simulated: model card says so; no real-world validity claimed.
- Origin week = last fully observed Monday-start ISO week (`2016-02-29`..`2025-12-29` in dataset mode); horizons are whole weeks after it.
- Dataset mode and all backtests use only data dated ≤ `origin_week`; normals, cut-offs, and endemic channel fit on `≤ 2023` only.
- Wave 1 bands use negative binomial around Poisson mean (conformalized on 2023, P90 clamped `≥ expected_cases`).

## Decisions (short ADR log)
- Seats: Claude Code Opus 5.5 (LEAD, reviews, OUTSIDER) + Antigravity Gemini 4 Neon/Hydrogen (all builders); fallback on Claude limit → Neon XHigh.
- Gate thresholds from `docs/KICKOFF-PROMPT.md` §5 in `.orca-team/gates.json`; `deploy` skipped (localhost demo).
- ADR-0001: Modular monolith with 8 vertical API slices (`wards`, `lags`, `forecast`, `heatmap`, `validation`, `weather`, `advisory`, `ops`) + ports & adapters.
- ADR-0002: SQLite (WAL mode) via SQLAlchemy + Alembic (Postgres-ready for Stage 2); localhost two-command run (`npm run setup` + `npm run dev`), no Docker/Neon required.
- ADR-0003: LightGBM Poisson direct multi-horizon (h=1..4) global model across 60 wards + native `pred_contrib=True` SHAP drivers; single joblib bundle.
- ADR-0004: Expanding-window chronological CV (2019–2022), 2023 tune/calibration, SHA-256 locked 2024–2025 hold-out; NegBin conformal 80% bands + cost-sensitive tiers + epidemic-channel escalation.
- ADR-0005: `WEATHER_MODE=dataset` default; `live` uses 1 multi-city Open-Meteo call / 6 h with cache → climatology fallback + mandatory historical bias check.
- ADR-0006: Deterministic EN/BN advisory template default; optional Claude Haiku 5.5 (`≤ 400` tokens, `$1/day` cap, number validator).
- ADR-0007: Next.js 16 + Tailwind v4 + Recharts + TanStack Query + `openapi-typescript` + self-hosted `@fontsource` fonts (no Google Fonts).
- ADR-0008: Request/response JSON + RFC 9457 `problem+json`, no user auth, optional `X-Ops-Token` on `/api/v1/ops` (open read-only on localhost when unset).

## Review rounds
| Round | Code verdict | Security verdict | Open BLOCKER | Open HIGH |
|---|---|---|---|---|

## Merged into LEAD_BRANCH
- `4d27783` docs(prd): frame Abhas and route seats to Opus + Gemini
- `211561f` Merge branch `akramrafid/design-prd-critique-2` into `lead` (15 PRD critique bullets)
- `c0a05a8` docs(prd): apply DESIGN critique and lock the PRD
- `0b1687b` feat(skeleton): walking skeleton, OpenAPI contracts, ADRs 0001-0008, PLAN.md, Wave 1A specs
