---
name: devops-deploy
description: Containers, CI and deployment for BUILDER-QA and LEAD - uv-based multi-stage API Dockerfile, Next.js standalone Dockerfile, .dockerignore, a compose override that runs the whole app with one command, GitHub Actions CI for lint, typecheck, tests and build, Windows line-ending safety, and a deploy checklist for Vercel, Render, Railway, Fly.io or Cloud Run that routes every account or token through the credentials gate and human approval. Use when containerising, wiring CI, or preparing a deploy.
---

# DevOps and Deploy

Principle: **anyone can run the whole product with one command**, and CI proves every merge.
Deploying publicly is irreversible-ish and needs accounts → LEAD asks the human (credentials-gate) first.

## 1. API image (`apps/api/Dockerfile`)
```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project      # cached dependency layer
COPY . .
RUN uv sync --frozen --no-dev && useradd --create-home appuser && chown -R appuser /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
`apps/api/.dockerignore`: `.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`, `.env`, `tests`, `evals/report.md`.
Keep `demo_replay/` in the image (stage fallback).

## 2. Web image (`apps/web/Dockerfile`) — needs `output: "standalone"` in `next.config.ts`
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```
`NEXT_PUBLIC_*` values are baked in at build time — pass the real API URL as a build arg.

## 3. One-command full app (`compose.app.yaml`, owned by QA; infra stays in LEAD's `compose.yaml`)
```yaml
services:
  api:
    build: ./apps/api
    env_file: .env
    environment:
      DATABASE_URL: postgresql+psycopg://app:app@postgres:5432/app
      QDRANT_URL: http://qdrant:6333
    ports: ["8000:8000"]
    depends_on:
      postgres: { condition: service_healthy }
  web:
    build:
      context: ./apps/web
      args: { NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000" }
    ports: ["3000:3000"]
    depends_on: [api]
```
Run: `docker compose -f compose.yaml -f compose.app.yaml up --build` → README "Run with Docker".
Migrations: run `alembic upgrade head` before the API starts (entrypoint step or a one-off
`docker compose ... run --rm api /app/.venv/bin/alembic upgrade head`).

## 4. CI (`.github/workflows/ci.yml`)
```yaml
name: ci
on: [push, pull_request]
jobs:
  api:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/api } }
    env: { LLM_MOCK: "1" }
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --frozen
      - run: uv run ruff check . && uv run ruff format --check .
      - run: uv run pytest -q
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/web } }
    env: { NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: apps/web/package-lock.json }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm run build
```
Integration tests that need Postgres/Qdrant in CI → add `services:` containers to the `api` job with the same
images as `compose.yaml`. Secrets never in CI unless the human adds them as repository secrets.

## 5. Cross-platform hygiene (the team is on Windows)
`.gitattributes` at the repo root:
```
* text=auto
*.sh text eol=lf
*.ps1 text eol=crlf
```
Use root `npm run` scripts (work in PowerShell and bash). No bash-only syntax in npm scripts
(`VAR=x cmd` fails on Windows — read settings from `.env` or CLI flags instead).

## 6. Deploy (only after LEAD + human approval)
| Part | Simple target | Needs from the human (via credentials-gate) |
|---|---|---|
| Web | Vercel (import the GitHub repo, root `apps/web`) | Vercel account/project or `VERCEL_TOKEN` |
| API | Render / Railway / Fly.io / Cloud Run (Docker image from `apps/api`) | account + token; region |
| Postgres | Neon / Supabase / platform Postgres | `DATABASE_URL` |
| Vector DB | Qdrant Cloud | `QDRANT_URL`, `QDRANT_API_KEY` |
Steps: set env vars in the platform (never in git) → `CORS_ORIGINS` includes the deployed web URL →
run migrations as a release step → seed demo data → `/readyz` green → `SMOKE_API_URL=<deployed api> npm run smoke`
(PowerShell: `$env:SMOKE_API_URL="<url>"; npm run smoke`) → README gets the live URLs.

## 7. Done checklist
Both images build and pass healthchecks · full app runs with one compose command · CI green on
`LEAD_BRANCH` · `.gitattributes` present · deploy (if any) verified by smoke against the live URL.
