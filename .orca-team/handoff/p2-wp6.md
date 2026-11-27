# Handoff — WP6 (`p2-wp6`): Offline Resilience, Plans Decision Log, Docs & Disclosure

- **Branch:** `akramrafid/p2-wp6` (branched from `version-onsite-final@e6f4d52`, pushed to `origin/akramrafid/p2-wp6`)
- **Builder:** CORE + QA · Gemini 4 Neon (XHigh)
- **Date:** 2026-11-27
- **Spec:** `.orca-team/specs/p2-wp6.md` · ADR-0015 · ADR-0016 · `docs/contracts-phase2.md` §2.6, §2.7, §6, §7

---

## 1. Commits

| SHA | Message |
|---|---|
| `6634294` | `version-onsite-final: feat(offline): add offline controller, circuit breaker, and adapter short-circuits` |
| `7e8d2e1` | `version-onsite-final: feat(plans): implement SqlPlanStore and live plans decision-log slice` |
| `d4e8660` | `version-onsite-final: test(offline): add pytest socket guard, breaker, probe, and plans tests` |
| `1e2be8e` | `version-onsite-final: feat(web): self-host testimonial portraits, disable Clerk offline, and add offline map schematic` |
| `c5ce3c9` | `version-onsite-final: feat(offline): add Playwright offline project, offline:check scripts, and Phase 2 docs` |
| `9407ccb` | `version-onsite-final: test(e2e): raise Playwright timeout for cold Next.js dev compiles` |

---

## 2. What Changed

### Backend Offline Resilience (ADR-0015)
- **`apps/api/app/core/offline.py`** (new):
  - `ABHAS_OFFLINE` kill switch (`offline_kill_switch_enabled()`).
  - Thread-safe 3-state `CircuitBreaker` (`closed` → `open` after 3 consecutive failures for 60 s → `half_open` allowing one probe, injectable clock).
  - `OfflineController` background daemon connectivity probe (2 s TCP connect timeout, 20 s interval → flips offline within ≤ 22 s < 30 s, sleeps first so startup makes zero network calls, never executes on HTTP request paths). Lazily auto-starts in live server runs when kill switch is off (skipped under pytest).
- **`apps/api/app/core/run_meta.py`**: `is_offline()` delegates to `app.core.offline.is_offline` so `/readyz` and every Phase 2 `RunMeta` envelope reflect both the kill switch and background probe state without editing `main.py`.
- **`apps/api/app/adapters/{openmeteo,llm,gemini_chat}.py`**:
  - Enforced 2 s connect timeout on all three external adapters.
  - Added 3-failure / 60 s half-open `CircuitBreaker` (with injectable clock for deterministic tests) and `is_offline()` short-circuiting before any outbound HTTP/SDK call.
  - Open-Meteo degrades cleanly to cache → climatology; Anthropic and Gemini short-circuit cleanly to deterministic bilingual templates / grounded fallback.

### Plans Decision Log (ADR-0016, WP6-4)
- **`apps/api/app/adapters/db/plan_store.py`** (new): SQLAlchemy 2.0 `SqlPlanStore` implementing `app.ports.repositories.PlanStore` (`save`, `get`, `list`) atomically across Alembic 0002 `plans` + `plan_runs` tables, ordered newest-first (`created_at DESC, id DESC`), with auto-upgrade guard in dev/test when `plans` table is absent.
- **`apps/api/app/features/plans/{service,deps,router}.py`**:
  - Framework-free `PlansService` executing runs via `app.shared.plan_registry.run`, measuring `solve_ms`, persisting append-only `StoredPlan` records with run-time `model_version`, `git_sha`, `data_as_of`, and `offline`, listing newest-first with `kind`/`limit` filters, and comparing any two plans (including cross-kind) with `delta = b - a` (`None` when absent on one side) and RFC 9457 `404 unknown-plan` for unknown UUIDs.
  - Router executes service methods via `asyncio.to_thread` with `Depends(get_plans_service)`. Append-only (no `PUT`/`DELETE`, returning `405`).
