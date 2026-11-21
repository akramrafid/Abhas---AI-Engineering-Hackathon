# Code review r1 — 2026-11-21 19:45 BST — reviewer: claude/opus-5.5 (max)
Range: `git diff c0a05a8...lead` (lead @ 795e3ea; lockfiles, `schema.d.ts`, `contracts/openapi.json`, skill copies ignored)
Authors reviewed: DATA antigravity/Gemini 4 Neon (XHigh) · QA Neon · UI-2 Gemini 4 Hydrogen (XHigh) · UI Neon · DESIGN Neon · LEAD Neon (ff89e58, `app/core/*`)
Verdict: **FIX-BLOCKERS**
Summary: The merged foundation is solid: the lag builder is correct on the dataset, every error path is RFC 9457
problem+json, CI and all five gates are green, and setup takes 97 s with uv. The biggest risk is outside the model:
the Windows setup path without uv fails for any clone path that contains a space (BLOCKER, R1 = 10 pts), and the
pinned demo week makes the AC-7 scenario demo show risk going *down* once the real model lands (HIGH, golden step 5).
Eval and contract gaps (re-writable hold-out lock, in-sample dev split, no origin-range check) are cheap to fix now,
before CORE tunes anything.

Verified (all commands run in this worktree):
- `npm run ci` ✅ exit 0 in 62 s: ruff "All checks passed!", pyright 0 errors, pytest **27 passed**, smoke 6/6 PASS.
- `gates.mjs migrations contracts slices retrieval e2e` ✅ all PASS (e2e: 9 Playwright tests incl. axe; retrieval
  recall@15 0.5704 = climatology, scored with the climatology fallback because no model artifact exists yet).
- `npm run setup` (uv present) ✅ **97 s** total: npm ci 70.5 s, uv sync 4.5 s, migrations 7.2 s, seed 7.1 s, zero keys.
  No-uv branch ❌: reproduced its spawn call; it fails on a path with spaces (CR-1). `requirements.txt` equals
  `uv export --frozen` of `uv.lock` ✅.
- Golden path by hand (API on :8010, curl/fetch): step 4 ✅ (`/wards/DSCC_Ward_07/lags` peak_lag_ward 3,
  peak_lag_dataset 3; cold 378 ms, warm 12 ms); unknown ward on lags/history → 404 `…/unknown-ward` ✅;
  bad Monday, horizons 0/5, rain 501 → 422 naming `body.origin_week`, `body.horizons.0`, `body.weather.rainfall_mm` ✅.
  Steps 2, 3, 5, 6, 7 answer from LEAD stubs (`model_version: "stub-0"`), so they can't be verified yet.
- Evals: held-out not scored (no artifact). Committed baseline = `climatology-le2023`, floors_passed false (as expected).

Scorecard
| Dimension | Score | Evidence |
|---|---|---|
| Correctness | 3 | AC-1, AC-2 proven by named tests and the probe; AC-3/4/5 wait on core-forecast; AC-7 demo baseline wrong (CR-2) |
| Contract & API | 4 | contracts gate + drift test pass; problem+json everywhere; origin range missing (CR-3) |
| Reliability | 4 | client 15 s timeout (`client.ts:40`), Open-Meteo 5/10 s timeouts + retries + breaker, SQLite WAL + busy_timeout; readyz is static (CR-16) |
| Security | — | REVIEWER-SEC's round; nothing above LOW seen here |
| AI quality | — | model not merged; eval harness gaps CR-4/5/6 must close before tuning |
| Performance | 4 | lags 12 ms warm, 378 ms cold; k6 not run this round |
| Maintainability | 3 | slices gate passes; 5 UI files 519–960 lines (CR-17) |
| Tests | 3 | 27 API + 9 e2e with behaviour assertions; no future-leak test (CR-8); smoke too lax (CR-11) |
| Operability | 4 | one-command setup in 97 s, healthz/readyz, request ids in problems |
| UX & a11y | 4 | four states on every panel, EN/BN + 1–4 meter, tokens only, axe serious/critical clean |

Counts: BLOCKER 1 · HIGH 2 · MEDIUM 8 · LOW 8

