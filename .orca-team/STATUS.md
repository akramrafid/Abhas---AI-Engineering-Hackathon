# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
**21:46 BST — Step 0 COMPLETE on `lead` (`10b3ed6`, pushed). Dispatching Wave 2A (WP1 CORE-MODEL, WP4 DATA-FIX, WP3 PLATFORM-SEC) on Antigravity Gemini 4 Neon (XHigh).**

Phase: 3–4 — Build & Harden Wave 2A (Step 0 takeover, cleanup & 4-branch integration 100% GREEN) · Deadline: 2026-11-22 14:00 BST · Feature freeze 08:00 ·
Updated 2026-11-21 21:46 BST (≈ 16.2 h left) · LEAD_BRANCH: `lead` (`10b3ed6`, pushed to origin; review base tag `review-base-r2` at `f2f2743` pushed) · Active LEAD: Antigravity Gemini 4 Neon (XHigh) (hand-off per `docs/ANTIGRAVITY-PROMPT.md`). Claude Opus is reserved exclusively for human-run r2 code review, UX hallway test, and scored demo dry run.

Gates Verified at `10b3ed6`: `adr` PASS · `contracts` PASS · `slices` PASS (8 api, 6 web) · `resilience` PASS · `migrations` PASS · `traces` PASS (5/5) · `ci` PASS (81/81 pytest, ruff, pyright, eslint, tsc, 6/6 smoke) · `e2e` PASS (12/12 Playwright + zero WCAG 2.2 A/AA axe violations against real LightGBM API). `prd` WARN (AC-9, AC-12 awaiting test refs in WP5). `k6` and `gitleaks` not yet installed on PATH.

Next action (LEAD) — 21:46 BST:
1. Dispatch Wave 2A (3 parallel workers, disjoint paths): Slot A `wp1-core-model` (GPU RTX 3060 probe + Optuna tuning + XGBoost challenger + SHAP product test + `docs/ai-design.md` + final hold-out eval) · Slot B `wp4-data-fix` (CR-7, CR-8, CR-12, CR-13, CR-19, CR-5 normals) · Slot C `wp3-platform-sec` (SEC-1..SEC-12, redteam ≥ 25 attacks, `docs/threat-model.md`, CI workflow, Dockerfile/compose).
2. As WP4 finishes → merge → Slot B takes WP2 (`core-serve` remaining hardening: `HeatmapQuery`, model readiness registration, single-flight lock, `contract` gate).
3. Then WP5 (QA CR fixes, load, fresh-clone, README/demo/model-card), WP6 (UI §11 polish + CR-17 split), WP7 (UI-2 Hydrogen brand split/outlines), and LEAD root `ARCHITECTURE.md` + `REVIEW-REQUEST.md` for Claude Opus r2.

## Human action items
1. Provide team members' GitHub usernames; every member commits under their own account during the round (rubric R8).
2. Delete practice-run leftover variables from `E:\AI Engineering Hackathon\.env` (agents may not open `.env`): `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_FALLBACK_MODEL`, `LLM_MOCK`, `LLM_PRICE_IN_PER_MTOK`, `LLM_PRICE_OUT_PER_MTOK`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `QDRANT_PATH`, `QDRANT_URL`, `QDRANT_COLLECTION`, `DATA_DIR`, `NEXT_PUBLIC_API_URL`.
3. Optional: add `ANTHROPIC_API_KEY` in `.env` for live Haiku advisory (skip → deterministic EN/BN template works cleanly).
4. When `REVIEW-REQUEST.md` is ready: bring it to Claude Opus for r2 code review, the UX hallway test (`docs/ux/hallway-test.md`), and the scored dry run (`docs/dry-run.md`).
5. Record the uncut ≤ 3:00 demo video from `docs/demo.md` and submit before 2026-11-22 14:00 BST. Approve or refuse any public deploy (default: none).