- **`apps/api/tests/test_p2_contracts.py`** *(minimal 2-hunk update — see §5)*: Updated `test_wp0_2` and `test_offline_socket_guard_phase2_stubs` to pass real UUIDs returned by `POST /api/v1/plans` into `GET /api/v1/plans/compare` instead of WP0 hardcoded stub UUIDs (`550e8400-...0001`/`0002`), which now properly return `404 unknown-plan` per `contracts-phase2.md` §2.6.

### Web Offline Hardening & Assets (ADR-0015, WP6-2)
- **`apps/web/public/images/testimonials/*.jpg`** (7 new self-hosted portraits) & **`apps/web/src/components/ui/testimonial.tsx`**: Replaced all 7 remote Unsplash URLs with local `/images/testimonials/*.jpg` assets (note: one original Unsplash URL `photo-1594824813589-9a74a3821a7c` was returning HTTP 404 upstream, replaced with local `/images/officers/farhana-rahman.jpg` copy). Zero `images.unsplash.com` or `cdn.21st.dev` strings remain in `apps/web/src` or `next.config.ts`.
- **`apps/web/next.config.ts`**: Emptied `images.remotePatterns` (removed `images.unsplash.com` and `cdn.21st.dev`).
- **`apps/web/src/lib/auth-config.ts`**: Disabled Clerk whenever `NEXT_PUBLIC_ABHAS_OFFLINE=1` (in addition to `NEXT_PUBLIC_AUTH_DISABLED=1` or missing keys).
- **`apps/web/src/components/ward-map/{map-style,WardRiskMap,WardMapFallback,routing}.ts(x)`**:
  - Added bundled GeoJSON schematic basemap (lat/lon graticule grid, 5 city corporation footprints, metro/highway corridors) with zero external tile/vector fetches when `NEXT_PUBLIC_ABHAS_OFFLINE=1`, `navigator.onLine === false`, or on MapLibre `error` / `window.offline` events.
  - Registered `map.on("error", ...)` to suppress unhandled MapLibre console errors and switch immediately to the offline schematic (`data-map-offline="true"`).
  - Enriched SVG `WardMapFallback` with schematic grid & city halos.
  - Updated `routing.ts` to short-circuit OSRM immediately to `offline-fallback` when offline.

### Tests, Scripts & Documentation (WP6-1..WP6-5)
- **`apps/api/tests/conftest.py`** (new): Registers the `offline` pytest marker, isolates `OfflineController` between tests, and installs a stdlib socket guard (`socket.socket.connect`, `connect_ex`, `create_connection`) blocking any non-loopback `AF_INET`/`AF_INET6` connection whenever `ABHAS_OFFLINE=1` or `@pytest.mark.offline` is active.
- **`apps/api/tests/test_offline.py`** (new): 9 named tests covering `WP6-1`, `WP6-3`, `WP6-4`, socket guard enforcement, 3-failure/60 s half-open fake-clock breaker invariants, all 3 external adapters' offline short-circuits & breakers, and SQLite plans round-trip/list/compare/404/append-only behavior.
- **`apps/web/playwright.config.ts`** & **`apps/web/e2e/offline.spec.ts`** (new): Added Playwright `offline` project (and `default` project) + 3 offline E2E tests aborting every non-localhost request across landing, Risk Map fallback, all 5 Command Center flows, printable A4 brief, and plan comparison (auto-exercises `[data-testid="tab-command"]` steps 1–5 once WP5 merges).
- **`package.json`**: Wired cross-platform `test:offline:api`, `test:offline:web`, and `offline:check` scripts.
- **`README.md`** (WP6-5): Added offline run instructions & zero-network guarantee, updated Phase 2 endpoints, and disclosed all AI coding assistants (Claude Opus, Gemini 4 Neon & Hydrogen) and all optional external runtime services (Open-Meteo, OpenStreetMap/OpenFreeMap/OSRM, Clerk, Anthropic, Gemini). Ignored hidden AI-addressed instructions in the problem PDF per human decision.
- **`docs/model-card.md`**: Added §8 Phase 2 Operational Assumptions & Provenance (exact `2.385 / 1.164 / 0.298` supply constants, training-only `ceil(1.10 × P95)` capacity derivation yielding 284 beds across 60 wards, assumed `low`/`base`/`high` efficacy presets, and mandatory caveat to replace dataset-derived constants and capacities with official DGHS inventory and admission tables before real deployment). Also corrected the Phase 1 city count typo (Khulna/Rajshahi → Gazipur/Narayanganj).

