# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
Phase: 2 — Design + contracts lock (skeleton + ADRs + PLAN.md ready; dispatching Wave 1A) · Deadline: 2026-11-22 14:00 BST · Feature freeze 08:00 ·
Updated 2026-11-21 16:05 BST (≈ 21.9 h left) · LEAD_BRANCH: `lead` · Run: `run_de147862c969` · Active LEAD: `antigravity / Gemini 4 Neon (XHigh)` (Claude Opus 5.5 limit resets 19:20 BST — hand back on reset).

Next action (LEAD):
1. Verify `npm run web:types`, `npm run ci`, `gates.mjs adr slices` green on `lead`, commit walking skeleton + ADRs 0001–0008 + `PLAN.md` + `STATUS.md`, push `lead` to `origin`.
2. Dispatch Wave 1A in parallel (≤ 4 Antigravity workers):
   - `design-system` (DESIGN · Neon XHigh): `docs/system-design.md` + `.orca-team/reviews/arch-critique.md` (`resilience` gate)
   - `data-pipeline` (DATA · Neon XHigh): Alembic migrations + `seed.py` + `db_check.py` + `shared/features.py` + `wards`/`lags`/`weather` slices + Open-Meteo adapter (`migrations` + DB half of `contracts`)
   - `qa-evals` (QA · Neon XHigh): 48-case SHA-256 locked hold-out (`forecast.jsonl`) + `retrieval.jsonl` + `evals/run.py` + `evals/retrieval.py` + `tests/load/smoke.js` (eval half of `contracts`)
   - `ui-brand` (UI-2 · Hydrogen XHigh): Abhas tokens CSS + SVGs + favicons + `/brand` page + reusable `RiskTierBadge` (`AC-16`)
3. As soon as `design-system` & `ui-brand` finish → dispatch `ui-dashboard` (UI · Neon XHigh); as soon as `data-pipeline` finishes → dispatch `core-forecast` (CORE · Neon XHigh).
4. Once `data-pipeline` + `qa-evals` + `design-system` merge → run `gates.mjs prd adr contracts resilience slices` → broadcast `"contracts locked"` to `@all`.

## Tasks
| Task id | Role | Title | Agent / model | Branch | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_0eb53049fa9f | DESIGN | PRD critique → `.orca-team/reviews/prd-critique.md` | antigravity / Gemini 4 Neon (XHigh) | akramrafid/design-prd-critique-2 | ctx_33e498a5723c | Frame | merged (`211561f`) |

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