## Answers to the five focus questions
1. **Lag pipeline** (`app/shared/features.py`): correct on the provided data. The cutoff is applied before any shift
   (`:251-253`), lags use `groupby("ward_id").shift(k)` on `(ward_id, week)`-sorted rows (`:255, :281, :315-316`),
   duplicates are rejected, and normals fit on `year <= 2023` with ISO-53 folded (`:177-194`). The weak spots are
   positional shifts without a gap check (CR-7), no future-leak test (CR-8), and silent serving edge cases (CR-12, CR-13).
2. **Eval integrity**: golden scoring matches KICKOFF §5 exactly (pass = within one tier **and** actual inside
   [p10, p90]; 48 held-out cases with a stratification test). The SHA lock was committed in df79fa4, before any
   model existed. But the lock can be rewritten, covers only the 48 golden rows (CR-4), the dev split will score the
   artifact in-sample (CR-5), and the NFR-1 latency floor measures a mean, not a p95 (CR-6).
3. **Contract**: routes match `contracts/openapi.json` (gate + `test_contract_has_not_drifted`). The loosened
   `WARD_ID_PATTERN` is *right*: the dataset IDs (`DNCC_Ward_04`, `GCC_Ward_01`) would match either pattern, but the
   old strict one turned `XYZ_Ward_99` into a 422; now it reaches the 404 `unknown-ward` path that AC-2 requires
   (probe ✅). AC-4 is not yet met: the forecast and scenario stubs return 200 for unknown wards and out-of-range
   origins, and the contract can't express the range today (CR-3).
4. **Dashboard**: every panel has loading/empty/error + Retry/"Ward not found" states, `placeholderData: undefined`
   (no stale tier), the window toggle requests only `[2,3,4]` so `peak_tier` is the window peak, tiers show EN/BN +
   1–4 meter, there are zero hex values outside `tokens.css`, and Lime only appears in the Ink header. The open issue is
   the demo scenario (CR-2).
5. **Setup**: 97 s with uv, zero keys, `.env` copied from `.env.example`. Windows without uv breaks (CR-1).

## Findings

### CR-1 [BLOCKER] Windows setup without uv fails whenever the clone path contains a space
File: `scripts/setup.mjs:18, :30, :43, :59` · Owner: LEAD (ff89e58 rewrote setup)
Problem: every spawn uses `shell: isWin`. With a shell, Node joins command and args **unquoted** (that's what the
DEP0190 warning in the setup log is about). The no-uv branch then spawns the absolute venv path
`…\apps\api\.venv\Scripts\python.exe -m pip install …`, and cmd.exe splits it at the first space. I reproduced this
with that exact call in this worktree (`…\AI Engineering Hackathon\…`):
`shell:true → status 1 'C:\Users\MSI\orca\workspaces\AI' is not recognized` · `shell:false → status 0 Python 3.12.16`.
Why it matters: AC-9, NFR-5 and R1 (10 pts). Judges on Windows often have spaces in their profile path
(`C:\Users\First Last\`), and uv is not a stated prerequisite. Our own repo folder name has a space, so the team's
fresh-clone gate will also hit this as soon as uv is missing.
Fix (keep the shell only for PATH shims such as `npm.cmd`, `uv`, `py`; their args here contain no spaces):
```diff
 const isWin = process.platform === "win32";
+// cmd.exe is needed only for PATH shims (npm.cmd); absolute exe paths may contain spaces and must bypass the shell.
+const useShell = (cmd) => isWin && !path.isAbsolute(cmd);
@@ function run
-  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
+  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: useShell(cmd) });
@@ function runAsync
-    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: isWin });
+    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: useShell(cmd) });
@@ function has
-  return spawnSync(cmd, args, { stdio: "ignore", shell: isWin }).status === 0;
+  return spawnSync(cmd, args, { stdio: "ignore", shell: useShell(cmd) }).status === 0;
```
Then prove it: run `gates.mjs fresh-clone` from a folder whose name has a space, with uv removed from PATH.

### CR-2 [HIGH] The pinned demo week makes the AC-7 scenario lower the rain, so the tier drops on camera
File: `apps/web/src/lib/demo-config.ts:22-25`, `apps/web/src/features/scenario/components/ScenarioPanel.tsx:230, :460`,
`apps/web/src/app/page.tsx:401-405` · Owner: UI (+ LEAD to pin the week in `docs/demo.md`)
Problem: the scenario panel reuses the shared ward and week. In demo mode those are `DSCC_Ward_04` at `2024-08-05`,
and the API reports **216.38 mm** of rain in that week (`GET /wards/DSCC_Ward_04/history?start=2024-07-29…`). The
120 mm preset therefore *reduces* this week's rain by 96 mm. AC-7 requires a baseline that is a non-Critical ward-week
with **< 20 mm**, and the model has monotone-increasing rain constraints, so the real h = 3 forecast will fall or stay
flat. e2e `ac_7` passes today only because the stub multiplies everything by 1.3 (`forecast/router.py:66`).
Why it matters: golden-path step 5 and the 1:35–2:00 video beat ("slider to 120 mm moves the tier") will show
the opposite of the story. This becomes visible the moment core-forecast merges.
Fix: pin a separate scenario baseline and use it in demo mode. Pick a ward-week with < 20 mm rain, a non-Critical
actual, and a 2016-02-29…2025-12-29 Monday, and record it in `docs/demo.md`:
```diff
   scenarioRainfallMm: 120,
