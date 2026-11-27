ROLE: FULLSTACK (Backend + Frontend + Security) · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp8-facilities — Nearest Bed & Ambulance control-room view (ADR-0018)
SKILLS: production-standards, backend-engineering, frontend-engineering, property-based-testing, security-review, verification-before-completion
READ FIRST: docs/architecture.md (ADR-0018) · docs/contracts-phase2.md (§2.10 Facilities) ·
  apps/api/migrations/versions/0002_phase2_plans.py · apps/api/app/adapters/db/models.py ·
  apps/web/src/features/risk-map/ (MapLibre offline styling pattern).
DEPENDS ON: version-onsite-final baseline (WP10 merged).

OWNED PATHS
- Offline snapshot fetcher & committed ODbL dataset:
  - scripts/fetch_hospitals.py (Overpass query while online -> apps/api/data/hospitals.geojson with snapshot_date,
    ODbL attribution, and OSM-verified phone tags only)
  - apps/api/data/hospitals.geojson
- Database migration & seed:
  - apps/api/migrations/versions/0003_facilities.py (hospitals, bed_updates, ambulance_requests; zero patient PII)
  - apps/api/app/adapters/db/models.py (ORM models for the 3 tables)
  - apps/api/scripts/seed.py (seed hospitals from hospitals.geojson + labelled DEMO bed counts, including a mix of
    fresh <= 6 h, stale > 6 h, and full 0-bed demo rows so all 3 ranking tiers are demonstrable immediately)
- Pure shared maths (zero FastAPI/ORM/network imports):
  - apps/api/app/shared/facilities.py (Haversine km, straight-line ETA estimate, 3-tier ranking, strict phone/tel:
    sanitiser)
- Ports, adapters & vertical slice:
  - apps/api/app/ports/facilities.py
  - apps/api/app/adapters/db/facilities_repo.py
  - apps/api/app/features/facilities/{__init__,schemas,service,deps,router}.py
  - apps/api/app/main.py (mount facilities_router, add facilities readiness check)
- Contracts & generated types:
  - contracts/openapi.json (`npm run contracts`)
  - apps/web/src/lib/api/schema.d.ts (`npm run web:types`)
- Web vertical slice (`apps/web/src/features/nearest-bed/`):
  - ranking.ts (client-side Haversine + 3-tier ranking + tel: guard — exact mirror of shared/facilities.py)
  - api.ts (TanStack Query hooks for GET hospitals, POST beds/{id}, GET/POST ambulance-requests)
  - NearestBedMap.tsx (MapLibre GL: OSM/Carto tiles online, pure GeoJSON-only vector canvas offline — ZERO external
    tile requests when offline)
  - NearestBedView.tsx (consented geolocation with 5 s timeout -> city/ward picker fallback; ranked hospital cards
    with free beds, data age, DEMO label, city forecast badge, verified tel: links, always-present Call 999;
    control-room ambulance request log; manager bed-board update form; EN/BN; 375 px responsive; zero Lime; WCAG AA)
  - Wire tab `nearest-bed` into Dashboard (`apps/web/src/app/dashboard/page.tsx`, `views.ts`, `i18n.ts`)
- Tests:
  - apps/api/tests/shared/test_facilities.py (F1–F3 hand-solved ranking, Hypothesis brute-force equivalence, tel:
    sanitiser red-team cases)
  - apps/api/tests/features/test_facilities_api.py (GET hospitals, manager role 403 vs 200 bed update, ambulance log
    with extra-field PII rejection 422, no GPS in logs, HTML/control-char red-team, offline socket guard)
  - apps/web/e2e/nearest-bed.spec.ts + offline.spec.ts (geolocation Dhaka, Chattogram, denied -> fallback picker,
    offline GeoJSON-only map, manager bed update, Call 999, 375 px mobile, zero Lime, WCAG 2.2 AA)

---

HAND-SOLVED RANKING EXAMPLES (ADR-0018)

