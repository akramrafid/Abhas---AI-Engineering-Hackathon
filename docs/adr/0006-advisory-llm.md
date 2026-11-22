# ADR-0006: Deterministic advisory by default; optional Claude Haiku 5.5 through the LLM port
## Status
Accepted · 2026-11-21
## Context
Officers brief field teams in English or Bangla. An LLM can phrase this, but the app must run with zero keys,
must never invent numbers, and must keep cost bounded (R6). The advisory is a COULD.
## Decision
`POST /api/v1/advisory` returns a deterministic template advisory (EN/BN) built from the forecast. When
`ANTHROPIC_API_KEY` is set, the LLM adapter (Claude Haiku 5.5, `claude-haiku-5-5`) returns structured JSON;
a validator rejects any number not present in the input; max 400 output tokens; cached by (ward, week, horizon,
model version, language); calls stop at the $1/day budget; every call is traced to `llm_traces`.
## Rejected options
- **LLM always on** — requires a key for the core demo; cost and latency for no rubric gain.
- **RAG over guidelines** — no document corpus in the task; adds a vector store for nothing.
## Consequences
The demo never depends on an external key. An LLM eval judge must be from another family than the generator.
