# ADR-0001: Modular monolith with vertical slices and ports & adapters
## Status
Accepted · 2026-11-21
## Context
Six AI workers build in parallel for 22 hours; every rubric line must be demoable from one local run. Workers
that share horizontal folders (`routes/`, `services/`) collide on the same files. Outside dependencies
(Open-Meteo, the model artifact, an optional LLM, the database) must be swappable for fakes so every slice is
testable offline and the app runs with zero keys.
## Decision
One FastAPI service and one Next.js app. Inside the API, one folder per capability in `app/features/<name>/`
(wards, lags, forecast incl. scenario, heatmap, validation, weather, advisory, ops) holding `schemas.py`
(contract, LEAD), `router.py` (thin), `service.py` (framework-free, depends on ports), `deps.py`. Logic used by
two or more slices lives in `app/shared/` (features.py, tiers.py, drivers.py). Ports are Python Protocols in
`app/ports/`; adapters in `app/adapters/`. The web app mirrors it with `apps/web/src/features/<name>/`.
`gates.mjs slices` fails a merge when a feature imports another feature or a service imports a framework/SDK.
## Rejected options
- **Layered Clean Architecture with shared `routes/ services/ repositories/` folders** — every worker edits the
  same folders; merge conflicts in a parallel swarm.
- **Microservices (separate model server, weather service)** — more processes to start in the 3-minute setup,
  network failure modes, no demo value.
- **Streamlit single script** — fastest to build but no path to the Stage-2 live system, no custom brand,
  no typed API contract for tests.
## Consequences
Slices can be built, reviewed and cut independently; contract tests run against `contracts/openapi.json`.
Cost: small duplication between slices is preferred over cross-slice imports. Revisit if a slice needs its own
scaling (Stage 2 batch scoring).
