# Handoff — WP8: Nearest Bed & Ambulance Control-Room View (ADR-0018)

- **Branch:** `refs/heads/version-onsite-final`
- **Role / Model:** BUILDER WP8 · Gemini 4 Neon xHigh
- **Spec:** `.orca-team/specs/p2-wp8-facilities.md`

## What Changed

### 1. Real OpenStreetMap Snapshot (ODbL, Verified Phones Only)
- `scripts/fetch_hospitals.py` queries Overpass API for `amenity=hospital` / `healthcare=hospital` across all 5 Abhas cities (`Dhaka North`, `Dhaka South`, `Chattogram`, `Gazipur`, `Narayanganj`) and commits `apps/api/data/hospitals.geojson` with `snapshot_date`, `"© OpenStreetMap contributors · ODbL 1.0"`, and verified OSM phone tags only (`null` otherwise).

### 2. Database Migration & Seed (Alembic `0003_facilities`, Zero Patient PII)
- `apps/api/migrations/versions/0003_facilities.py` adds reversible tables `hospitals`, `bed_updates`, and `ambulance_requests` (zero patient personal-data columns; checked by `npm run db:check` `upgrade → check → downgrade → upgrade`).
- `apps/api/app/adapters/db/facilities_repo.py` + `apps/api/app/adapters/db/factory.py` + `apps/api/scripts/seed.py` seed all OSM hospitals idempotently with deterministic clearly-labelled `"demo"` bed data (including fresh `≤ 6 h`, stale `> 6 h`, and full `0`-bed demo rows per city).

### 3. Pure Shared Ranking & Facilities Vertical Slice
- `apps/api/app/shared/facilities.py`: Haversine km, straight-line ETA estimate (`ceil(km / 18 * 60 + 5)`), 3-tier ranking matching F1–F3, strict phone/`tel:` URI sanitiser, and control/bidi guard.
- `apps/api/app/features/facilities/`:
  - `GET /api/v1/facilities/hospitals?city=` (offline, ODbL attribution, DEMO disclaimer, city-level forecast tier badges, zero user GPS parameters).
  - `POST /api/v1/facilities/beds/{hospital_id}` (manager role required via `X-Facility-Role: manager` + optional `FACILITY_MANAGER_TOKEN`; `403` otherwise; updates `free_beds`/`total_beds`, logs `bed_updates`, flips `data_source` to `"board"`).
  - `POST /api/v1/facilities/ambulance-requests` & `GET /api/v1/facilities/ambulance-requests` (control-room coordination log; `extra="forbid"` rejects patient PII or user GPS with `422`).
- Wired into `apps/api/app/main.py` (`/readyz` `facilities` check + CORS headers), `contracts/openapi.json`, and `apps/web/src/lib/api/schema.d.ts`.

### 4. Web Feature `apps/web/src/features/nearest-bed/`
- `ranking.ts`: browser-only Haversine distance, straight-line ETA `"estimate"`, strict `tel:` guard, and 3-tier ranking (user GPS never leaves the browser).
- `NearestBedMap.tsx`: MapLibre GL with OSM tiles online and pure local GeoJSON-only canvas offline (zero external tiles offline).
- `NearestBedView.tsx`: consented geolocation (5 s timeout) falling back cleanly to city/ward picker; ranked hospital cards with free beds, age, DEMO/board label, city forecast badge, verified `tel:` links, always-present **Call 999**; ambulance request log; manager bed-board form; full EN/BN; 375 px mobile responsive; zero Lime; WCAG 2.2 AA.

## Tests Added
- `apps/api/tests/shared/test_facilities.py` (F1–F3 hand-solved ranking, 6.0h boundary, Hypothesis brute-force equivalence, red-team `tel:` sanitiser & control-char checks)
- `apps/api/tests/features/test_facilities_api.py` (offline socket guard, DEMO labelling, manager role 403 vs 200, PII/GPS 422 rejection, zero GPS in `abhas.http` logs)
- `apps/web/e2e/nearest-bed.spec.ts` + `apps/web/e2e/offline.spec.ts` (`setGeolocation` Dhaka, Chattogram, denied → picker fallback, ambulance log, manager bed board, strict offline GeoJSON map, 375 px mobile BN, zero Lime, WCAG 2.2 AA)