Distance uses Haversine ($R_E = 6371.0\text{ km}$). Straight-line ETA estimate = `ceil(distance_km / 18 * 60 + 5)` min
(always labelled `"estimate"`). Stale threshold = `age_hours > 6.0` (so `6.0` is fresh; `6.01` is stale).
Reference user coordinates: `(23.7500, 90.3900)`.
Three hospitals due north along longitude `90.3900`:
- `H1`: `(23.7590, 90.3900)` → `1.00 km`, ETA `9 min` (estimate)
- `H2`: `(23.7770, 90.3900)` → `3.002 km`, ETA `16 min` (estimate)
- `H3`: `(23.7950, 90.3900)` → `5.00 km`, ETA `22 min` (estimate)

| ID | Inputs (hospital: km, city, free_beds, age_hours) | Rule applied | Expected ranking & flags |
|---|---|---|---|
| **F1** | User city `Dhaka South`. `H1`: 1.00 km, DSCC, `free=0`, age `1.0 h`; `H2`: 3.00 km, DSCC, `free=4`, age `9.0 h`; `H3`: 5.00 km, DSCC, `free=2`, age `2.0 h` | Tier 1 (fresh `free ≥ 1` & `age ≤ 6 h`) beats closer Tier 2 (stale) and closer Tier 3 (full) | **`[H3, H2, H1]`** — `H3` tier 1 (`fresh`), `H2` tier 2 (`stale = true`), `H1` tier 3 (`full`) |
| **F2** | User city `Dhaka South`. `H1`: 1.00 km, DSCC, `free=0`, age `0.5 h`; `H2`: 3.00 km, DSCC, `free=3`, age `8.0 h`; `H3`: 5.00 km, DSCC, `free=6`, age `7.0 h` | No Tier 1 hospital → nearest Tier 2 (`free ≥ 1`, stale flagged) wins over closer Tier 3 (full) | **`[H2, H3, H1]`** — `H2` #1 (`tier 2`, `stale = true`), `H3` #2 (`tier 2`, `stale = true`), `H1` #3 (`tier 3`) |
| **F3** | User city `Dhaka South`. `H1`: 1.00 km, `Dhaka North`, `free=0`, age `1.0 h`; `H2`: 3.00 km, `Dhaka South`, `free=0`, age `1.0 h`; `H3`: 5.00 km, `Dhaka South`, `free=0`, age `2.0 h` (plus boundary check: `age = 6.0 h` is Tier 1, `age = 6.01 h` is Tier 2) | All full → nearest same-city alternative (`Dhaka South`) comes before closer out-of-city full hospital | **`[H2, H3, H1]`** — `H2` #1 (`tier 3`, city alternative), `H3` #2 (`tier 3`), `H1` #3 (`tier 3`, other city) |

---

ACCEPTANCE CRITERIA (Given / When / Then)

- **AC-WP8-1 (OSM ODbL snapshot & verified phones):**
  Given `scripts/fetch_hospitals.py` is run online,
  When `apps/api/data/hospitals.geojson` is written and seeded into SQLite via Alembic `0003_facilities`,
  Then all 5 cities (`Dhaka North`, `Dhaka South`, `Chattogram`, `Gazipur`, `Narayanganj`) are represented with real
  coordinates, `snapshot_date`, `"© OpenStreetMap contributors · ODbL 1.0"` attribution, verified OSM phone numbers
  only (empty/absent tags stored as `null`), and `npm run db:check` passes `upgrade → check → downgrade → upgrade`.

- **AC-WP8-2 (Client-side ranking & zero location leakage):**
  Given a user grants geolocation (5 s timeout) or selects a city/ward fallback,
  When the Nearest Bed view ranks hospitals,
  Then Haversine distances, straight-line ETA `"estimate"` labels, and 3-tier rankings execute strictly client-side,
  matching F1–F3 and a brute-force Hypothesis property test, while ZERO HTTP requests or API logs contain user
  latitude/longitude coordinates.

- **AC-WP8-3 (Demo bed labelling & manager role enforcement):**
  Given seeded demo beds (`data_source = "demo"`),
  When any user loads `GET /api/v1/facilities/hospitals` or opens the UI,
  Then demo bed counts are explicitly labelled `"Demo bed data"` / `"ডেমো শয্যা তথ্য"`; calling
  `POST /api/v1/facilities/beds/{id}` without `X-Facility-Role: manager` returns `403`, and calling with manager role
  updates `free_beds`, writes `bed_updates`, and flips `data_source` to `"board"` with `age_hours ≈ 0`.

