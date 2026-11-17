---
name: architecture-blueprint
description: Reference architectures and the default production stack for AI engineering hackathon projects. Maps a problem to archetypes (RAG assistant, agentic workflow, document extraction, chat with memory, NL-to-SQL analytics, multimodal or voice, search and recommendation, classification at volume, model training), gives the repo layout, ownership map, ports, contract-first workflow, compose file, root task-runner scripts and ADR format. Use when LEAD designs the system or any agent needs to know where code belongs.
---

# Architecture Blueprint

## 1. Default stack (use unless TASK.md mandates otherwise)
| Layer | Default | Why |
|---|---|---|
| API | Python 3.12 · FastAPI · Pydantic v2 · uvicorn · httpx · tenacity · `uv` | Best AI ecosystem, typed contracts, auto OpenAPI, async |
| LLM access | Thin adapter over the `openai` SDK with configurable `base_url` (OpenAI-compatible endpoints); native SDK only for provider-specific features | Swap providers by config; one code path |
| Relational DB | PostgreSQL 16 (+ pgvector) · SQLAlchemy 2 · Alembic | One store for app data and small/medium vector sets |
| Vector DB | Qdrant when TASK.md asks for it, heavy filtering/hybrid search, or > ~1M chunks; else pgvector | Fewer moving parts by default |
| Cache/queue | Redis (only if needed: rate limits, job queue, semantic cache) | |
| Frontend | Next.js (App Router) · TypeScript strict · Tailwind · shadcn/ui · TanStack Query · `openapi-typescript` + `openapi-fetch` | Fast, typed against the contract |
| Infra | Docker Compose for local services; Dockerfile per app | One-command run |
| Task runner | Root `package.json` scripts (Node is on every machine; works in PowerShell and bash) | Cross-platform |
| CI | GitHub Actions: lint, typecheck, test, build | |

Mandated other stack → keep the same layering and production bar:
| Concern | Python | Node/TS | Go | Java |
|---|---|---|---|---|
| HTTP + validation | FastAPI + Pydantic | Fastify/NestJS + zod | chi/echo + validator | Spring Boot + Bean Validation |
| DB + migrations | SQLAlchemy + Alembic | Prisma or Drizzle | sqlc + goose/atlas | JPA + Flyway |
| HTTP client + retry | httpx + tenacity | undici/ky + p-retry | net/http + backoff | WebClient + Resilience4j |

## 2. Repository layout and ownership
```
compose.yaml                      LEAD   local infra (fixed project name → one shared stack)
package.json                      LEAD   root scripts = the only commands agents use
.env.example                      LEAD   every variable, documented
contracts/openapi.json            LEAD   exported from Pydantic schemas (npm run contracts)
docs/architecture.md, docs/adr/   LEAD
apps/api/
  pyproject.toml, uv.lock, Dockerfile
  app/__main__.py                 runner: `python -m app --port 8001` (cross-platform ports)
  app/main.py                     create_app(): middleware, routers, lifespan
  app/export_openapi.py           writes contracts/openapi.json
  app/healthcheck.py              `npm run healthcheck`: one tiny call per external service
  app/core/                       config, logging, errors, middleware, security
  app/schemas/              LEAD  request/response models = the contract
  app/api/routes/           CORE  thin routers → services
  app/services/             CORE  business logic (no framework imports)
  app/adapters/             CORE  llm.py, embeddings.py, vectorstore.py, storage.py, external/
  app/adapters/db/          DATA  SQLAlchemy models, repositories
  app/prompts/              CORE  versioned prompt files
  migrations/               DATA  Alembic
  scripts/seed.py           DATA  idempotent demo data
  tests/unit/               CORE
  tests/integration/        QA
  evals/                    QA    golden sets + runner
apps/web/                   UI    Next.js app (except e2e/)
apps/web/e2e/               QA    Playwright smoke of the golden path
scripts/smoke.mjs           QA    hits the golden-path endpoints end-to-end
.github/workflows/          QA
data/                       DATA  provided datasets / sample docs
```
Ports: LEAD api 8000 · core workers 8001, 8002 · ui web 3001 (+ its own api 8003 if needed) · shared infra:
Postgres 5432, Qdrant 6333/6334, Redis 6379. Run API with `npm run dev:api -- --port <port>`, web with
`npm run dev:web -- -p <port>`.

## 3. Contract-first, code-first export (keeps UI and API in lock-step)
1. LEAD writes Pydantic models in `app/schemas/` and stub routes that return schema-valid mock data.
2. `npm run contracts` → `contracts/openapi.json` (commit it). Every change to schemas → re-export → commit →
   broadcast to workers.