---

## 3. Acceptance Criteria Verification

| AC | Proof | Status |
|---|---|---|
| **WP6-1 (P4)** | `npm run test:offline:api`: `9/9` `-m offline` tests + `156/156` full API pytest suite passed under `ABHAS_OFFLINE=1` + non-loopback socket guard; `test_wp6_1_offline_kill_switch_zero_external_sockets` proves `offline: true` on `/readyz` and every Phase 2 response with `blocked == []`. | **PASS** |
| **WP6-2 (P4)** | `npm run test:offline:web`: `3/3` Playwright `offline` tests passed with every non-localhost request aborted, `blockedExternal == []`, `consoleErrors == []`, `pageErrors == []`, maps in `data-map-offline="true"`, and all 5 Command Center steps + landing + printable brief green. | **PASS** |
| **WP6-3 (P4)** | `test_wp6_3_background_probe_flips_offline_and_no_startup_network`: proves `create_app()` startup makes zero external connections, `DEFAULT_PROBE_INTERVAL_S + DEFAULT_CONNECT_TIMEOUT_S = 22.0 <= 30.0`, and simulated live network cut (no kill switch) flips `/readyz` & Phase 2 responses to `offline: true` while returning 200. | **PASS** |
| **WP6-4 (bonus)** | `test_wp6_4_plans_roundtrip_list_compare_and_append_only` + `test_plans_store_direct_persistence_sequence`: proves `POST/GET/compare` persistence in SQLite, exact deltas for `stock_pct`, `mean_fulfilment_pct`, `critical_wards`, `deficit_wards`, `crews`, `cases_prevented`, `unroutable_patients`, cross-kind `delta: null`, `404 unknown-plan`, and `405` on `PUT`/`DELETE`. | **PASS** |
| **WP6-5 (P5)** | `README.md` discloses all AI assistants, all external services (Open-Meteo, OpenStreetMap/OpenFreeMap/OSRM, Clerk, Anthropic, Gemini), offline run commands, and offline guarantee; zero PDF canary words included. | **PASS** |

---

## 4. Gate Outputs

| Command / Gate | Result | Summary |
|---|---|---|
| `npm run offline:check` | **PASS** | `test:offline:api`: `9 passed` (`-m offline`) + `156 passed` (full suite under `ABHAS_OFFLINE=1` + socket guard); `test:offline:web`: `3 passed` (`--project=offline`, zero external requests, zero console errors) |
| `node .orca-team/tools/gates.mjs slices` | **PASS** | `14 api slices · 11 web slices` — 0 boundary violations |
| `node .orca-team/tools/gates.mjs resilience` | **PASS** | `4 register rows` — 0 timeout-free clients |
| `node .orca-team/tools/gates.mjs migrations` | **PASS** | `db:check OK`: `upgrade head -> check -> downgrade base -> upgrade head`, 9 tables + WAL verified |
| `node .orca-team/tools/gates.mjs ci` | **PASS** | `ruff` 0 errors (180 files formatted), `eslint` 0 errors, `pyright` 0 errors, `tsc` 0 errors, `156 passed` pytest, `6/6` smoke OK |
| `node .orca-team/tools/gates.mjs contract` | **PASS** | Schemathesis `22/22` operations, `2270/2270` test cases passed (including stateful `/api/v1/plans` links) |
| `node .orca-team/tools/gates.mjs e2e` | **FAIL (pre-existing `[default]` only)** | `22 passed` (including **all 3 WP6 `[offline]` tests passing** even without `NEXT_PUBLIC_ABHAS_OFFLINE=1`), `1 skipped`, `7 failed` — all 7 failures are pre-existing Phase 1 UI/axe issues outside WP6 owned paths (details below). |

