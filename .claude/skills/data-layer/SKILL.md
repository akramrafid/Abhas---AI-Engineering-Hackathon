---
name: data-layer
description: Data and infrastructure layer for BUILDER-DATA and BUILDER-CORE - shared local infra via Docker Compose with no-Docker fallbacks, Postgres schema design, SQLAlchemy 2 models, Alembic migrations, repositories and transactions, idempotent seed scripts, dataset ingestion and validation, Redis and object storage patterns, and the npm run healthcheck connectivity script. Use when creating tables, migrations, seed or demo data, loading provided datasets, or wiring databases, caches and storage.
---

# Data Layer

## 1. Shared local infra (LEAD starts it once)
`compose.yaml` has a fixed `name:` → every worktree talks to the same containers on standard ports
(Postgres 5432 · Qdrant 6333 · Redis 6379). Builders never start their own copies. Commands:
`npm run infra:up`, `npm run infra:down`. Data persists in named volumes.
No Docker: SQLite (`sqlite+aiosqlite:///./app.db`, add `aiosqlite`) for app data · Qdrant local mode
(`QDRANT_PATH=./.qdrant`) for vectors · in-process cache instead of Redis · local `./uploads` for files.

## 2. Schema rules
- UUID primary keys (`uuid4`) for anything exposed in URLs; `created_at`/`updated_at` as `timestamptz`
  with server defaults; UTC everywhere.
- NOT NULL by default; FKs with explicit `ondelete`; UNIQUE for natural keys; CHECK for enums/ranges.
- Index every column used in WHERE/JOIN/ORDER BY on the demo path; GIN index for queried JSONB.
- JSONB only for genuinely flexible metadata — not to avoid modelling.
- Multi-tenant/user data: `tenant_id`/`user_id` column + index, enforced in repositories.

```python
import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, MetaData, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    # deterministic constraint names → clean Alembic autogenerate diffs
    metadata = MetaData(naming_convention={
        "ix": "ix_%(column_0_label)s", "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s", "pk": "pk_%(table_name)s"})

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(500))
    source_uri: Mapped[str] = mapped_column(String(2000), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")   # pending|indexed|failed
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

## 3. Migrations (Alembic, async)
```
cd apps/api
uv run alembic init -t async migrations
# migrations/env.py: target_metadata = Base.metadata; url from get_settings().database_url
uv run alembic revision --autogenerate -m "create documents"    # then READ the generated file
uv run alembic upgrade head
```
Root script `npm run db:migrate` (in LEAD's skeleton) runs `alembic upgrade head`.
Only the DATA owner writes migrations (one linear history). pgvector: first migration runs
`op.execute("CREATE EXTENSION IF NOT EXISTS vector")`. Never edit an applied migration — add a new one.

## 4. Repositories and transactions
Repositories take an `AsyncSession` and return domain objects/DTOs; services own transactions:
```python
async def create_document(session, docs, jobs, payload):
    async with session.begin():          # both writes commit together or not at all
        doc = await docs.create(payload)
        await jobs.enqueue(doc.id)
    return doc
```
Avoid N+1 with `selectinload`/`joinedload`. Keyset pagination (`WHERE (created_at, id) < (:c, :i)`).
Bulk inserts with `insert(...).values([...])`; Postgres upserts with `on_conflict_do_update`/`do_nothing`.

## 5. Seed and demo data (`apps/api/scripts/seed.py`, `npm run seed`)
Idempotent (upsert by natural key), realistic (names, numbers, edge cases the demo shows), small enough to
load in < 30 s, and includes the exact records the golden path uses. Print counts, never secrets.

## 6. Provided datasets (`/data`)
Profile first (row counts, nulls, types, duplicates) → validate rows with a Pydantic model → load valid rows,
write rejects to `data/rejects/<name>.csv` with the reason → log summary. Loading is idempotent and
re-runnable. Large files: stream/chunk (polars or pandas with chunksize). Document the dataset in README.

## 7. Redis, storage, jobs (only when the plan needs them)
- Redis: rate-limit counters, TTL caches (`SET key value EX 3600`), job queue (`arq`) — keys namespaced
  `app:<feature>:<id>`.
- Files: local `./uploads` in dev; S3-compatible (MinIO/R2/S3) via `boto3` when credentials exist;
  random object keys; presigned URLs for downloads; content-type + size validated before storing.
- Jobs: a `jobs` table (status, progress, error, attempts) is enough for a hackathon; workers update
  progress; endpoints read it.

## 8. Connectivity check (`apps/api/app/healthcheck.py`, `npm run healthcheck`)
```python
import asyncio, time
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import get_settings

async def _timed(name, coro):
    t0 = time.perf_counter()
    try:
        await asyncio.wait_for(coro, timeout=5)
        status = "OK"
    except Exception as e:                       # print the error type only, never connection strings
        status = f"FAIL ({type(e).__name__})"
    return name, status, (time.perf_counter() - t0) * 1000

async def _postgres(url: str):
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    finally:
        await engine.dispose()

async def main() -> int:
    s = get_settings()
    checks = [("postgres", _postgres(s.database_url))]
    # add: ("qdrant", store.c.get_collections()), ("redis", redis.ping()), ("llm", tiny completion) as configured
    results = await asyncio.gather(*(_timed(n, c) for n, c in checks))
    for name, status, ms in results:
        print(f"{name:<10} {status:<28} {ms:7.0f} ms")
    return 0 if all(r[1] == "OK" for r in results) else 1

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
```

## 9. Done checklist
Migrations apply from empty DB (`db:migrate`) · constraints + indexes for demo queries · seed idempotent ·
dataset rejects logged · healthcheck green · no credentials in code, logs or migration files.