+  // AC-7 baseline: non-Critical ward-week with < 20 mm rain (2024-08-05 had 216 mm in DSCC_Ward_04).
+  scenarioBaseline: { wardId: "<pinned ward>", originWeek: "<pinned Monday>" },
```
```diff
             <ScenarioPanel
-              wardId={selectedWardId}
-              originWeek={selectedOriginWeek}
+              wardId={isDemoMode ? DEMO_CONFIG.scenarioBaseline.wardId : selectedWardId}
+              originWeek={isDemoMode ? DEMO_CONFIG.scenarioBaseline.originWeek : selectedOriginWeek}
```
Also make e2e `ac_7` assert `scenario[h=3].expected_cases > baseline[h=3].expected_cases` against the real API once
core-forecast lands, not against the stub.

### CR-3 [HIGH] AC-4: the contract can't reject an out-of-range `origin_week`, and forecast/scenario accept unknown wards
File: `apps/api/app/features/forecast/schemas.py:43-45, :84`, `apps/api/app/core/types.py:24-32` · Owner: LEAD
(contract) → core-forecast must also implement the 404
Problem: `IsoWeek` only checks for a Monday. Probes: `origin_week 2030-01-07` → **200**, `2016-01-04` (before the
first origin with all lags) → **200**, `ward_ids ["XYZ_Ward_99"]` → **200** with `city: "Dhaka South"`. AC-4 needs a
422 that *names the field*. A service-level `AppError(422, …)` can't do that, because `_problem` sends no `errors` list.
Why it matters: AC-4 is a MUST and NFR-8 red-team cases (huge or old dates) target exactly this. A pre-2016-02-29
origin also feeds NaN lags to the model.
Fix (dataset mode only, because live mode forecasts from this week):
```diff
# app/core/types.py
+FIRST_FORECAST_ORIGIN = DATA_START + timedelta(weeks=8)  # 2016-02-29: all 0–8-week lags exist
+
+def in_dataset_range(d: date) -> date:
+    if not FIRST_FORECAST_ORIGIN <= d <= DATA_END:
+        raise ValueError(f"must be between {FIRST_FORECAST_ORIGIN} and {DATA_END} in dataset mode")
+    return d
```
```diff
# features/forecast/schemas.py — declare `source` before `origin_week` so the validator can read it
 class ForecastRequest(BaseModel):
     ward_ids: list[WardId] = Field(min_length=1, max_length=60)
+    source: WeatherMode = "dataset"
     origin_week: IsoWeek = Field(...)
     horizons: list[Horizon] = Field(default=[1, 2, 3, 4], min_length=1, max_length=4)
