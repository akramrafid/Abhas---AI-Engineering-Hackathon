# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
Phase: 3 — Build Wave 1B (Phase 2 Design + Contracts Lock 100% GREEN; `main` fast-forwarded) · Deadline: 2026-11-22 14:00 BST · Feature freeze 08:00 ·
Updated 2026-11-21 16:36 BST (≈ 21.4 h left) · LEAD_BRANCH: `lead` (`0a73566`, pushed to origin) · Run: `run_de147862c969` · Active LEAD: `antigravity / Gemini 4 Neon (XHigh)` (Claude Opus 5.5 limit resets 19:20 BST — hand back at 19:15–19:20 BST).

Phase 2 Gates Verified (`0a73566`): `adr` PASS · `contracts` PASS · `resilience` PASS · `slices` PASS · `migrations` PASS · `retrieval` PASS (`recall@15=0.5704`, `n=36`) · `ci` PASS (27/27 pytest, 6/6 smoke).

Next action (LEAD):
1. Push `lead` + fast-forward `main` (Phase 2 milestone) to GitHub; broadcast `"contracts locked"` to `@all`.
2. Release completed Wave 1A workers (`data-pipeline`, `qa-evals`); dispatch Wave 1B **`core-forecast`** (running in parallel with **`ui-dashboard`** = 2 active Antigravity workers).
3. As `core-forecast` and `ui-dashboard` finish: review, merge via `gates.mjs merge`, wire `lifespan` startup model/DB readiness probe in `app/main.py`, run `gates.mjs all`, push to GitHub, then dispatch Wave 2 (`qa-ship` README/demo/fresh-clone + `reviewer-sec` redteam + cross-family review rounds when Claude resets at 19:20 BST!).

## Tasks
| Task id | Role | Title | Agent / model | Branch | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_0eb53049fa9f | DESIGN | PRD critique → `.orca-team/reviews/prd-critique.md` | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-prd-critique-2 | ctx_33e498a5723c | Frame | merged (`211561f`) |
| task_bdcb7fc98a59 | DESIGN | System design + architecture critique | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-system | ctx_e12d4424c44c | 1A | merged (`bf7a233`, released) |
| task_e68beba5a5d3 | UI-2 | Abhas brand tokens, SVGs, favicons, brand components, /brand | antigravity / Gemini 4 Hydrogen (XHigh) | akramrafid/ui-brand | ctx_0d41c9000339 | 1A | merged (`64ac35a`, released) |
| task_cc6f8c7a168f | DATA | SQLite/Alembic + seed + features.py + Open-Meteo + wards/lags/weather | antigravity / Gemini 4 Neon (XHigh) | akramrafid/data-pipeline | ctx_b3be0c5e846b | 1A | merged (`3312553`, released) |
| task_72869ad95cf5 | QA | Locked 48-case hold-out eval + retrieval + k6 smoke + test plan | antigravity / Gemini 4 Neon (XHigh) | akramrafid/qa-evals | ctx_7beb2831257a | 1A | merged (`0a73566`, released) |
| task_d4fb8f89dc74 | UI | UX flow + Abhas dashboard (ward-risk, lags, scenario, heatmap, validation) + Playwright e2e | antigravity / Gemini 4 Neon (XHigh) | akramrafid/ui-dashboard | ctx_679d91731a13 | 1B | running |
| task_c92a61243ecf | CORE | LightGBM Poisson h=1..4, NegBin bands, SHAP drivers, joblib, forecast/heatmap/validation/advisory/ops, traces | antigravity / Gemini 4 Neon (XHigh) | akramrafid/core-forecast | ctx_1dee172a0b2b | 1B | running |

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
- ADR-0001..0008 accepted (`gates.mjs adr` PASS); DESIGN `arch-critique.md` applied on `lead` (`ff89e58`).
- Locked 48-case hold-out split (`heldout_sha256: 4ab5539f136b...`): all 22 distinct 2024–2025 Critical target weeks + 10 High + 8 Medium + 8 Low = 48 golden cases, plus global scoring over all 2024–2025 ward-weeks.
- Open-Meteo ERA5 historical bias check across 2,610 city-weeks recorded in `apps/api/config/city_centroids.json` (`passed=true`).

## Review rounds
| Round | Code verdict | Security verdict | Open BLOCKER | Open HIGH |
|---|---|---|---|---|

## Merged into LEAD_BRANCH
- `4d27783` docs(prd): frame Abhas and route seats to Opus + Gemini
- `211561f` Merge branch `akramrafid/design-prd-critique-2` into `lead` (15 PRD critique bullets)
- `c0a05a8` docs(prd): apply DESIGN critique and lock the PRD
- `0b1687b` feat(skeleton): walking skeleton, OpenAPI contracts, ADRs 0001-0008, PLAN.md, Wave 1A specs
- `de16e37` chore(lead): log Wave 1A dispatches, add Wave 1B specs and web e2e script
- `e640538` chore(load): raise RATE_LIMIT_PER_MINUTE for k6 load and schemathesis contract runs
- `bf7a233` merge: akramrafid/design-system (`resilience` gate PASS)
- `64ac35a` merge: akramrafid/ui-brand (Abhas tokens, SVGs, shared components, `/brand`)
- `ff89e58` fix(arch): apply DESIGN arch-critique hardening to core, contracts, setup, and web headers
- `3312553` merge: akramrafid/data-pipeline (`migrations` + `slices` PASS, ERA5 bias check)
- `0a73566` merge: akramrafid/qa-evals (`contracts` + `retrieval` PASS, 48-case locked holdout)
