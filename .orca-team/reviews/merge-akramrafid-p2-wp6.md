# Merge Review — `akramrafid/p2-wp6` (integration check — cross-family review by Opus at the end)

- **Branch:** `akramrafid/p2-wp6` (`e36e81a`) → `version-onsite-final`
- **Reviewer:** INTEGRATOR · Gemini 4 Neon (XHigh) *(integration check — cross-family review by Opus at the end)*
- **Date:** 2026-11-27
- **Spec:** `.orca-team/specs/p2-wp6.md` · ADR-0015 · ADR-0016 · `docs/contracts-phase2.md` §2.6, §2.7, §6, §7

## Checklist
- **Contract match:** `POST /api/v1/plans`, `GET /api/v1/plans`, `GET /api/v1/plans/compare` match `docs/contracts-phase2.md` §2.6 (`PlanRecord`, `PlanList`, `PlanComparison`, `404 unknown-plan`, append-only `405` on PUT/DELETE, `RunMeta.offline` live via `app.core.offline.is_offline`). OpenAPI contract matches `contracts/openapi.json` (`22/22` ops, `2270/2270` Schemathesis checks).
- **Owned paths only:** Strictly within WP6 owned paths (`core/offline.py`, `core/run_meta.py`, external adapters `{openmeteo,llm,gemini_chat}.py`, `adapters/db/plan_store.py`, `features/plans/**`, `tests/conftest.py`, `tests/test_offline.py`, `public/images/testimonials/**`, `testimonial.tsx`, `next.config.ts`, `auth-config.ts`, `ward-map/**`, `playwright.config.ts`, `e2e/offline.spec.ts`, `package.json`, `README.md`, `docs/model-card.md`, `.orca-team/handoff/p2-wp6.md`) plus minimal 2-hunk update to `tests/test_p2_contracts.py` replacing WP0 hardcoded stub UUIDs with created plan IDs.
- **Tests present & invariants proven:**
  - WP6-1: `ABHAS_OFFLINE=1` + stdlib socket guard (`tests/conftest.py`) passes `9/9` `-m offline` + `156/156` full API suite with zero non-loopback connections.
  - WP6-2: Playwright `--project=offline` (`3/3` green) with all non-localhost requests aborted, zero external requests, zero console/page errors, self-hosted portraits, and bundled GeoJSON schematic map fallback (`data-map-offline="true"`).
  - WP6-3: Startup makes zero network calls; background probe (2 s connect timeout, 20 s interval) flips offline within ≤ 30 s; 3-failure/60 s half-open fake-clock circuit breaker verified across all 3 external adapters.
  - WP6-4: SQLite `SqlPlanStore` round-trip, newest-first list, kind/limit filters, cross-kind & same-kind compare deltas, `404 unknown-plan`, append-only verified.
  - WP6-5: `README.md` discloses AI assistants, all external services, and offline guarantee (PDF canary ignored); `docs/model-card.md` documents Phase 2 assumptions and mandatory DGHS replacement caveat.
- **Gates:** `npm run offline:check`, `gates.mjs migrations slices ci contract` all PASS.

Verdict: MERGE
