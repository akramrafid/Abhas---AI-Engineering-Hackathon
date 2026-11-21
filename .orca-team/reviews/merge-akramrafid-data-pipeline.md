# Merge review — akramrafid/data-pipeline

_Reviewer: LEAD (antigravity/Gemini 4 Neon XHigh · cross-family Opus review deferred until 19:20 BST quota reset per STATUS.md rule)_

- Scope: strictly owned files only (`apps/api/alembic.ini`, `migrations/**`, `app/adapters/db/**`, `app/adapters/openmeteo.py`, `app/shared/features.py`, `app/features/{wards,lags,weather}/{deps,service,router}.py`, `scripts/**`, `config/city_centroids.json`, tests, `docs/data-{model,pipeline}.md`); zero edits to `app/main.py`, `app/core/`, `app/ports/`, `schemas.py`, `evals/`, or `apps/web/`.
- AC-1, AC-2, AC-15 verified: `app/shared/features.py` enforces case-insensitive `avg_temp_C -> avg_temp_c` non-null ingestion, strict per-ward lag grouping (first k rows NaN, zero cross-ward/future leakage), dataset lag-3 correlation peak (`r = 0.4679`), and ISO week 53 folding; `openmeteo.py` uses explicit timeouts, bounded retries/breaker, single-flight lock, 6 h TTL cache, and ERA5 historical bias check across 2,610 city-weeks (`passed=true`).
- Worker verified `npm run db:check` (up/down/up), `npm run seed` (3.01 s cold / 0.02 s fast path), `gates.mjs migrations slices`, and `npm run ci` (20/20 pytest, `smoke:local` PASS); `.gitignore` updated for `*.db-wal`/`*.db-shm`.

Verdict: MERGE
