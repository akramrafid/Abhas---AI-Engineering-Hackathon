# Merge review: akramrafid/wp4-data-fix

- **Author**: DATA-FIX (`antigravity/Gemini 4 Neon (XHigh)`)
- **Reviewer**: LEAD (`antigravity/Gemini 4 Neon (XHigh)`) — same-family integration check; cross-family Claude Opus 5.5 review pending (r2).
- **Checked**: `git diff lead..akramrafid/wp4-data-fix` (11 files, `ba1e61d..8bb6782`: `app/shared/features.py`, `app/adapters/openmeteo.py`, `app/features/lags/{__init__,deps,service}.py`, `scripts/seed.py`, `tests/test_features_lags.py`, `tests/test_openmeteo.py`, `tests/features/lags/test_lags.py`, `docs/data-pipeline.md`, `evals/results/retrieval.json`). Covers CR-7 consecutive-week & duplicate ward-week guards, CR-8 cutoff immutability tests, CR-12 strict weather override validation, CR-13 required `rain_normals` in serving + warning on on-the-fly refit, CR-19 negative lag cache + `warm_lags_cache()`, ISO week 53 folding, case-insensitive temperature ingest, and Open-Meteo partial-week completion & payload hardening. Worker gates: ruff, pyright, 92/92 pytest, `migrations`, `slices`, `retrieval` PASS.
- **Not verified**: Wiring `warm_lags_cache()` in `app/main.py` lifespan and `disable_existing_loggers=False` in `migrations/env.py` (LEAD integration follow-up after Wave 2A merges); `evals/scoring.py` passing `rain_normals` (WP5 QA); cross-family Claude Opus 5.5 review pending in r2.

Verdict: MERGE
