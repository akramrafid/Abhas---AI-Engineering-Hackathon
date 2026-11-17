---
name: credentials-gate
description: How LEAD discovers every credential and external service the project needs (LLM API keys, Postgres, Qdrant or other vector DBs, Redis, object storage, OAuth, third-party APIs, deploy tokens), prefers local or embedded alternatives, writes .env.example, asks the human once in a fixed format, verifies keys without ever reading or printing values, and distributes .env to worktrees. Use at intake and whenever any worker reports a missing key.
---

# Credentials Gate

Credentials come **only from the human**. Agents never invent, guess, reuse from memory, print, log, commit,
or put secrets into prompts. Only LEAD asks the human; workers ask LEAD (`orca orchestration ask`).
The human writes secret values **directly into the main `.env` file**, never into chat.

## 1. Inventory (5 minutes, from TASK.md + architecture)
Walk this list and mark each line needed / not needed:

| Category | Typical variables | Local/embedded alternative (no credential) |
|---|---|---|
| App LLM provider | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL` | none for real output → `LLM_MOCK=1` fake responses for dev/tests |
| Embeddings | `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIM` | local `fastembed`/`sentence-transformers` model (CPU, slower) |
| Relational DB | `DATABASE_URL` | Docker `pgvector/pgvector` → `postgresql+psycopg://app:app@localhost:5432/app`; no Docker → SQLite file |
| Vector DB | `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | Docker Qdrant `http://localhost:6333` (no key); no Docker → Qdrant local mode `QDRANT_PATH=./.qdrant` |
| Cache/queue | `REDIS_URL` | Docker `redis://localhost:6379/0`; or in-process cache |
| Object storage | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | local `./uploads` folder or Docker MinIO |
| Auth | `AUTH_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | generated local `AUTH_SECRET`; email/password demo users |
| Third-party APIs from TASK.md | `<VENDOR>_API_KEY` | recorded fixtures for dev |
| Observability | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | JSON logs only |
| Deploy | `VERCEL_TOKEN`, `RENDER_API_KEY`, `FLY_API_TOKEN`, ... | local demo |

Decision rules:
- **Prefer local** for databases/vector stores/caches during the hackathon (zero latency, no quota, no key).
  Use cloud only when TASK.md requires it, a public deploy needs it, or Docker is unavailable and embedded
  mode can't do the job.
- **The app's LLM key is separate from the coding agents.** Claude / Google AI Pro / OpenCode Go
  subscriptions power the coding agents; the product needs its own API key (hackathon credits, Google AI
  Studio, OpenAI, Anthropic API, OpenRouter, or an OpenAI-compatible endpoint). Always ask for it explicitly.
- Prefer one OpenAI-compatible endpoint (`LLM_BASE_URL` + `LLM_API_KEY`) so providers can be swapped by config.

## 2. Write `.env.example` (committed) — every variable, no real secrets
```
# --- App LLM (REQUIRED) ---
LLM_BASE_URL=https://api.openai.com/v1        # any OpenAI-compatible endpoint
LLM_API_KEY=                                  # secret — from your provider console
LLM_MODEL=                                    # e.g. the model name your provider lists
LLM_FALLBACK_MODEL=                           # optional — cheaper/faster backup model
LLM_MOCK=0                                    # 1 = fake responses (dev/tests without a key)
# --- Vector DB ---
QDRANT_URL=http://localhost:6333              # local Docker default; cloud URL if using Qdrant Cloud
QDRANT_API_KEY=                               # optional — only for Qdrant Cloud
# --- Database ---
DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app   # local Docker default (not a secret)
```
Conventions: a line whose comment contains `optional` is optional; empty = missing; values like `changeme`,
`your-key`, `xxx`, `<...>` count as placeholders. Local Docker defaults are fine to commit — they are not secrets.

## 3. Prepare the human's `.env` and CREDENTIALS.md
```
node .orca-team/tools/envtool.mjs init      # creates/updates the MAIN folder's .env from .env.example (never prints values)
node .orca-team/tools/envtool.mjs where     # prints the path the human must edit
node .orca-team/tools/envtool.mjs check --main   # MISSING / EMPTY / PLACEHOLDER / OK per variable, names only
```
Fill `.orca-team/CREDENTIALS.md` → table with variable, service, why, required?, local alternative, status.

## 4. Ask the human ONCE (exact format, early in Phase 2)
```
🔑 CREDENTIALS NEEDED — please fill these in <path from envtool where>, then reply "creds done".
Don't paste secrets here in chat.

REQUIRED
1. LLM_API_KEY + LLM_MODEL (+ LLM_BASE_URL if not OpenAI) — the app's own model access.
   Get it from: your provider's API console / hackathon credits.
2. <VAR> — <service> — needed for <feature>. Get it from: <console page name>.

OPTIONAL (I'll use the local alternative if you skip)
3. QDRANT_URL + QDRANT_API_KEY — Qdrant Cloud. Skip → local Qdrant in Docker.

To skip one: reply "skip <VAR> → mock" (or "→ local").
Meanwhile I'm continuing with everything that doesn't need these.
```
Repeat the request (shorter) at the end of your turn if still missing. Never block the whole swarm on it.

## 5. Gate, verify, distribute
- Tasks needing missing keys: `orca orchestration gate-create --task <id> --reason "waiting for credentials: ..."`;
  meanwhile builders implement against `LLM_MOCK=1` / local defaults.
- Human replies "creds done" → `node .orca-team/tools/envtool.mjs check --main` → all required OK →
  run the project's connectivity check (`npm run healthcheck`, built by CORE/DATA: one tiny request per
  service, prints service name + OK/FAIL + latency, never values) → `gate-resolve --gate <id> --decision approve`.
- Distribute: new worktrees get `.env` automatically (Orca copies it via `.worktreeinclude` at creation).
  Existing worktrees: `orca orchestration send --to @all --subject ".env updated" --body "run: node .orca-team/tools/envtool.mjs sync"`.
- CREDENTIALS.md status → PROVIDED / LOCAL / MOCK. STATUS.md → "Credentials".

## 6. Rules that never bend
- Never `cat`/open/print `.env`; never echo env vars; never include secrets in logs, errors, test fixtures,
  screenshots, commits, PR text, or LLM prompts. Redact in logs (`sk-…` → `***`).
- Server-side only: secrets never reach browser code or `NEXT_PUBLIC_*`.
- Least privilege: ask for read-only or scoped keys when the provider supports it; test/sandbox keys for
  payments/email.
- A secret was exposed (printed, committed, pasted)? Stop, tell the human which variable, ask them to rotate
  it, purge it from the file/commit, continue only after rotation.
- `.env` must stay gitignored. Before every commit you make: `git diff --cached --name-only` must not list `.env`.