-    source: WeatherMode = "dataset"
+
+    @field_validator("origin_week")
+    @classmethod
+    def _range(cls, v: date, info: ValidationInfo) -> date:
+        return in_dataset_range(v) if info.data.get("source", "dataset") == "dataset" else v
@@ class ScenarioRequest
-    origin_week: IsoWeek
+    origin_week: Annotated[IsoWeek, AfterValidator(in_dataset_range)]
```
Regenerate `contracts/openapi.json`. Add contract tests that unknown wards on `/forecast` and `/scenario` return 404
`…/unknown-ward` naming the ward. core-forecast owns that lookup.

### CR-4 [MEDIUM] The hold-out lock can be rewritten silently and doesn't cover the rows the floors use
File: `apps/api/evals/run.py:389-396`, `apps/api/evals/scoring.py:55-65` · Owner: QA
Problem: (a) `--lock` overwrites `heldout_sha256` at any time without refusing or logging. (b) The tamper check is
skipped when the SHA is missing (`locked_sha is not None and …`). (c) The SHA covers only the 48 golden records, but
every AC-5 floor (MAE, coverage, tiers, Critical recall) is computed from the raw 2024–2025 rows that
`load_raw_dataset` reads with no checksum. `scripts/seed.py:27` already verifies `EXPECTED_SHA256`; the evals don't.
Why it matters: ADR-0004 and AC-5 claim a hold-out "locked by SHA-256 before tuning". Today only git history enforces it.
Fix:
```diff
     if args.lock:
+        if cfg.get("heldout_sha256") and not args.relock:
+            print("FAIL: hold-out already locked; --relock needs LEAD approval and is logged", file=sys.stderr)
+            return TAMPER_EXIT_CODE
@@
-    if args.split in ("heldout", "all") and locked_sha is not None and locked_sha != current_sha:
+    if args.split in ("heldout", "all") and locked_sha != current_sha:
```
In `load_raw_dataset`, check `compute_sha256(src) == EXPECTED_SHA256` (import from `scripts.seed`) and raise on a mismatch.

### CR-5 [MEDIUM] The dev split will score the ≤ 2023 artifact in-sample, with rain normals fit on the scored years
File: `apps/api/evals/run.py:404`, `apps/api/evals/scoring.py:302`, `apps/api/app/shared/features.py:264-268` ·
Owner: QA (+ DATA for the normals)
Problem: `--split dev` sets `fit_year = 2018` only for the climatology. The CORE artifact (trained through 2023, with
2023 for tuning) scores the dev targets 2019–2023, which are its own training rows. The hook also calls
`build_features(df, horizon=h)` without `rain_normals` or `max_normal_year`, so `rain_anomaly` uses normals fit on
2016–2023, i.e. on the scored dev years. ADR-0004 asks for rolling-origin folds that test 2019–2022.
Why it matters: dev numbers will look far better than reality, and anyone tuning on `eval:dev` tunes on training data.
Fix: pass `max_normal_year=self.climatology.train_end_year` (or the artifact's stored normals) in
`_build_feature_lookup`. In `main`, refuse `--split dev` with a non-fallback model unless the artifact metadata says
`train_end_year <= 2018`, and point dev scoring at `ml/backtest.py` folds instead.

### CR-6 [MEDIUM] The NFR-1 "p95 < 50 ms per ward" floor actually measures an amortized mean
File: `apps/api/evals/scoring.py:365-370`, floor in `apps/api/evals/run.py:315` · Owner: QA
Problem: for batches above 200 rows (the global hold-out has about 6,000 per horizon), every row gets
`batch_time / n`, so `p95_ward_ms` equals the mean. Feature building, which serving also pays, isn't timed at all.
Why it matters: NFR-1 and the AC-10 cost numbers can't be trusted; a slow single-ward path would still pass.
Fix: time a random sample of 200 rows one call at a time (feature build + `predict`) and use that p95 for
`p95_ward_ms_lt_50`. Keep the amortized number as a separate `throughput_ms_per_ward`.

### CR-7 [MEDIUM] Lags shift by row, not by week: a missing week silently misaligns every lag
File: `apps/api/app/shared/features.py:281, :315-316, :433` · Owner: DATA
Problem: `groupby("ward_id").shift(k)` is positional. The seeded data has no gaps, but live ingestion, a partial
seed, or Stage-2 Postgres backfills can drop a week. `rainfall_lag_3` would then be four weeks back, with no error.
Why it matters: R2 hinges on lag correctness, and this is the one way the "grouped per ward" guarantee can break.
Fix (after the sort at `:255`):
```python
step = pd.to_datetime(df["week"]).groupby(df["ward_id"], sort=False).diff().dropna()
if not (step == pd.Timedelta(weeks=1)).all():
    raise ValueError("non-consecutive weekly rows per ward; reindex to a full Monday calendar before building lags")