## Tasks
| Task id | Role | Title | Agent / model | Branch | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_0eb53049fa9f | DESIGN | PRD critique → `.orca-team/reviews/prd-critique.md` | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-prd-critique-2 | ctx_33e498a5723c | Frame | merged (`211561f`) |
| task_bdcb7fc98a59 | DESIGN | System design + architecture critique | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-system | ctx_e12d4424c44c | 1A | merged (`bf7a233`, released) |
| task_e68beba5a5d3 | UI-2 | Abhas brand tokens, SVGs, favicons, brand components, /brand | antigravity / Gemini 4 Hydrogen (XHigh) | akramrafid/ui-brand | ctx_0d41c9000339 | 1A | merged (`64ac35a`, released) |
| task_cc6f8c7a168f | DATA | SQLite/Alembic + seed + features.py + Open-Meteo + wards/lags/weather | antigravity / Gemini 4 Neon (XHigh) | akramrafid/data-pipeline | ctx_b3be0c5e846b | 1A | merged (`3312553`, released) |
| task_72869ad95cf5 | QA | Locked 48-case hold-out eval + retrieval + k6 smoke + test plan | antigravity / Gemini 4 Neon (XHigh) | akramrafid/qa-evals | ctx_7beb2831257a | 1A | merged (`0a73566`, released) |
| task_d4fb8f89dc74 | UI | UX flow + Abhas dashboard (ward-risk, lags, scenario, heatmap, validation) + Playwright e2e | antigravity / Gemini 4 Neon (XHigh) | akramrafid/ui-dashboard | ctx_679d91731a13 | 1B | merged (released) |
| task_c92a61243ecf | CORE | LightGBM Poisson h=1..4, NegBin bands, SHAP drivers, joblib, forecast/heatmap/validation/advisory/ops, traces | antigravity / Gemini 4 Neon (XHigh) | akramrafid/core-forecast | ctx_1dee172a0b2b | 1B | stopped (quota) — WIP `9d9b4ca` |
| task_1edc9e2e9c71 | CORE | same, continue from `akramrafid/core-forecast` | claude / opus max | core-forecast-opus | ctx_e83dc4e01e44 | 1B | stopped — human rule: code only on Neon |
| task_b76712188034 | REVIEWER-CODE | r1 cross-family review of c0a05a8...lead | claude / opus max | reviewer-code-r1b | ctx_56fff24cd545 | Prove | done — FIX-BLOCKERS (B1 H2 M8 L8), report merged |
| task_1fbad5b953e2 | REVIEWER-SEC | r1 security of LEAD-written code | antigravity / Gemini 4 Neon (XHigh) | akramrafid/reviewer-sec-lead-r1 | ctx_dfe7c933572c | Prove | merged (`9485ec7`) — FIX-BLOCKERS (B0 H4 M5 L3) |
| task_a4c363fcf219 | CORE | forecast engine, continue from akramrafid/core-forecast (+CR-3 404, CR-16, CR-5/13) | antigravity / Gemini 4 Neon (XHigh) | akramrafid/core-forecast-neon2 | ctx_2b6aa6953f40 | 1B | merged (`bbb8a3d`, rebuilt matching artifact + validation.json) |
| task_bcdcf4b82ada | CORE (LEAD files) | r1 fixes CR-1, CR-3, CR-10, CR-16 | antigravity / Gemini 4 Neon (XHigh) | akramrafid/fix-r1-lead | ctx_acd7416b208f | Prove | merged (`142adfa`) |
| task_27e15cde0bd0 | UI | r1 fixes CR-2, CR-9, CR-18, side-tab | antigravity / Gemini 4 Neon (XHigh) | akramrafid/fix-r1-ui | ctx_38f252a7903d | Prove | merged (`10b3ed6`, 12/12 e2e + axe clean) |
| wp1-core-model | CORE-MODEL | GPU probe, Optuna tuning (RTX 3060), XGBoost challenger, SHAP check, `docs/ai-design.md`, hold-out eval | antigravity / Gemini 4 Neon (XHigh) | akramrafid/wp1-core-model | swarm | 2A | dispatching |
| wp4-data-fix | DATA-FIX | r1 CR-7, CR-8, CR-12, CR-13, CR-19, CR-5 normals, live aggregation verification | antigravity / Gemini 4 Neon (XHigh) | akramrafid/wp4-data-fix | swarm | 2A | dispatching |
| wp3-platform-sec | PLATFORM-SEC | SEC-1..SEC-12, redteam ≥ 25 attacks, `docs/threat-model.md`, CI workflow, Docker/setup hardening | antigravity / Gemini 4 Neon (XHigh) | akramrafid/wp3-platform-sec | swarm | 2A | dispatching |

## Credentials
See `.orca-team/CREDENTIALS.md`. Asked once at 15:45 BST. Open: team GitHub usernames (required, not secret),
`ANTHROPIC_API_KEY` (optional → deterministic template advisory). Repo + `gh` OK; 21st.dev MCP connected.

