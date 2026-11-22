# Abhas — build prompt for the Antigravity LEAD (Gemini 4 Neon XHigh)

Written by the Claude Opus LEAD on Fri 21 Nov 2026, 21:05 BST, as the hand-off of the whole build to
Antigravity. Claude Opus is now used **only** by the human, here, for code review, the UX hallway test and the
scored demo dry run. Everything else — integration, code, tests, docs — is yours.

**How the human starts you:** open Antigravity CLI in `E:\AI Engineering Hackathon` (branch `lead`),
`/model` → **Gemini 4 Neon (XHigh)**, then type:
`ROLE: LEAD. Read docs/ANTIGRAVITY-PROMPT.md and follow it exactly. Start at Step 0.`

Precedence: `TASK.md` (problem, rubric, dataset facts, deadline) always wins. Where this file and
`docs/KICKOFF-PROMPT.md` disagree, this file wins (it is newer). `AGENTS.md` governs everything neither covers.

---

## 0. Who you are and how you work

You are the tech lead of an AI engineering team with 30 years of production experience in full-stack,
ML and platform engineering. You turn a 24-hour hackathon prototype into **Stage 1 of a real public-health
system**: small in scope, production grade in quality. You plan, write contracts, dispatch Antigravity workers
through Orca, integrate their branches through the merge gate, keep `lead` green and pushed, and keep
`.orca-team/STATUS.md` current enough that any LEAD can resume from it after a quota stop.

Working habits that are mandatory for you and must be copied into every worker spec:
1. **Never end your turn while a command is running.** Wait for it (blocking call with a long timeout), read the
   result, act on it. Previous Neon workers stopped mid-command four times; that cost hours.
2. **Small commits.** One finding or one logical step per commit, conventional message
   (`feat(forecast): …`, `fix(setup): SEC-1 …`), committed as soon as its test passes. Agent commits carry
   `Co-Authored-By: Gemini 4 Neon <noreply@google.com>` (or Hydrogen).
3. **Evidence over claims.** A task is done only when its tests and its gate pass and the report quotes them.
4. Write every document in normal, plain prose (no shorthand, no emoji headings).

## 1. Read first, in this order
1. `TASK.md` — problem, rubric (R1–R8 + bonus), constraints, measured dataset facts, deadline.
2. `.orca-team/STATUS.md` — live log, tasks, decisions, model switches.
3. `docs/PRD.md` (locked) — golden path, MUST/SHOULD/COULD, AC-1…AC-17, NFRs, demo script.
4. `docs/KICKOFF-PROMPT.md` §3–§10 — architecture, model plan, gates, brand, scope, external calls, docs.
5. `docs/architecture.md`, `docs/adr/0001…0008`, `docs/system-design.md`, `docs/data-pipeline.md`,
   `docs/data-model.md`, `docs/ux/flow.md`, `docs/ux/wireframes.md`, `docs/test-plan.md`.
6. `.orca-team/reviews/r1-code.md` (CR-1…CR-19) and `.orca-team/reviews/r1-security-lead.md`
   (SEC-1…SEC-12; on branch `akramrafid/reviewer-sec-lead-r1` until you merge it in Step 0).
7. `docs/brand/BRAND.md` and `docs/brand/tokens.json` — the only source of truth for the look.
8. `.orca-team/gates.json` and `node .orca-team/tools/gates.mjs list` — every check and its threshold.
9. Skills in `.agents/skills/` (list in §6). Load the ones each task names; read `SKILL.md` if loading fails.

## 2. Ground rules (non-negotiable)
- **Credentials:** never read, print, log or commit `.env`. Check names only with
  `node .orca-team/tools/envtool.mjs check --main`. The app must run with **zero keys**.
- **Data:** `data/raw/` is read-only (dataset SHA-256 `3b553e20…e405`). Never commit `data/abhas.db`.
- **Hold-out:** 2024–2025 is locked by SHA-256. Never tune, select features or pick thresholds on it. It is
  scored once, at the end of WP1, and the run is recorded.
- **Git:** never force-push, never rewrite history, never push `main` except a fast-forward after a green phase
  (standing approval for `https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon`). Push `lead` after
  every green merge and push every worker branch whenever you receive that worker's report.
- **Honesty:** never write a reviewer, tester or author line naming a model that did not do the work. Lines
  such as "reviewer: claude/opus" are written only by Opus.
- **Runtime dependencies stay light:** no torch, tensorflow or other GB-scale packages in
  `apps/api/requirements.txt`. Training-only packages go in the `train` dependency group (§7).
- **Agents:** from now on dispatch only `--agent antigravity`. Never dispatch `--agent claude`; the human's
  Claude budget is reserved for review here.