3. UI: `npx openapi-typescript ../../contracts/openapi.json -o src/lib/api/schema.d.ts`, then
   `createClient<paths>()` from `openapi-fetch`. Never hand-write API types.
4. QA: integration tests assert responses validate against the schemas.

## 4. Root `package.json` (LEAD creates in the skeleton)
```json
{
  "name": "hackathon-app",
  "private": true,
  "scripts": {
    "infra:up": "docker compose up -d",
    "infra:down": "docker compose down",
    "dev:api": "cd apps/api && uv run python -m app",
    "dev:web": "npm --prefix apps/web run dev --",
    "dev": "concurrently -n api,web -c blue,green \"npm:dev:api\" \"npm:dev:web\"",
    "contracts": "cd apps/api && uv run python -m app.export_openapi ../../contracts/openapi.json",
    "healthcheck": "cd apps/api && uv run python -m app.healthcheck",
    "db:migrate": "cd apps/api && uv run alembic upgrade head",
    "seed": "cd apps/api && uv run python -m scripts.seed",
    "lint": "cd apps/api && uv run ruff check . && uv run ruff format --check . && cd ../.. && npm --prefix apps/web run lint --if-present",
    "test:api": "cd apps/api && uv run pytest -q",
    "test:web": "npm --prefix apps/web run test --if-present",
    "test": "npm run test:api && npm run test:web",
    "smoke": "node scripts/smoke.mjs",
    "eval": "cd apps/api && uv run python -m evals.run"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```
Runner `app/__main__.py`:
```python
import argparse, os
import uvicorn

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=int(os.getenv("API_PORT", "8000")))
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--no-reload", action="store_true")
    a = p.parse_args()
    uvicorn.run("app.main:app", host=a.host, port=a.port, reload=not a.no_reload)

if __name__ == "__main__":
    main()
```

## 5. `compose.yaml` (only the services the plan needs)
```yaml
name: hackathon-infra
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U app -d app"], interval: 5s, timeout: 3s, retries: 20 }
  qdrant:
    image: qdrant/qdrant        # pin the current stable tag once chosen
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrant:/qdrant/storage"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes: { pgdata: {}, qdrant: {} }
```
No Docker → Postgres from a managed provider (credential) or SQLite for app data; Qdrant local mode
(`QdrantClient(path="./.qdrant")`); in-process cache instead of Redis.

## 6. Archetypes — pick one or combine (record the choice as an ADR)
**A. RAG / knowledge assistant** — ingestion (parse → chunk → embed → upsert), retrieval (hybrid + rerank),
answer (stream + citations + "I don't know"), feedback. Endpoints: `POST /documents`, `GET /documents`,
`POST /chat` (SSE), `GET /conversations/{id}`. Skills: `rag-pipeline`, `llm-engineering`.
**B. Agentic workflow / tool use** — run loop with tool registry, step budget, state store, approval gate for
side-effect tools, trace view. Endpoints: `POST /runs`, `GET /runs/{id}` (+ SSE events), `POST /runs/{id}/approve`.
Skills: `ai-agents`, `llm-engineering`.
**C. Document / data extraction** — upload → parse/OCR → schema-constrained extraction → validation →
human review UI → export; async jobs. Endpoints: `POST /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}/fields`.
Eval: field-level accuracy.
**D. Assistant with memory** — sessions, rolling summary + long-term memory store, persona/system prompt
files, guardrails, streaming.
**E. NL → SQL / analytics** — schema introspection, SQL generation, parse + allow-list (SELECT only, LIMIT),
read-only DB role, timeout, chart spec + explanation. Endpoint: `POST /ask` → `{sql, rows, chart, explanation}`.
**F. Multimodal / voice** — media upload or stream, preprocessing, model call, result visualisation; voice =
STT → LLM → TTS or a realtime API; strict latency budget.
**G. Search / recommendation / matching** — item (and user) embeddings, hybrid scoring + filters, explanations
for each result. Eval: precision@k on a labelled set.
**H. Classification / routing at volume** — structured labels + confidence, thresholds, review queue for
low confidence, batch endpoint, metrics (confusion matrix).
**I. Model training / fine-tuning (only if required)** — strong baseline first, fixed splits, tracked runs,
model card, serve behind the same API layering; time-box hard.

## 7. Cross-cutting decisions to make explicitly (ADR one-liners)
Format: `ADR-n: <decision> because <reason>; rejected <alternative>; revisit if <trigger>.`
Decide: sync vs streaming responses · vector store choice · embedding model + dimension (immutable per
collection) · chunking strategy · auth (none / demo users / OAuth) · job execution (in-request vs background
task vs queue) · multi-tenancy (payload/row filter) · deploy target · LLM provider + fallback.
