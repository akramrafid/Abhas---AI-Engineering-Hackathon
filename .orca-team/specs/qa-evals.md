ROLE: QA · roles 11 & 12 Eval + SQA engineer · hat design/prove
LEAD_BRANCH: lead
TASK: qa-evals — Locked 48-case hold-out eval suite, retrieval eval, k6 load script, test plan          WAVE: 1A      FEATURE: evals
MODEL: antigravity · Gemini 4 Neon (XHigh)
SKILLS: production-standards, verification-before-completion, eval-engineering, sqa-testing
GOAL: Build and SHA-256-lock the 2024–2025 hold-out evaluation datasets (`>= 48` stratified golden cases + `>= 30` held-out in-season ranking queries) so `gates.mjs contracts` turns green, implement `apps/api/evals/run.py` and `apps/api/evals/retrieval.py` (with real baseline scoring now and clean hook for CORE's LightGBM artifact), add `tests/load/smoke.js` (k6 at 20 VUs) and `docs/test-plan.md`.
OWNED PATHS (only these may be edited):
  - apps/api/evals/** (EXCEPT redteam*)
  - tests/load/**
  - apps/api/tests/integration/**
  - docs/test-plan.md
READ-ONLY CONTEXT: TASK.md, docs/PRD.md (AC-3..AC-5, NFR-1..NFR-5), docs/adr/0003-lightgbm-poisson-direct.md, docs/adr/0004-validation-uncertainty-tiers.md, docs/KICKOFF-PROMPT.md (§4, §5), .orca-team/gates.json, .orca-team/PLAN.md, .orca-team/tools/gates.mjs (lines 190-335), package.json
CONTRACT:
  - Read `data/raw/hackathon_preli_dataset.xlsx` (sheet `bangladesh_dengue_large_dataset`, read-only!) directly using pandas/openpyxl to build:
    1. `apps/api/evals/datasets/forecast.jsonl`:
       * Include BOTH `split: "dev"` cases (from 2019–2023, e.g., 32 stratified cases) AND `split: "heldout"` cases (EXACTLY 48+ stratified golden cases from 2024–2025, stratified across actual tiers Low/Medium/High/Critical using fixed cut-offs `3 / 8 / 14` with EVERY 2024–2025 Critical ward-week included!).
       * Every JSON line has fields: `id`, `split` (`"dev"` or `"heldout"`), `ward_id`, `city`, `origin_week` (Monday ISO date), `horizon` (`2`, `3`, or `4`), `target_week`, `actual_cases`, `actual_tier` (`Low|Medium|High|Critical` from fixed cut-offs `<3, <8, <14, >=14`), `ac_refs` (e.g., `["AC-5"]`).
    2. `apps/api/evals/datasets/retrieval.jsonl`:
       * At least 30 held-out in-season (June–September 2024 & 2025) Monday `origin_week` queries (`n_queries >= 30`), each listing `origin_week`, `split: "heldout"`, and `top_15_wards` (top 15 wards by summed actual `dengue_cases` across `t+2..t+4`).
    3. `apps/api/evals/config.json`: stores `heldout_sha256` (computed by `python -m evals.run --lock` over the canonical held-out lines of `forecast.jsonl`) and fixed tier cut-offs. Run `npm run eval:lock` before committing so `heldout_sha256` is locked BEFORE any model tuning!
  - `apps/api/evals/run.py` (CLI: `python -m evals.run [--lock] [--split dev|heldout|all] [--tag baseline]`):
    * `--lock`: computes SHA-256 of held-out cases in `forecast.jsonl` and writes `apps/api/evals/config.json`.
    * Verifies `heldout_sha256` on every `--split heldout` run; if tampered, prints error and exits with code **3** (required by `gates.mjs eval`!).
    * Computes baselines (ward×ISO-week climatology fit strictly on `<= 2023`, seasonal naive, persistence) and if CORE's trained model artifact (`settings.model_path`) exists, loads and scores it (otherwise evaluates climatology / placeholder cleanly when invoked with `--tag baseline` or prints clear message).
    * Evaluates BOTH global hold-out metrics (MAE h=1..4, RMSE, Poisson deviance, climatology comparison, no-weather ablation hook, 80% coverage, within-one-tier, Critical->High|Critical recall, macro-F1, p95 per-ward inference ms) AND the 48 golden cases (pass = tier within one band AND actual cases inside `[p10, p90]`).
    * Writes BOTH `apps/api/evals/results/latest-<split>.json` (exact schema checked by `gates.mjs eval`: `pass_rate`, `n`, `skipped`, `generator_model`, `judge_model` (`"-"`), `cost_usd` (`0.0`), `ts`, `split`, `metrics`) AND `apps/api/evals/results/eval.json` (AC-5), and appends a summary line to `apps/api/evals/history.jsonl`.
    * When `--tag baseline` is passed, writes `apps/api/evals/results/baseline.json` with `commit` (current git SHA), `prompt_versions`, `metrics`, `pass_rate`.
  - `apps/api/evals/retrieval.py` (CLI: `python -m evals.retrieval`):
    * Scores top-15 ward ranking recall@15 and MRR across all `>= 30` queries in `retrieval.jsonl` (using CORE's trained model if present, else climatology baseline so the runner is proven immediately) and writes `apps/api/evals/results/retrieval.json` with `{k: 15, recall_at_k, mrr, n_queries, climatology_recall_at_k, model_version}`.
  - `tests/load/smoke.js`: k6 script hitting `/healthz`, `/api/v1/wards`, `/api/v1/wards/{id}/lags`, `POST /api/v1/forecast`, `POST /api/v1/scenario` at 20 VUs for 30 s, asserting `http_req_duration p(95) < 300` ms and `http_req_failed rate < 0.01` (NFR-2).
  - `apps/api/tests/integration/test_evals_lock.py`: unit/integration tests referencing `AC-5` verifying `forecast.jsonl` has >= 48 heldout + >= 30 dev cases with valid `split` fields, `retrieval.jsonl` has >= 30 queries, `--lock` SHA-256 matches, and tampering causes exit code 3.
  - `docs/test-plan.md`: concise SQA test plan mapping AC-1..AC-17 and NFR-1..NFR-8 to commands and gates.
ACCEPTANCE CRITERIA:
  AC-5 lock & harness ready; NFR-2 k6 script ready; NFR-4 retrieval dataset & harness ready.
GATE TO PASS: npm run eval:lock && npm run ci   (and verify `forecast.jsonl` satisfies the eval portion of `gates.mjs contracts`)
ENV VARS NEEDED: none
DEV PORT: 8003
OUT OF SCOPE: Do not train LightGBM (CORE owns `ml/`), do not touch `apps/api/app/**`, `migrations/`, `docs/PRD.md`, or `apps/web/**`.
DONE WHEN: Datasets generated and locked (`eval:lock`), `evals/run.py` + `evals/retrieval.py` + `tests/load/smoke.js` + `docs/test-plan.md` + integration tests passing, `npm run ci` green, committed on your branch, and `worker_done` is sent.
