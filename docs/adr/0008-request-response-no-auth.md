# ADR-0008: Plain request/response JSON; no authentication this round
## Status
Accepted · 2026-11-21
## Context
Forecasts are computed in milliseconds from cached features; there is no token streaming. The app runs on one
officer's machine for the demo. `/api/v1/ops` exposes counters only.
## Decision
JSON request/response for every route, RFC 9457 problem+json errors, per-IP rate limit, CORS limited to the
local web origin. No user accounts. `/api/v1/ops` is open on localhost when `OPS_TOKEN` is unset and requires
`X-Ops-Token` when it is set.
## Rejected options
- **SSE streaming** — no long-running generation to stream; adds client complexity.
- **OAuth / user accounts** — out of scope for a single-office local tool; Stage 2 adds them.
## Consequences
Simple contract tests and load tests. Before any public deploy, auth and the ops token become mandatory.