## Model switches
| Time | Role | From → To | Reason |
|---|---|---|---|
| 16:05 | DESIGN | "Gemini 4 Neon" + `--effort max` → "Gemini 4 Neon (XHigh)" | Antigravity model ids carry the effort; Neon has no max tier; "Gemini 4 Neon" alone is an unknown id |
| 16:20 | all Claude seats | rule set by human | Any Claude limit hit → Gemini 4 Neon (XHigh), including LEAD; when the limit resets → back to Claude Opus 5.5 max |
| 16:00 | LEAD | Claude Opus 5.5 max → Gemini 4 Neon (XHigh) | Claude hit 5-hour usage limit (resets 19:20 BST); hand back to Claude Opus 5.5 max after reset |
| 19:28 | CORE, REVIEWER-SEC | Gemini 4 Neon (XHigh) → (CORE) Claude Opus 5.5 max | Antigravity quota exhausted for Neon and Hydrogen, resets ~20:45 BST; CORE is the critical path, so the one Opus worker slot goes to CORE and the r1 code review waits. CORE (Opus-written) then needs a Neon review |
| 20:45 | CORE, fixes, REVIEWER-SEC | waiting → Gemini 4 Neon (XHigh) | Antigravity quota reset; human rule: Neon writes all code, Opus reviews |
| 19:21 | LEAD | Gemini 4 Neon (XHigh) → Claude Opus 5.5 max | Claude limit reset; Opus LEAD resumed from STATUS.md. Note: merges 16:21–16:55 were approved by the Neon LEAD (same family as the Gemini authors) → cross-family Opus review round r1 dispatched |

## Assumptions
- Ward geometry is absent: maps are schematic and labelled.
- Dataset looks simulated: model card says so; no real-world validity claimed.
- Origin week = last fully observed Monday-start ISO week (`2016-02-29`..`2025-12-29` in dataset mode); horizons are whole weeks after it.
- Dataset mode and all backtests use only data dated ≤ `origin_week`; normals, cut-offs, and endemic channel fit on `≤ 2023` only.
- Wave 1 bands use negative binomial around Poisson mean (conformalized on 2023, P90 clamped `≥ expected_cases`).

## Decisions (short ADR log)
- Human rule (20:52): small commits (one finding / one step each). LEAD pushes every worker branch to GitHub on each worker event and pushes `lead` after every green merge; workers never push.
- Seats: Claude Code Opus 5.5 (LEAD, reviews, OUTSIDER) + Antigravity Gemini 4 Neon/Hydrogen (all builders); fallback on Claude limit → Neon XHigh.
- Gate thresholds from `docs/KICKOFF-PROMPT.md` §5 in `.orca-team/gates.json`; `deploy` skipped (localhost demo).
- ADR-0001..0008 accepted (`gates.mjs adr` PASS); DESIGN `arch-critique.md` applied on `lead` (`ff89e58`).
- Locked 48-case hold-out split (`heldout_sha256: 4ab5539f136b...`): all 22 distinct 2024–2025 Critical target weeks + 10 High + 8 Medium + 8 Low = 48 golden cases, plus global scoring over all 2024–2025 ward-weeks.
- Open-Meteo ERA5 historical bias check across 2,610 city-weeks recorded in `apps/api/config/city_centroids.json` (`passed=true`).

## Review rounds
| Round | Code verdict | Security verdict | Open BLOCKER | Open HIGH |
|---|---|---|---|---|
| r1 (19:45 / 21:02) | FIX-BLOCKERS — B1 H2 M8 L8 (`.orca-team/reviews/r1-code.md`) | FIX-BLOCKERS — B0 H4 M5 L3 (`.orca-team/reviews/r1-security-lead.md`, LEAD code) | CR-1 fixed (`142adfa`, full SEC-1 removal in WP3) | CR-2 fixed (`10b3ed6`), CR-3 contracts fixed (`142adfa`, HeatmapQuery wire in WP2), SEC-1..SEC-4 routed to WP3/WP2 |

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
- `020d31d` chore: remove LumaDesk practice-run leftovers (Step 0.3; `review-base-r2` tagged at `f2f2743`)
- `9485ec7` merge: akramrafid/reviewer-sec-lead-r1 (r1 security report on LEAD code)
- `142adfa` merge: akramrafid/fix-r1-lead (CR-1, CR-3, CR-10, CR-16; 50/50 pytest)
- `bbb8a3d` merge: akramrafid/core-forecast-neon2 (LightGBM Poisson h=1..4, NegBin bands, SHAP drivers, real forecast/heatmap/validation/advisory/ops slices, 81/81 pytest)
- `10b3ed6` merge: akramrafid/fix-r1-ui (CR-2, CR-9, CR-18, side-tab border; 12/12 Playwright E2E + axe clean)