- **AC-WP8-4 (Zero-PII ambulance coordination log & Call 999):**
  Given an emergency dispatcher logs an ambulance request via `POST /api/v1/facilities/ambulance-requests`,
  When valid `{hospital_id, city, severity, beds_requested, dispatcher_note}` is posted,
  Then it persists in `ambulance_requests` (201) and appears in the request log; any extra PII keys (`patient_name`,
  `patient_phone`, `nid`, `lat`, `lon`) are rejected with `422`; and an always-present **Call 999** (`tel:999`) link is
  rendered prominently in both EN and BN.

- **AC-WP8-5 (Offline GeoJSON-only map & zero external requests):**
  Given `ABHAS_OFFLINE=1` or all non-localhost requests aborted in Playwright,
  When the Nearest Bed tab loads,
  Then the hospital list, ranking, request log, manager bed-board form, and GeoJSON-only MapLibre map all render cleanly
  with zero external tile requests, zero console errors, and zero page errors.

- **AC-WP8-6 (Bilingual, mobile 375 px, WCAG 2.2 AA & Zero Lime):**
  Given EN and BN language modes at desktop (1280×800) and mobile (375×812) viewports,
  When audited in Playwright,
  Then no horizontal page overflow occurs at 375 px, zero Lime (`#D4F53C`) exists in `[data-view="data"]`, and axe-core
  reports 0 WCAG 2.2 AA violations.

---

PRIVACY & SECURITY / RED-TEAM REQUIREMENTS
1. **No user location on the wire or in logs:** `GET /api/v1/facilities/hospitals` and
   `POST /api/v1/facilities/ambulance-requests` accept NO `lat`/`lon` query/body fields (`extra="forbid"`), and unit/API
   tests capture `abhas.http` logs asserting zero coordinate strings appear.
2. **No patient personal data:** `ambulance_requests` schema and Pydantic model strictly forbid patient identifiers.
3. **`tel:` URI sanitisation:** Only characters in `[+0-9()\-\s]` with 6–24 chars and at least 3 digits are accepted for
   facility phones; `javascript:alert(1)`, `tel:999;evil`, CRLF, and HTML tags are rejected (`tel_href = null`).
4. **Escaping & control-char rejection:** `dispatcher_note` and bed-update `note` reject ASCII control & Unicode bidi
   override characters (`\x00-\x1f`, `\u202a-\u202e`, `\u2066-\u2069`) with `422`; React/HTML rendering escapes all
   OSM facility names and notes safely (tested with `<script>x</script>`).
5. **Manager role check:** `POST /api/v1/facilities/beds/{id}` returns `403` when `X-Facility-Role != "manager"` or
   when `FACILITY_MANAGER_TOKEN` is configured and `X-Facility-Token` does not constant-time match.

---

PLAYWRIGHT TEST CASES
1. **Geolocation Dhaka (`23.7500, 90.3900`):** `context.setGeolocation` + grant `geolocation` → nearest Dhaka hospital
   ranked #1 with fresh/stale badge, km distance, straight-line ETA `"estimate"`, Demo badge, city forecast tier, Call
   999, zero network calls containing `23.75`.
2. **Geolocation Chattogram (`22.3569, 91.7832`):** `context.setGeolocation` → nearest Chattogram hospital ranked #1.
3. **Geolocation denied:** clear geolocation permission → falls back cleanly to city/ward picker, still ranks hospitals
   and allows logging an ambulance request + manager bed-board update.
4. **Offline mode (`offline.spec.ts`):** all non-localhost requests aborted → Nearest Bed tab loads with local GeoJSON
   map (zero external tile fetches), ranks hospitals, logs request, passes zero console/page errors.
5. **Mobile 375 px + EN/BN + Zero Lime + WCAG 2.2 AA:** verify 375×812 layout has no overflow, Bangla toggle translates
   headings/labels/badges, zero Lime, 0 axe violations.

GATE TO PASS: `npm run ci` · `node .orca-team/tools/gates.mjs slices contract migrations offline e2e`
