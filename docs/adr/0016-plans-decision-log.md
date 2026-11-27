# ADR-0016: Save every planning run as a plan, with a comparable decision log

## Status
Accepted · 2026-11-27 (Phase 2, bonus)

## Context
Public-sector users need to show what they decided and on which numbers. Judges award up to +10 for useful
operational features. Allocation, routing, simulation and dispatch are runs with inputs and outputs that can be stored.

## Decision
- `POST /api/v1/plans` executes one run (allocation | overflow | simulation | dispatch) and stores it: inputs, outputs,
  model version, git SHA, data-as-of date, timestamp, label. `GET /api/v1/plans` lists them; `GET /api/v1/plans/compare?a=&b=`
  returns both summaries and the differences in headline metrics (stock, fulfilment, critical deficits, crews, cases
  prevented, unroutable patients).
- Storage: Alembic 0002 tables `plans`, `plan_runs`, `dispatch_log` (see docs/data-model.md). Plans are append-only;
  no update or delete endpoint.

## Rejected options
- **Client-side history (localStorage)** — rejected: not auditable, lost per browser.
- **Full event sourcing** — rejected: more machinery than a decision log needs.

## Consequences
Every number in a dispatch notice can be traced to a saved run and a commit.