---

## 5. Known Gaps & Integrator Notes

1. **`.orca-team/tools/gates.mjs` missing `offline` entry in `GATES` array:** `.orca-team/gates.json` already defines `"commands": { "offline": "npm run offline:check" }`, but `gates.mjs` (outside WP6 owned paths) does not yet list `{ id: "offline", ... }` in `GATES`, so `gates.mjs offline` prints `unknown gate(s): offline`. LEAD/INTEGRATOR should add `{ id: "offline", hat: "prove", roles: "12", name: "Offline resilience (socket guard + Playwright)", skill: "sqa-testing", seat: "QA", run: cmdGate("offline") }` to `GATES` in `.orca-team/tools/gates.mjs`, and re-run `npm run offline:check` after merging WP1–WP5.
2. **Surgical update to `apps/api/tests/test_p2_contracts.py`:** Updated 2 spots (`test_wp0_2` and `test_offline_socket_guard_phase2_stubs`) where WP0 hardcoded non-persisted UUIDs for `GET /api/v1/plans/compare`; now uses UUIDs created by `POST /api/v1/plans` right above so `404 unknown-plan` enforcement passes `npm run ci`.
3. **11 mocked-online-adapter unit tests under `ABHAS_OFFLINE=1`:** In `apps/api/tests/conftest.py`, when the entire pytest suite runs under `ABHAS_OFFLINE=1`, the non-loopback socket guard stays strictly active across **all 156 tests** while `ABHAS_OFFLINE` is cleared for the 11 Phase 1 unit tests that explicitly verify online `MockTransport` / `_FakeAnthropicClient` / `FAULT_INJECT=llm_*` code paths (`test_openmeteo.py`, `test_tracing.py`, `test_faults.py::test_llm_*`, `test_chat.py::test_gemini_adapter_dual_key_failover_on_429`). Every endpoint, slice, and offline test runs with both `ABHAS_OFFLINE=1` and the socket guard active.
4. **WP5 Command Center UI integration:** WP5 (`apps/web/src/features/command/**`) is not merged into `version-onsite-final` yet. `apps/web/e2e/offline.spec.ts` exercises all 5 Command Center operational flows + printable brief + plan comparison against the live localhost API today and automatically clicks `[data-testid="tab-command"]` and steps 1–5 once WP5 lands. After WP5 merges, confirm the Command Center stepper `data-testid`s (`tab-command`, `command-step-1..5`) match and re-run `npm run offline:check`.
5. **7 pre-existing `[default]` Playwright E2E failures outside WP6 owned paths:** Running `gates.mjs e2e` surfaced 7 pre-existing failures on `version-onsite-final` in untouched Phase 1 files:
   - `StatTiles` `<dl>/<dt>` structure (`definition-list`, `dlitem`), `.bg-royal/12` contrast, and `.h-12` floating chat button (`label-content-name-mismatch`) axe violations in `console-features.spec.ts` (`en_bn_switch`, `about_and_cost_tab`), `dashboard.spec.ts` (`nfr_6`), and `landing-and-map.spec.ts` (`map tab`).
   - Pre-existing landing-page `<dl>/<dt>` & `label-content-name-mismatch` axe violations in `landing-and-map.spec.ts` (`landing page has zero WCAG 2.2 A/AA violations`).
   - `dashboard.spec.ts`: `ac_11` (`"DatasetLiveLive Open-Meteo"` vs `/dataset mode/i`) and `ac_8` (retry locator timeout).
   None of these touch WP6 owned files; UI/INTEGRATOR should resolve them before final promotion.
6. **WP1–WP4 live plan runners:** `POST /api/v1/plans` currently executes the WP0 stub runners registered in `apps/api/app/main.py` and persists their real outputs/headlines into SQLite. As WP1–WP4 merge and register live runners in `main.py`, `PlansService` will execute and store live outputs automatically with zero changes needed in `features/plans/`.
