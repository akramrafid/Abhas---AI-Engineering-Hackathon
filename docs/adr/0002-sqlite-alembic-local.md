# ADR-0002: SQLite via SQLAlchemy + Alembic, local run, no server database
## Status
Accepted · 2026-11-21
## Context
Rubric R1 gives full marks only if a fresh clone launches in ≤ 3 minutes on someone else's Windows or macOS
machine with README commands. The data is 31,320 rows. TASK.md preferences: no Neon, no server DB, no Docker;
the same migrations must run on Postgres in the final sprint.
## Decision
State lives in a SQLite file (`data/abhas.db`, WAL mode, busy timeout) created by `alembic upgrade head` and
seeded from the xlsx at setup. Tables: wards, observations, weather_cache, predictions_cache, api_calls,
llm_traces. `DATABASE_URL` switches to Postgres without code changes. Hot predictions and ops counters are also
held in memory. Deploy (Vercel) is skipped this round (`gates.json` skip) and needs the human's approval.
## Rejected options
- **Neon Postgres** — needs credentials and network, breaks the zero-key 3-minute run for judges.
- **Docker Compose with Postgres** — Docker is not installed on every judge machine; adds minutes to setup.
- **Parquet files only, no database** — no migrations story for Stage 2 and no place for caches and call logs.
## Consequences
Zero-key, offline setup; one writer process. SQLite write contention under load is mitigated by WAL and
in-memory caches. Revisit for Stage 2 (multi-user, scheduled live scoring → Postgres).