```

### CR-8 [MEDIUM] No test proves "built only from data dated ≤ origin_week" (AC-3)
File: `apps/api/tests/test_features_lags.py` · Owner: DATA
Problem: the tests cover grouping (AC-2), nulls, normals and override isolation. Nothing mutates the rows *after*
`origin_week` and asserts the features are unchanged, which is the property the ADR-0004 claim rests on.
Fix:
```python
def test_ac_3_features_ignore_rows_after_origin():
    origin = df["week"].iloc[60]
    base = build_serving_features(df, wards_df, origin_week=origin, horizon=3, rain_normals=normals)
    future = df.copy()
    future.loc[future["week"] > origin, ["rainfall_mm", "avg_temp_c", "relative_humidity_pct"]] = 999.0
    pd.testing.assert_frame_equal(
        base, build_serving_features(future, wards_df, origin_week=origin, horizon=3, rain_normals=normals))
```

### CR-9 [MEDIUM] Stubs return realistic-looking numbers that the dashboard renders as real results
File: `apps/api/app/features/validation/router.py:11` (`("lightgbm", 1.02)` labelled hold-out),
`features/heatmap/router.py` (one ward), `features/forecast/router.py` · Owner: LEAD (stubs) + UI (banner)
Problem: the validation tab currently shows "lightgbm, holdout_2024_2025, MAE 1.02". That is the spike number,
hard-coded. If core-forecast slips past freeze, the video presents invented metrics (R3: "0 = mocked").
Fix: have stubs raise `AppError(503, "not-ready", …)` (the UI already has an error state), or have the UI show a
"Sample data — model not loaded" banner whenever `model_version.startsWith("stub")`.

### CR-10 [MEDIUM] `APP_ENV=prod` bypasses the production guards
File: `apps/api/app/core/config.py:19` vs `apps/api/app/adapters/db/factory.py:58, :69` · Owner: LEAD
Problem: ff89e58 added `"prod"` to `app_env`, but auto-migrate and auto-seed are skipped only when it equals
`"production"`. `__main__ --env` doesn't offer `prod` either. With `APP_ENV=prod`, the API migrates and seeds
whatever database it is pointed at.
Fix: drop `"prod"`, or normalise it in a `field_validator` (`return "production" if v == "prod" else v`).

### CR-11 [MEDIUM] The smoke test accepts 422 for an unknown ward, so AC-2 regressions pass CI
File: `scripts/smoke.mjs:39` · Owner: QA
Problem: `bad.status === 404 || bad.status === 422`. AC-2 requires 404 with `type` ending `/unknown-ward`, which the
API does return today (probe). Reverting the pattern would silently turn it back into a 422.
Fix: `check("unknown ward → 404 unknown-ward", bad.status === 404 && String(bad.json?.type).endsWith("/unknown-ward"));`

### CR-12 [LOW] `build_serving_features` silently returns nothing or ignores the what-if
File: `apps/api/app/shared/features.py:359-374` · Owner: DATA
Problem: if no row equals `origin_week` (non-Monday, beyond `data_end`, ward filtered out), the override mask is
empty and the function returns an empty frame. Unknown override keys are dropped without a word.
Fix: raise `ValueError` when `feats` is empty after the cutoff filter, and when the override has keys outside
`REQUIRED_WEATHER_COLUMNS`.

### CR-13 [LOW] `build_features` refits rain normals from whatever frame it is given
File: `apps/api/app/shared/features.py:264-268` · Owner: DATA
Problem: when `rain_normals` is omitted, normals are refit from the frame after the cutoff. A backtest at a 2018
origin then gets 2016–2018 normals, while training used 2016–2023. That is train/serve skew. The PRD says the
normals are stored in the artifact.
Fix: make `rain_normals` required in `build_serving_features`, and log a warning when `build_features` has to fit normals.

### CR-14 [LOW] Every split overwrites `eval.json`; the committed copy is the dev run
File: `apps/api/evals/run.py:454` · Owner: QA
Problem: the committed `results/eval.json` has `"split": "dev"`, `climatology-le2018`, pass_rate 0.6458. AC-5 defines
`eval.json` as the held-out result.
Fix: write `eval.json` only when `args.split == "heldout"`.

### CR-15 [LOW] `skipped: 0` is hard-coded while missing rows fall back to climatology without a trace
File: `apps/api/evals/run.py:430, :464`, `apps/api/evals/scoring.py:380-383` · Owner: QA
Fix: count the fallback rows, report them as `skipped`, and fail the held-out run when the count is above 0.

### CR-16 [LOW] `/readyz` is always 200
File: `apps/api/app/main.py:28` · Owner: LEAD (+ CORE when wiring the lifespan)
Problem: `app.state.ready = True` is set before the DB is checked or seeded and before the model is loaded, so AC-9's
"readyz 200" proves nothing.
Fix: set it only after `ensure_database_ready()`, a ward count > 0, and (once merged) a successful artifact load and
SHA check.

### CR-17 [LOW] UI files over the size guideline
File: `apps/web/src/features/brand/BrandShowcase.tsx` (960 lines, above the 800 ceiling) · `ScenarioPanel.tsx` 694 ·
`ValidationView.tsx` 554 · `LagsPanel.tsx` 530 · `WardForecastView.tsx` 519 · Owner: UI-2 (BrandShowcase), UI (rest)
Fix: split them after freeze-critical work. Pull the chart, table and form subcomponents into `components/` files
inside each feature folder.

### CR-18 [LOW] The axe gate ignores moderate WCAG violations
File: `apps/web/e2e/dashboard.spec.ts:41-43` · Owner: UI
Problem: the scan is already limited to WCAG A/AA tags, so any hit there is an AA failure whatever its impact, yet only
`serious` and `critical` fail the test. NFR-6 claims WCAG 2.2 AA.
Fix: assert `scan.violations` is empty, or list explicit, justified exclusions.

### CR-19 [LOW] The lags cache can recompute on every request; the cold start isn't warmed
File: `apps/api/app/features/lags/service.py:34` · Owner: DATA
Problem: a ward that exists in `wards` but has no observations misses the cache every time, triggering a full
31k-row load and recompute. The first call costs 378 ms (warm: 12 ms).
Fix: cache a negative result for that ward, and warm `_get_correlations` once in the lifespan.

## Fix routing by owner seat
- **LEAD**: CR-1 (BLOCKER), CR-3 (HIGH, contract), CR-9, CR-10, CR-16. Pin the AC-7 scenario baseline in `docs/demo.md` for CR-2.
- **UI**: CR-2 (HIGH), CR-9 banner, CR-17 (dashboard files), CR-18.
- **UI-2**: CR-17 (`BrandShowcase.tsx`).
- **QA**: CR-4, CR-5, CR-6, CR-11, CR-14, CR-15.
- **DATA**: CR-7, CR-8, CR-12, CR-13, CR-19 (+ the normals half of CR-5).
- **CORE (core-forecast, in flight)**: implement the 404 for unknown wards on `/forecast` and `/scenario` (CR-3), wire
  the readiness checks (CR-16), and store normals and `train_end_year` in the artifact metadata (CR-5, CR-13).

## Keep
1. `app/shared/features.py` is the single builder for training, backtest and serving. It cuts at the origin before
   any shift, groups lags per ward, and fits normals on ≤ 2023 with ISO-53 folding. `test_ac_2_lags_grouped_by_ward`
   is named after its AC, and the real dataset reproduces the lag-3 peak (the API reports peak 3 for the ward and the
   dataset).
2. Error discipline: every probed failure is `application/problem+json` with field-named `errors` and a
   `request_id`. The loosened `WARD_ID_PATTERN` routes plausible unknown IDs to the 404 that AC-2 requires.
3. Dashboard state handling: four states per panel, no stale tier (`placeholderData: undefined`), the scenario runner
   aborts in-flight requests and resets on ward/week change, colours come only from tokens, Lime stays in the header,
   and tiers carry EN/BN + 1–4 meter. All of it is covered by 9 e2e tests, including axe.