- Irreversible actions (public deploy, deleting data outside Step 0's cleanup list, submitting) need the
  human's explicit yes.

## 3. Where the project stands (21:05 BST)

**Merged on `lead` (pushed):** PRD (locked) · walking skeleton with contracts (`contracts/openapi.json`,
`app/core`, `app/ports`, one slice per capability) · ADR-0001…0008 and `docs/architecture.md` · DESIGN's
`docs/system-design.md` · DATA: SQLite/Alembic schema (WAL), repositories, bulk seed, `app/shared/features.py`
(the single lag/feature builder), Open-Meteo adapter with cache, breaker and a passed ERA5 bias check
(`apps/api/config/city_centroids.json`), real `wards`, `lags`, `weather` slices · QA: 48-case locked hold-out,
36-query retrieval set, eval runner with a CORE model hook, k6 script, test plan · UI-2: tokens CSS, brand SVGs,
favicon, `/brand` page · UI: dashboard slices (ward-risk, lags, scenario, heatmap, validation) with Playwright
and axe · r1 code review report. Gates green at r1: `ci`, `migrations`, `contracts`, `slices`, `adr`,
`resilience`, `retrieval` (recall@15 0.5704 on the climatology fallback), `e2e`. Setup measured at 97 s with uv.

**On branches, pushed, NOT yet merged or Opus-reviewed:**

| Branch | Content | State |
|---|---|---|
| `akramrafid/reviewer-sec-lead-r1` | `.orca-team/reviews/r1-security-lead.md` — FIX-BLOCKERS: 0 BLOCKER, 4 HIGH (SEC-1 Windows `shell:true` argument injection in `scripts/setup.mjs`; SEC-2 `/api/v1/ops` fails open on remote hosts and in production; SEC-3 unbounded chunked-body buffering in the body-size middleware; SEC-4 no secret redaction in logs and unsanitized `request_id`), 5 MEDIUM, 3 LOW. pip-audit, npm audit, bandit, secret scans clean | report only — merge first |
| `akramrafid/fix-r1-lead` | CR-1 (setup bypasses the shell for absolute exe paths), CR-3 (dataset-mode origin range: `FIRST_FORECAST_ORIGIN`, `in_dataset_range`, `DatasetOriginWeek` in `app.core.types`; `HeatmapQuery` in `features/heatmap/schemas.py`), CR-10 (`prod` → `production`), CR-16 (`/readyz` requires migrated + seeded DB; `app.core.readiness.register_readiness_check`, `app.state.checks`) | done, `npm run ci` green, 50 tests |
| `akramrafid/core-forecast-neon2` | `ml/train.py`, `ml/backtest.py`, `ml/verify_artifact.py`, `ml/artifacts/current.joblib` + `metadata.json` (normals, `train_end_year`), adapters `lgbm_model`, `llm`, `fake_llm`, `runtime`, feature routers, eval result files | unfinished, last commit is a WIP snapshot taken at stop — verify everything; floors not yet shown to pass |
| `akramrafid/fix-r1-ui` | CR-2 (demo scenario baseline `DSCC_Ward_04`, origin `2024-05-27`, dry pre-monsoon week), CR-9 (sample-data banner on stub data), CR-18 (axe fails on any WCAG A/AA violation), side-tab border removed | last commit is a WIP snapshot — run e2e; revert only that commit if it is broken |
| `akramrafid/core-forecast`, `akramrafid/core-forecast-opus` | superseded (the first is contained in `-neon2`; the second is a merge-only branch) | do not use |

**Still open from r1 code review:** DATA CR-7, CR-8, CR-12, CR-13, CR-19 (+ normals half of CR-5) ·
QA CR-4, CR-5, CR-6, CR-11, CR-14, CR-15 · UI CR-17 (file size) · CORE: unknown-ward 404 on `/forecast` and
`/scenario`, wire `HeatmapQuery` into `heatmap/router.py`, register the model readiness check.
**Still stubs:** forecast, scenario, heatmap, validation, advisory, ops bodies (until WP1/WP2 land).
**Human items outstanding:** team members' GitHub usernames (rubric R8).

## 4. Step 0 — take over, clean up, integrate (LEAD, about 40 minutes)

0.1 **Take over the Orca run.** `orca orchestration run-use --id run_de147862c969`, then
`orca orchestration worker-list --run run_de147862c969 --json`. Every earlier dispatch is stopped or
succeeded; do not restart any of them. Read the inbox once with `orca orchestration check --run run_de147862c969`.

0.2 **Mark the review base.** Before merging anything: `git tag review-base-r2 lead && git push origin review-base-r2`.
Opus reviews `review-base-r2...lead` at the end.

0.3 **Remove LumaDesk (practice-run) leftovers.** LumaDesk was an earlier practice project (support-ticket RAG:
knowledge base, tickets, Qdrant). Its app code was removed in commit `83b3105`; remove what is left:
- Find tracked leftovers: `git grep -il -E "lumadesk|luma desk|kb_questions|sample_tickets|ticket triage|qdrant" -- . ':!.agents/skills' ':!.claude/skills'`
  and `git ls-files | grep -iE "luma|/kb/|tickets|kb_questions|ask_prompt"`. Delete every LumaDesk file you find
  (expected candidates: `data/kb/`, `data/tickets/`, `data/eval/kb_questions.jsonl`, any `ask_prompt*`, practice
  reviews or hand-offs under `.orca-team/` that mention LumaDesk). Keep everything about Abhas, `data/raw/`,
  `docs/brand/`, and the skills folders (skills are not edited during the event).
- Old Orca worktrees: `git worktree list`. Remove (`git worktree remove --force <path>`, then
  `git worktree prune`) only worktrees whose branch belongs to the practice run (for example `core-kb`,
  `core-triage`, `ui-web`, `qa-*` from before 15:00 today). Keep every worktree whose branch appears in §3 or in
  STATUS.md's task table.
- `.env` leftovers: run `node .orca-team/tools/envtool.mjs check --main` (names only). It lists practice-run
  variables that are not in `.env.example` (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_FALLBACK_MODEL`, `LLM_MOCK`,
  `LLM_PRICE_IN_PER_MTOK`, `LLM_PRICE_OUT_PER_MTOK`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `QDRANT_PATH`,
  `QDRANT_URL`, `QDRANT_COLLECTION`, `DATA_DIR`, `NEXT_PUBLIC_API_URL`). You may not open `.env`: ask the human
  to delete those lines and log the request in STATUS.md.
- `apps/web/AGENTS.md` is Next.js 16's generated agent guide: commit it as is.
- One commit: `chore: remove LumaDesk practice-run leftovers`. Push.

0.4 **Integrate the four branches, in this order**, each with `node .orca-team/tools/gates.mjs merge <branch>`
(no-commit merge → `slices` check → `npm run ci` → commit or abort). Write a short non-author review note for
each in `.orca-team/reviews/merge-<branch>.md` (what you checked, what you could not) and say plainly that the
cross-family Opus review is pending (r2).
1. `akramrafid/reviewer-sec-lead-r1` (report only).
2. `akramrafid/fix-r1-lead`.
3. `akramrafid/core-forecast-neon2`. Conflict rules: keep `fix-r1-lead`'s `app/core/readiness.py` and the
   lifespan in `app/main.py`; CORE registers its model check through `register_readiness_check`, it does not
   edit `main.py` again. `contracts/openapi.json` is never hand-merged: resolve the schemas, then
   `npm run contracts`. Lockfiles: take either side, then `cd apps/api && uv lock` / `npm install` and commit.
4. `akramrafid/fix-r1-ui` — run `npm run e2e`; if the final WIP commit breaks it, `git revert` that single commit.
After each merge `npm run ci` must be green; if it is red, fix on `lead` in a small commit or abort the merge.
Push `lead`. Update STATUS.md ("Now", tasks, merged list). Then start §6.

## 5. Model routing, parallelism and quota (Antigravity only)
- Workers: `orca orchestration worker-start --task <id> --worktree new-child --name <seat>-<slug> --agent antigravity --model "Gemini 4 Neon (XHigh)" --setup run --json`.
  Brand polish uses `--model "Gemini 4 Hydrogen (XHigh)"`. **Never pass `--effort`** for Antigravity: the effort
  is part of the model id, and Neon has no max tier.
- **At most 3 workers plus you at once** (4 only if quota is clearly healthy). Six earlier Neon sessions
  exhausted the shared Gemini quota in about two hours.
- Quota error (`RESOURCE_EXHAUSTED`, "Individual quota reached", 429): log it in STATUS.md "Model switches",
  move that task to Hydrogen (XHigh) with "Continue from branch `<b>`: run `git merge <b>` first"; if Hydrogen is
  out too (they may share a pool), commit and push all WIP, record the reset time, and wait. Do not use Claude.
- Start up to three workers from one shell command (spec files + receipt files, see
  `orca skills get orchestration --reference references/parallel-start.md`), then end your turn; Orca wakes
  you on `worker_done`, questions and escalations. Never poll in a loop.
- On every wake: read the batch, answer questions, push the reporting worker's branch, merge finished work
  through the gate, push `lead`, update STATUS.md, dispatch the next ready task.

## 6. Work packages
Each package becomes one Orca task. Write its spec from `.agents/skills/swarm-lead/references/task-spec-template.md`
and copy into it: the seat, owned paths, findings/ACs, gate, the two working habits from §0, and
"SKILLS: production-standards, verification-before-completion, <listed skills>" (fix tasks add
`production-hardening, receiving-code-review`). Owned paths are disjoint, so packages run in parallel.

### WP1 — CORE-MODEL: GPU-trained forecaster, calibration, tiers, drivers (critical path)
Owned: `apps/api/ml/**`, `apps/api/app/adapters/lgbm_model.py`, `apps/api/app/shared/{tiers,drivers}.py`,
`apps/api/tests/ml/**`, `apps/api/evals/results/{baseline,backtest}.json`, `docs/ai-design.md`, the `train`
dependency group in `apps/api/pyproject.toml`.
Skills: `ai-engineering`, `eval-engineering`, `systematic-debugging`, `property-based-testing`.
Do, in order (model details are in KICKOFF §4 and ADR-0003/0004; GPU details in §7 below):
1. Verify the merged WIP: `npm run train` runs end to end from a clean DB, `npm run ci` green.
2. **Baseline before tuning:** `npm run eval:baseline` records climatology, seasonal naive, persistence,
   LightGBM without weather and untuned LightGBM into `evals/results/baseline.json` with the commit hash.
3. Rolling-origin backtest (expanding window, test folds 2019, 2020, 2021, 2022; purge rows whose target week
   falls in or after the fold's first test week). Tuning (Optuna on the GPU) uses only these folds; 2023 is used
   only for tier cut-offs, the endemic channel and conformal calibration.
4. Direct multi-horizon LightGBM, Poisson objective, one global model per h = 1…4, features from
   `app/shared/features.py` only, monotone-increasing constraints on the rain-lag 2–4 features. Negative-binomial
   GLM benchmark (statsmodels) with rain lags 0–8 and ward effects; keep it if it wins on the folds.
5. 80 % band: negative binomial around the mean, dispersion fit on 2023, conformal adjustment on 2023;
   P90 clamped to at least the mean; quantile LightGBM + CQR only if coverage misses [0.75, 0.90].
6. Tiers: cost-based cut-offs on 2023 (a missed Critical costs 5× a false alarm; start 3 / 8 / 14), one-tier
   escalation when P90 exceeds the ward's endemic threshold (training-years mean + 2 SD for that ISO week,
   floor 5). Risk score = P(cases ≥ High cut-off) × 100.
7. Drivers: native SHAP (`pred_contrib=True`), log-space → multiplicative effect, grouped into "Rain 2–4 weeks
   ago", "Recent rain", "Heat", "Humidity", "Water-logging", "Crowding", "Sanitation", "Season"; top 4 with sign
   and size; the grouped effects must multiply back to the prediction within 1 % (test it).
8. `ml/backtest.py` writes `evals/results/backtest.json`: MAE, RMSE, Poisson deviance by model × horizon ×
   period, coverage, confusion matrix, within-one-tier, Critical recall, macro-F1, lag-correlation evidence. The
   validation slice serves this file; nothing is recomputed per request.
9. Artifact: one joblib bundle `ml/artifacts/abhas-<version>.joblib` (four boosters, NB dispersion, conformal
   offsets, cut-offs, endemic thresholds, rain normals, `max_normal_year`, `train_end_year`, feature list) plus
   `metadata.json` (version, SHA-256, library versions, device, GPU name, train seconds, best params, fold
   metrics) and a copied `current.joblib`; `ml/verify_artifact.py` checks the SHA at setup. Size < 20 MB.
10. **Last, once:** `npm run eval` on the locked hold-out. Floors (TASK.md + KICKOFF §5): MAE h=2,3 ≤ 1.10 and
    ≥ 10 % below climatology; MAE h=4 below climatology; weather ablation worse at every h; 80 % coverage
    0.75–0.90; within-one-tier ≥ 0.95; Critical → High/Critical ≥ 0.85; ≥ 0.80 of the 48 golden cases. If a floor
    fails, report it honestly; any re-tune after unlocking is labelled as such in `docs/ai-design.md`.
11. `docs/ai-design.md` sections: Model choice, Pipeline, Prompts, Structured outputs, Baseline (gate `baseline`).
Gates: `baseline`, `eval`, `retrieval` (+ `ci`).

### WP2 — CORE-SERVE: forecast, scenario, heatmap, validation, advisory, ops
Owned: `apps/api/app/features/{forecast,heatmap,validation,advisory,ops}/` (router, service, deps; schemas only
with your sign-off), `apps/api/app/adapters/{runtime,llm,fake_llm}.py`, `apps/api/app/observability/**`,
`apps/api/app/shared/predict.py`, their tests. Start against a fake `ForecastModel`; switch to the real adapter
when WP1's artifact lands.
Skills: `backend-engineering`, `llmops-observability`, `claude-api` (advisory only), `find-bugs`.
- Real services behind the ports; unknown ward on `/forecast` and `/scenario` → 404 problem+json
  `…/unknown-ward` naming `ward_id`; wire `HeatmapQuery`; register the model readiness check (artifact loaded
  once, SHA verified); `/readyz` 503 names the failing check.
- Prediction cache keyed by (ward, origin, horizon, model version, weather hash, scenario-override hash);
  single-flight so a cold origin computes 60 × 4 once; in-process LRU in front of the SQLite cache; ETag and
  `Cache-Control` on GET routes; identical request → identical numbers (AC-3).
- Scenario: overrides apply to the origin week only; the h = 3 response from 120 mm must be strictly above the
  baseline from the pinned dry week (AC-7) — add a test against the real artifact.
- Live mode: origin = last completed Mon–Sun week in Asia/Dhaka; future rain for h = 3, 4 from Open-Meteo
  forecast; fallback chain cache → climatology, labelled in `weather_source`; centroid badge flag.
- Advisory: deterministic EN/BN template by default; LLM only with `ANTHROPIC_API_KEY` (Claude Haiku 5.5,
  `claude-haiku-5-5`), structured JSON, validator rejects any number not in the input, ≤ 400 output tokens,
  cache by (ward, week, horizon, model version, language), $1/day budget persisted in `llm_traces`, every call
  traced. Ward names are data, never instructions.
- Ops: real counters (model loads = 1, prediction requests, cache hits and hit rate, p50/p95 inference,
  weather calls/errors, LLM calls/spend/budget), estimated monthly cost for one city office.
Gates: `contract` (Schemathesis), `traces`, `ci` (smoke).

### WP3 — PLATFORM-SEC: security fixes, red team, CI, packaging
Owned: `apps/api/app/core/**`, `apps/api/app/main.py`, `scripts/**`, root `package.json`,
`.github/workflows/**`, `docker-compose.yml`, `apps/*/Dockerfile`, `docs/threat-model.md`,
`apps/api/evals/redteam*.py`, `apps/api/evals/redteam/**`.
Skills: `security-review`, `ai-red-team`, `production-hardening`, `semgrep`, `sharp-edges`, `supply-chain-risk-auditor`.
- Fix SEC-1…SEC-12 from `r1-security-lead.md`. For SEC-1 remove the shell entirely on Windows: run npm as
  `process.execPath` + `process.env.npm_execpath` (set when the script runs via `npm run`), and spawn `uv`,
  `py`, `python` as executables without a shell (Node refuses `.cmd` files without a shell since CVE-2024-27980,
  so never spawn `npm.cmd` directly).
- Reject NaN and ±Infinity everywhere: Python's JSON parser accepts the `NaN` token, so set
  `allow_inf_nan=False` on every float in the contracts (shared config) and test it.
- Streaming-safe body-size limit, log redaction (keys, tokens, `Authorization`), request-id sanitization
  (length, charset), ops token mandatory when not on localhost or in production, `X-Forwarded-For` ignored unless
  a trusted proxy is configured, CORS from settings only.
- Red-team suite ≥ 25 attacks, ≥ 95 % pass (gate `redteam`): oversized and NaN weather, negative rain, SQL and
  path injection in `ward_id`, huge horizon, CSV formula injection in exports, prompt injection through ward
  names into the advisory, rate-limit abuse, header injection, ops token brute force. `docs/threat-model.md` maps
  LLM01–LLM10 (N/A items say why) and OWASP Top 10 2025. gitleaks clean.
- Setup robustness: macOS needs `libomp` for LightGBM — detect it in `setup.mjs`, print the exact
  `brew install libomp` instruction (and run it if Homebrew is present and the user did not opt out);
  Windows needs the VC++ runtime — catch the import error with a clear message. Port 8000/3000 already in use →
  clear message and `API_PORT`/`WEB_PORT` override. Optional second path: `docker compose up` (Linux images ship
  OpenMP, which sidesteps libomp).
- `.github/workflows/ci.yml` runs lint, typecheck, unit/integration tests and smoke on every push (Ubuntu,
  Python 3.12, Node 22) — visible proof of discipline for R1 and R8.
Gates: `redteam`, `ci`.

### WP4 — DATA-FIX: lag-pipeline hardening (small, start early)
Owned: `apps/api/app/shared/features.py`, `apps/api/app/features/{wards,lags,weather}/` (not schemas),
`apps/api/app/adapters/db/**`, `apps/api/app/adapters/openmeteo*.py`, `apps/api/scripts/**`, their tests,
`docs/data-pipeline.md`. Skills: `data-engineering`, `database-engineering`.
CR-7 (raise on non-consecutive weeks), CR-8 (`test_ac_3_features_ignore_rows_after_origin`), CR-12, CR-13,
CR-19, normals half of CR-5; ISO week 53 folded into 52 for seasonality; accept `avg_temp_C` and `avg_temp_c`
(case-insensitive column mapping) at ingest; live aggregation: daily → Mon–Sun sums/means in Asia/Dhaka, the
current partial week completed from forecast days, units identical to the dataset, versioned bias correction.
Coordinate any signature change through LEAD (WP1 and WP2 import these functions).
Gates: `migrations`, `retrieval` (+ `ci`).

### WP5 — QA: eval integrity, load, fresh clone, docs for judges
Owned: `apps/api/evals/**` (not redteam), `apps/api/tests/integration/**`, `scripts/smoke.mjs`,
`tests/load/**`, `docs/test-plan.md`, `README.md`, `docs/demo.md`, `docs/model-card.md`.
Skills: `eval-engineering`, `sqa-testing`, `demo-docs`, `webapp-testing`.
- CR-4, CR-5, CR-6, CR-11, CR-14, CR-15 (start these immediately; they do not need the final model).
- After WP1 merges: retrieval gate on the real model (`recall@15 ≥ 0.55` and ≥ climatology, n ≥ 30 in-season
  held-out weeks), k6 at 20 VUs (p95 < 300 ms, errors < 1 %), coverage report (≥ 80 % on `app/` and `ml/`).
- Fresh clone ≤ 180 s, zero keys, timed twice: Windows from a path with a space **without uv**, and with uv
  (`node .orca-team/tools/gates.mjs fresh-clone`). Record both times in README.
- README (judges read it first): one-line value, screenshot, "## Run it" (prerequisites: Python 3.12, Node 22;
  macOS `brew install libomp`; two commands; expected time), "## Architecture" (link), "## Testing",
  "## AI and external services" (Claude Code with Opus 5.5, Antigravity with Gemini 4 Neon and Gemini 4 Hydrogen,
  Orca; the MCPs actually used; Open-Meteo with CC BY 4.0 attribution; Anthropic only if enabled; fonts and
  licences; dataset source), model card summary (data looks simulated; not validated on DGHS surveillance;
  not for real decisions without recalibration), known limitations.
- `docs/demo.md`: uncut ≤ 2:50 script with a timing table (KICKOFF §10 beats), the pinned demo URL, the pinned
  Critical ward and week, the pinned scenario baseline (`DSCC_Ward_04`, `2024-05-27`), copy-paste inputs, a
  fallback plan if the API restarts.
Gates: `eval`, `retrieval`, `load`, `fresh-clone`, `ci`.

### WP6 — UI: the dashboard judges remember
Owned: `apps/web/src/**` except `src/features/brand/**`, `apps/web/e2e/**`, `apps/web/package.json`, `docs/ux/**`.
Skills: `frontend-engineering`, `frontend-design`, `impeccable`, `design-taste-frontend`,
`web-design-guidelines`, `vercel-react-best-practices`, `webapp-testing`, `ux-flow-design`.
Regenerate types from the contract (`npm run web:types`) after every contract change. Build §11 completely on
the real API, close CR-17 (split files over 500 lines into components inside each feature), keep every
golden-path step in the e2e suite (AC-6, AC-7, AC-8, AC-11, AC-13, AC-14) against the real API, axe clean.
Gate: `e2e` (+ `ci`).

### WP7 — UI-2 (Hydrogen): brand completion (time-box 90 minutes)
Owned: `apps/web/src/features/brand/**`, `apps/web/public/brand/**`, `apps/web/src/styles/tokens*`.
Skills: `frontend-design`, `web-design-guidelines`, `impeccable`.
Self-hosted fonts (@fontsource Manrope, IBM Plex Mono, Noto Sans Bengali; no runtime Google calls), Tailwind v4
`@theme` generated from `docs/brand/tokens.json`, wordmark converted to outlines (opentype.js), full favicon set,
`/brand` page split under 500 lines per file (CR-17), no hard-coded hex anywhere, Lime rules respected.

### Suggested order (≤ 3 workers + you)
| Slot | First | Then | Then |
|---|---|---|---|
| A | WP1 CORE-MODEL | WP5 QA (post-model part) | fixes from Opus r2 |
| B | WP2 CORE-SERVE | WP7 UI-2 (Hydrogen) | fixes from Opus r2 |
| C | WP4 DATA-FIX (~45 min) | WP3 PLATFORM-SEC | WP5 QA (docs, fresh clone) |
| (4th, only if quota is healthy) | WP6 UI | — | — |
If only three slots are available, start WP6 when WP4 finishes and run WP3 after WP2. You (LEAD) start WP5's
CR fixes inside slot C's queue as soon as WP4 merges.

## 7. GPU training plan (NVIDIA GeForce RTX 3060, 12 GB, driver 576.52)
Training runs on the human's GPU; serving stays CPU (fast, portable, joblib).
- `apps/api/ml/gpu_probe.py`: report `nvidia-smi` name, memory, driver; then try a 1,000-row LightGBM fit with
  `device_type="gpu"` (OpenCL; the PyPI wheel for Windows ships the OpenCL GPU learner — verify, do not assume)
  and an XGBoost fit with `device="cuda"`. Print which engines are usable.
- `npm run train -- --device auto|gpu|cpu`. `auto` uses LightGBM GPU when the probe passes, otherwise CPU, and
  logs the reason. GPU parameters: `max_bin` 63 or 255, `gpu_use_dp=false`; if a parameter combination is not
  supported on GPU (for example with monotone constraints), fall back to CPU for that fit and log it.
- Hyperparameter search with Optuna (TPE sampler, median pruner) on the GPU: objective = mean Poisson deviance
  over the 2019–2022 folds per horizon, a time budget of about 20 minutes in total, seeded. The GPU is what
  makes this search affordable; the final refit uses the best parameters.
- Challenger: XGBoost `count:poisson` on CUDA with the same features and folds. Report it in
  `backtest.json`. LightGBM stays the serving engine (small wheel, ADR-0003) unless XGBoost beats it by ≥ 3 % MAE
  on the folds — then write ADR-0009 before switching and serve with the small `xgboost-cpu` wheel.
- Training-only packages (`optuna`, `xgboost`, plotting) go in `[dependency-groups] train` in
  `apps/api/pyproject.toml`; they never enter `requirements.txt`, so the judges' setup stays small.
- Reproducibility: seeds everywhere; `metadata.json` records device, GPU name, library versions, parameters,
  train seconds; `npm run train -- --device cpu --params ml/artifacts/best_params.json` reproduces the fold MAE
  within ±0.01. Setup never trains. Capture proof that the GPU was used (LightGBM's "Using GPU Device" log line
  or `nvidia-smi` utilisation during the run) in `docs/ai-design.md`, and the measured train time in
  ARCHITECTURE.md's cost section.

## 8. System design requirements (production grade)
Follow ADR-0001…0008 and `docs/system-design.md`; record any deviation as a new ADR first.
| Concern | Requirement |
|---|---|
| Latency SLOs | in-process inference < 50 ms p95 per ward; API p95 < 300 ms at 20 VUs; cold start (model load + DB check) < 5 s; dashboard first data < 1 s after load on a laptop |
| Caching | in-process LRU (features per origin, predictions) → SQLite `predictions_cache` → HTTP ETag/`Cache-Control`; single-flight on cold keys; cache invalidated by model version and weather hash |
| Outside calls | Open-Meteo: one multi-city call per 6 h, 5 s connect / 10 s read, 2 retries with jitter on 429/5xx, circuit breaker, fallback cache → climatology, labelled. Anthropic (optional): 20 s timeout, 1 retry, budget guard |
| Resilience | every dependency in the resilience register has timeout, retries, fallback and a test; `/healthz` liveness, `/readyz` readiness with named checks |
| Errors | RFC 9457 problem+json everywhere with field-named `errors`; no stack traces or secrets in responses |
| Security | input validation at the boundary (§9), rate limit per client, body-size limit, CORS from settings, ops token outside localhost, log redaction, dependency audits, OWASP ASVS L1 and OWASP LLM Top 10 mapping |
| Observability | JSON logs with request id, `/api/v1/ops` counters, `api_calls` and `llm_traces` tables, `check:traces` gate |
| Data integrity | Alembic migrations up/down/up (gate `migrations`), WAL + busy timeout, idempotent seed with dataset SHA check, no writes outside caches at request time |
| Config | typed settings, every value has a safe default, app runs with zero keys, 12-factor |
| Stage 2 path | `DATABASE_URL` → Postgres, scheduled weekly batch scoring, model registry by version, auth, live weather by default — documented in ARCHITECTURE.md, not built now |

## 9. Corner cases (each needs a test or a written decision)
**Data and features:** ISO week 53 (2020) folded into week 52 for seasonality · missing or duplicate ward-weeks
→ error, never silent misalignment · rows after the origin never influence features (CR-8) · normals, endemic
channel, cut-offs and calibration fit on ≤ 2023 only · first valid origin 2016-02-29 (lags 0–8 exist) · origin
2025-12-29 with h = 1…4 targets in 2026 → allowed, labelled "beyond observed data", no actual shown · rubric
spelling `avg_temp_C` vs dataset `avg_temp_c` · 58 % zeros: bands in whole cases, p90 ≥ mean, "0–2 cases" display
· very small means → Low with risk score near 0 · rare Critical class protected by the cost-based cut-off ·
simulated-data disclaimer.
**Weather / live mode:** daily → weekly aggregation in Asia/Dhaka, Monday start · current partial week completed
from forecast days · units identical to the dataset (mm/week, °C, %) · Open-Meteo down, slow, 429 or malformed →
cache → climatology, labelled on screen · all wards share a city grid point (badge) · bias correction versioned ·
live origin must be the current week (422 otherwise, naming `origin_week`).
**API contract:** unknown ward → 404 `…/unknown-ward` · malformed ward id → 404 (pattern intentionally loose) ·
> 60 wards, duplicates, empty list → 422 · horizons empty, duplicate, 0 or 5 → 422 · non-Monday origin → 422 ·
out-of-range origin in dataset mode → 422 · scenario rain outside 0–500, temperature outside 5–45, humidity
outside 0–100, NaN or Infinity → 422 (`allow_inf_nan=False`) · scenario with no override → 422 · body over the
size limit (including chunked) → 413 · burst over the rate limit → 429 with `Retry-After` · same request twice →
identical numbers · cache key includes model version, weather hash and overrides.
**Model and serving:** artifact missing or SHA mismatch → `/readyz` 503 naming it, clear setup message ·
LightGBM import error (macOS `libomp`, Windows VC++ runtime) → actionable message · GPU unavailable at train time
→ CPU fallback, logged · grouped SHAP effects multiply back to the prediction · monotone scenario behaviour.
**LLM advisory:** no key → template · key invalid or budget reached → template with a note · output with numbers
not in the input → rejected, template used · prompt injection in ward names or overrides → treated as data ·
Bangla output validated the same way.
**UI:** API down → error state with Retry, no stale tier shown as current · slow API → skeleton after 300 ms,
in-flight request aborted when inputs change · unknown ward in the URL → "Ward not found" · empty city · long ward
names and Bangla text wrap without overflow · Bengali font loaded before render (no tofu) · keyboard-only use,
visible focus, `prefers-reduced-motion` · tiers distinguishable under protanopia, deuteranopia, tritanopia and
greyscale (label + 1–4 meter, never colour alone) · 1280×720 recording size and 375 px mobile · shareable URL
holds the full state · CSV export protected against formula injection (`=`, `+`, `-`, `@` prefixed with `'`).
**Setup:** Windows path with spaces, no uv (Python via the `py` launcher), Python 3.12 not the default, Node 22,
ports in use, first `next dev` compile time, re-running setup on an existing install (idempotent).

## 10. Third-party services
| Service | Use | Key | Notes |
|---|---|---|---|
| Open-Meteo Forecast API | live mode: `past_days=92&forecast_days=16`, five city centroids in one request | none | free, non-commercial, < 10,000 calls/day; attribution "Weather data by Open-Meteo.com (CC BY 4.0)" in UI and README |
| Open-Meteo Historical (ERA5 archive) API | one-off bias check of dataset weather vs reanalysis (already done; re-run only if centroids change) | none | result versioned in `apps/api/config/city_centroids.json` |
| Anthropic API, Claude Haiku 5.5 | optional advisory phrasing (COULD) | `ANTHROPIC_API_KEY`, optional | app fully works without it; budget $1/day |
| @fontsource (npm) | Manrope, IBM Plex Mono, Noto Sans Bengali, self-hosted | none | SIL OFL licences listed in README |
Not needed, and deliberately not used: maps or geocoding APIs (ward geometry is not in the dataset; the tile map
is schematic and labelled), paid weather APIs, SMS gateways, vector databases, hosted databases, auth providers.
Build-time tools you may use through MCP if configured in Antigravity (otherwise their CLIs): shadcn, 21st.dev
Magic (search and inspiration; generation only if credits exist), Playwright (e2e, screenshots), Chrome DevTools
(performance, console, vision-deficiency emulation), Context7 (current docs for LightGBM, FastAPI, Next.js 16,
Recharts, TanStack Query, Alembic, Optuna, XGBoost), Next.js DevTools. List only the ones actually used in README.

## 11. UI/UX specification (brand: `docs/brand/BRAND.md`, `docs/brand/tokens.json`)
Character: a calm, dense **public-health operations console** — trustworthy, fast to read, no decoration.
Cosmetic UI earns no points; clarity, evidence and interaction do.
- **Layout (1280×720 first):** Ink header band with the Abhas mark and wordmark, product line
  "Rain today. Risk in three weeks. Act now.", EN/BN switch, data-source badge (Dataset / Live / Cache /
  Climatology). Left rail: city, ward search-select (keyboard friendly), origin week picker showing ISO week and
  dates ("W32 2024 · 5–11 Aug") limited to the valid range, window control (Next week / 2–4 weeks / custom 1–4).
  Main area, top: **Ward risk card** — peak tier as the hero (EN + BN label + 1–4 meter), expected cases with the
  80 % band, risk score, "Act by <date>" line. Below: forecast chart per horizon with the band (Royal at 15 %),
  drivers as a horizontal waterfall (top 4 + "other", signed percentages), then tabs: Lags · Scenario · City
  heatmap · Priority list · Validation · About & cost.
- **Lags tab:** correlation-by-lag bars (ward and dataset, peak at 3 highlighted), plus rain shifted by the
  selected lag over cases; one sentence of plain explanation.
- **Scenario tab:** rain slider and presets ("Dry week 0 mm", "Monsoon burst 120 mm", "Extreme 250 mm"),
  optional temperature and humidity; side-by-side baseline vs scenario per horizon; tier change announced with
  `aria-live`.
- **City heatmap tab:** ward × horizon grid in tier colours with labels in every cell, sortable; a schematic
  tile map labelled "schematic, ward geometry not in the dataset".
- **Priority list tab:** wards ranked by window risk with act-by dates and suggested actions (larviciding and
  drain clearing for rain-driven risk, community clean-up for sanitation-driven risk, hospital stock alert for
  Critical) — deterministic rules from the drivers; CSV export (formula-injection safe); printable ward brief
  (print CSS, one page).
- **Validation tab:** MAE/RMSE by horizon and year vs climatology, seasonal naive, persistence and the
  no-weather model; coverage gauge with the 0.75–0.90 target; confusion matrix; the chronological split as a
  timeline. **About & cost:** `/api/v1/ops` numbers, model card summary, attribution.
- **Visual rules:** every colour from tokens (never a hex in components); Lime only on Ink, Navy or Royal, at most
  once per view, never in data views; tiers Low `#BFE3CC`, Medium `#F0B429`, High `#C2410C`, Critical
  `#7F1D1D` always with EN/BN label and 1–4 meter; Manrope for UI, IBM Plex Mono with tabular numbers for figures,
  Noto Sans Bengali for Bangla; ribbon art only on Ink/Navy hero bands, never behind data; never a mosquito, a skull
  or a red cross; no side-tab accent borders; no decorative animation.
- **States:** every panel has empty, loading (skeleton after 300 ms), error (message + Retry) and success; a
  "Sample data — model not loaded" banner whenever `model_version` starts with `stub`.
- **Quality bars:** WCAG 2.2 AA (axe clean, contrast checked, focus order, labels), Lighthouse ≥ 90 for
  performance, accessibility and best practices on `next build && next start`, no layout shift on data load,
  bundle without unused chart libraries, state in the URL (`?ward=&origin=&window=&tab=&lang=`), demo URL
  `/?demo=1` preloads Dhaka South, the pinned Critical ward and week.
- Use shadcn primitives restyled with tokens; use 21st.dev only for inspiration or components that fit these
  rules; check final screens with Playwright screenshots at 1280×720 and 375 px and with Chrome DevTools vision
  emulation.

## 12. What makes Abhas stand out from other teams
1. **Evidence, not claims:** the Lags tab shows the 3-week rain→cases lag from the data itself; the Validation
   tab beats four baselines on a locked hold-out and proves weather earns its place with an ablation.
2. **Honest uncertainty:** calibrated 80 % bands with measured coverage, and a risk score that is a real
   probability.
3. **Decision support, not just a number:** cost-based tiers (a missed outbreak costs 5×), endemic-channel
   escalation (the WHO/PAHO outbreak-threshold method), act-by dates, a ranked priority list and a printable
   ward brief.
4. **Explainable per ward:** SHAP drivers in plain language that multiply back to the forecast.
5. **What-if planning** on a monotone model, so more rain never paradoxically lowers risk.
6. **Bilingual EN/BN** interface for Bangladeshi health officers.
7. **Live-ready:** one cached Open-Meteo call per 6 h, bias-checked against ERA5, with labelled fallbacks.
8. **GPU-trained, CPU-served:** Optuna search on the RTX 3060, a 1–20 MB joblib artifact served in milliseconds,
   with measured cost numbers on screen.
9. **Runs anywhere in under three minutes with zero keys,** tested on a Windows path with spaces and without uv.
10. **Production discipline:** vertical slices, contract tests, red-team suite, CI on GitHub, ADRs, model card.

## 13. Hand-off to Claude Opus (prepare when everything in §15 is true except the gates that need Opus)
Write `.orca-team/reviews/REVIEW-REQUEST.md`, short enough to review with a small token budget:
- range `review-base-r2...lead`, branch heads merged, and a table of areas → files → author model;
- the gate table from `GATES.md` and the exact commands that reproduce it;
- the ten riskiest spots you know about (file:line + why) and open questions;
- what you could not verify.
Also prepare, for the human to run here with Opus (different model family from the Gemini authors, which the
`ux` and `dryrun` gates require): `docs/ux/hallway-test.md` with "Author: antigravity/Gemini 4 Neon (XHigh)" and
an empty "Tester:" line, and the scored-dry-run brief for `docs/dry-run.md` (real rubric, target ≥ 85/100).
Opus writes its reports to `.orca-team/reviews/r2-code.md` (and the tester lines); you route every finding by
owned path as fix tasks with `production-hardening` and re-run the gates.

## 14. Human action items (put these in STATUS.md and repeat them after every merge round)
1. Team members' GitHub usernames; every member commits under their own account during the round (rubric R8).
2. Delete the practice-run lines from `.env` listed in Step 0.3 (agents may not open `.env`).
3. Optional `ANTHROPIC_API_KEY` for the advisory (skip → template).
4. Bring `REVIEW-REQUEST.md` to Claude Opus when it is ready; run the hallway test and the dry run there.
5. Record the uncut ≤ 3:00 video from `docs/demo.md` and submit before the TASK.md deadline. Approve or refuse any public deploy (default: none).

## 15. Definition of done (all must be true before feature freeze)
- [ ] `npm run setup` then `npm run dev` works from a fresh clone in ≤ 180 s on Windows (path with a space, no uv)
      and with uv; zero keys; README states the two commands and the measured times.
- [ ] `node .orca-team/tools/gates.mjs all` green except gates that need Opus (`ux` tester, `dryrun`, `reviews`,
      `promote`) and `deploy` (skipped): `prd`, `adr`, `contracts`, `slices`, `resilience`, `baseline`,
      `migrations`, `retrieval` (≥ 0.55, n ≥ 30), `ci`, `contract`, `e2e`, `eval` (≥ 0.80 of 48 + all floors),
      `load` (p95 < 300 ms at 20 VUs), `redteam` (≥ 25 attacks, ≥ 95 %), `traces`, `fresh-clone`.
- [ ] Lag pipeline grouped per `ward_id` with leakage tests; model loaded once from joblib; tiers exactly
      Low / Medium / High / Critical; driver breakdown on screen.
- [ ] Root `ARCHITECTURE.md` (≤ 2 pages): Mermaid data-flow diagram, chronological split timeline, model choice
      with rejected options, GPU training and CPU serving, cost controls with measured numbers, link to
      `docs/architecture.md`.
- [ ] README disclosure complete; model card honest; `docs/demo.md` ready with pinned inputs.
- [ ] STATUS.md current; `lead` pushed; `main` fast-forwarded after each green phase; no open BLOCKER or HIGH.
