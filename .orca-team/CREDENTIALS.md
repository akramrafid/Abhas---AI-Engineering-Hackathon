# CREDENTIALS.md — what the project needs (names only, NEVER values)

## Status
Requested 2026-11-17 17:45. Waiting for LLM_API_KEY. Everything else is local.

## Needed
| Variable | Service | Needed for | Required? | Local / mock alternative | Status |
|---|---|---|---|---|---|
| LLM_API_KEY, LLM_MODEL, LLM_BASE_URL | OpenAI-compatible chat API | KB answers, triage | yes | `LLM_MOCK=1` deterministic fakes | MISSING |
| LLM_PRICE_IN/OUT_PER_MTOK | — | cost logs | no | gpt-4o-mini defaults | LOCAL |
| EMBEDDING_PROVIDER, EMBEDDING_MODEL | fastembed multilingual MiniLM (CPU) | retrieval | yes | — | LOCAL |
| QDRANT_PATH / QDRANT_COLLECTION | Qdrant local mode | vector search | yes | — | LOCAL |
| DATABASE_URL | SQLite | triage history | yes | — | LOCAL |

## How the human provides them
1. Open `E:\AI Engineering Hackathon\.env`.
2. Fill the values marked MISSING. Save.
3. Tell LEAD: `creds done` (or `skip <VAR> → mock`).
