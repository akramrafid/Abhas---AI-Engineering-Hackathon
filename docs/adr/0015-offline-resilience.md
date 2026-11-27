# ADR-0015: Offline-first: kill switch, auto-detection, timeouts, breakers and a provable offline check

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P4 (15 points): forecasting, optimisation, routing and dispatch templates run 100 % locally with zero crashes
when Wi-Fi and APIs are cut live. Weak "math defence" scores 8. Phase 1 already serves forecasts from the dataset with
Open-Meteo optional (ADR-0005).

## Decision
- **Kill switch** `ABHAS_OFFLINE=1` forces every adapter into offline mode. **Auto-detection**: a background probe
  (never on the request path, never at startup) marks the network down after one failed 2 s connect; the readiness
  payload and every Phase 2 response report `offline: true|false`.
- **Adapters**: 2 s connect timeout, circuit breaker (3 failures → open 60 s), then cache, then climatology. No network
  call at startup.
- **Core maths is pure**: `shared/supply.py`, `optimizer.py`, `routing.py`, `intervention.py` and the dispatch
  templates use NumPy/SciPy and local files only.
- **Web**: no external assets on any page; Unsplash images are self-hosted; when OpenStreetMap tiles are unreachable
  the map falls back to a bundled GeoJSON/schematic layer; Clerk is disabled when offline or without keys.
- **Proof**: `npm run offline:check` = a pytest socket guard (any non-loopback connect fails the test) over the API
  suite, plus a Playwright run with every non-localhost request aborted across all five modules. It is a gate
  (`offline` in gates.json).

## Rejected options
- **"Mostly offline" with a cloud LLM for notices** — rejected: puts an external API on the dispatch path.
- **Startup connectivity check** — rejected: a slow DNS failure would delay readiness during live judging.

## Consequences
Cutting the network during the demo changes one badge, not the numbers. The offline gate keeps it that way as code
changes.
