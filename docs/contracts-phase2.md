# Phase 2 contract specification

_Owner: LEAD (architecture only). Implemented by Neon in WP0. Status: locked for WP0, 2026-11-27._

This document is the contract. Neon turns it into Pydantic schemas, stub routers, port Protocols, shared-module
signatures, an Alembic migration and gate entries in **WP0**, then runs `npm run contracts && npm run web:types`.
Nothing here is code to paste; JSON blocks are example data. The maths behind every field is in
`docs/algorithms-phase2.md`; the decisions are ADR-0009 to ADR-0016 in `docs/architecture.md`.

## 1. Conventions that apply to every Phase 2 endpoint

- Prefix `/api/v1`. JSON in, JSON out, except the brief (HTML).
- Request models use `extra="forbid"` and `allow_inf_nan=False`, like Phase 1.
- Errors are RFC 9457 `application/problem+json` through the existing `app/core/errors.py`:
  `422 validation-error` (field errors listed), `404 unknown-ward`, `404 unknown-plan`, `409 infeasible`
  (should not happen; returned only if the solver reports infeasibility after floor scaling), `429 rate-limited`,
  `503 not-ready` (model or data missing). No stack traces, file paths or secrets in any problem body.
- **Provenance envelope.** Every Phase 2 response model inherits `RunMeta`:

| Field | Type | Meaning |
|---|---|---|
| `model_version` | string | Forecast artefact version, e.g. `abhas-lgbm-1.1.2` |
| `git_sha` | string, `^([0-9a-f]{7,40}|unknown)$` | Commit of the running code. From env `ABHAS_GIT_SHA`, else `git rev-parse --short HEAD` read once at startup, else `unknown` |
| `data_as_of` | date | Last observed week used (2025-12-29 for the onsite dataset) |
| `offline` | bool | Kill switch set or network probe down (ADR-0015) |
| `generated_at` | datetime (UTC) | |

- **Where models live (slice rule).** The four request models (`AllocationRequest`, `OverflowRequest`,
  `SimulatorRequest` with `Deployment`, `DispatchRequest`) and the literals `Scope`, `EfficacyPreset`, `Channel`,
  `Lang` go in a LEAD-owned contract module **`app/core/command_requests.py`**, because the plans slice must validate
  all four without importing another feature. Each slice's `schemas.py` re-exports its own request and defines its
  responses. `RunMeta` goes in **`app/core/run_meta.py`**.
- **Running another slice's logic from plans** uses a runner registry, not imports: `shared/plan_registry.py`
  exposes `register_runner(kind, fn)` and `run(kind, request) -> (outputs_dict, headline)`. `main.py` (the
  composition root, allowed to import every slice) registers the four runners at startup.
- Literals reused from Phase 1 `app/core/types.py`: `City`, `WardId`, `Tier`, `Horizon` (1–4),
  `DatasetOriginWeek` (Monday, 2016-02-29…2025-12-29).

## 2. Endpoints

### 2.1 `POST /api/v1/allocation/plan` — constrained allocation (rubric P1; ADR-0009, 0010, 0011)

**Request `AllocationRequest`**

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| `scope` | `City` or `"all"` | | `"all"` | Each city is its own pool even when `all` |
| `origin_week` | DatasetOriginWeek | | required | |
| `h_start` | Horizon | 1–4 | 2 | |
| `h_end` | Horizon | 1–4, ≥ `h_start` | 4 | 422 if `h_end < h_start` |
| `stock_pct` | int | 30–100 | 100 | Available Regional Stock slider |
| `total_crews` | int | 0–300 | 0 | Spraying crews to assign |
| `service_level` | float or null | 0.50–0.99 | null | null = P80 saline and kits, P90 beds |
| `equity_floor_pct` | int | 0–50 | 20 | Minimum share of demand per ward |

**Response `AllocationResponse`** = RunMeta +

| Field | Type | Notes |
|---|---|---|
| `request` | AllocationRequest | Echo |
| `supply_ratios` | map resource → float | Per-case constants used (2.385, 1.164, 0.298) |
| `service_levels` | map resource → float | Effective quantiles |
| `crew_method` | `"greedy"` or `"greedy (approximate)"` | Approximate if marginals were not non-increasing |
| `wards` | list of `WardAllocation` | Sorted by city, then priority weight descending, then ward_id |
| `cities` | list of `CityAllocationSummary` | |
| `solve_ms` | float ≥ 0 | |

`WardAllocation`: `ward_id`, `city`, `tier` (peak in window), `expected_cases` (sum of means, ≥ 0),
`planned_cases` (window quantile for saline/kits, ≥ 0), `density_factor` (0.5–2.0), `priority_weight` (> 0),
`saline_bags` / `diagnostic_kits` (window total at P80) / `hospital_beds` (peak-week beds at P90, matching overflow for single-week windows) (each a `ResourceLine`), `crews` (int ≥ 0),
`deficit_level` (`none` | `deficit` | `critical`), `deficit_reasons` (list of strings).

`ResourceLine`: `required` (int ≥ 0), `allocated` (int ≥ 0), `deficit` (= required − allocated),
`fulfilment_pct` (0–100; 100 when required is 0).

`CityAllocationSummary`: `city`, `resources` (list of `CityResourceTotals`: `resource`, `required`, `available`,
`allocated`, `floors_scaled`), `crews_assigned`, `critical_wards`, `deficit_wards`.

**Invariants (tested):** for every city and resource, `Σ allocated = min(available, Σ required)`;
`0 ≤ allocated ≤ required` per ward; `available = round(stock_pct/100 × Σ required)`; at `stock_pct = 100` no ward
is in deficit; crews sum to `min(total_crews, wards_in_scope × 5)`; output is identical for identical input.

**Example request**
```json
{"scope": "Dhaka South", "origin_week": "2024-08-05", "h_start": 2, "h_end": 4,
 "stock_pct": 60, "total_crews": 10, "service_level": null, "equity_floor_pct": 20}
```
**Example response (abridged)**
```json
{"model_version": "abhas-lgbm-1.1.2", "git_sha": "075e81b", "data_as_of": "2025-12-29", "offline": false,
 "generated_at": "2026-11-27T05:12:00Z", "request": {"...": "echo"},
 "supply_ratios": {"saline_bags": 2.385, "diagnostic_kits": 1.164, "hospital_beds": 0.298},
 "service_levels": {"saline_bags": 0.8, "diagnostic_kits": 0.8, "hospital_beds": 0.9},
 "crew_method": "greedy",
 "wards": [{"ward_id": "DSCC_Ward_04", "city": "Dhaka South", "tier": "Critical", "expected_cases": 47.2,
   "planned_cases": 58.0, "density_factor": 1.73, "priority_weight": 13.84,
   "saline_bags": {"required": 139, "allocated": 139, "deficit": 0, "fulfilment_pct": 100.0},
   "diagnostic_kits": {"required": 68, "allocated": 68, "deficit": 0, "fulfilment_pct": 100.0},
   "hospital_beds": {"required": 18, "allocated": 18, "deficit": 0, "fulfilment_pct": 100.0},
   "crews": 3, "deficit_level": "none", "deficit_reasons": []}],
 "cities": [{"city": "Dhaka South", "resources": [{"resource": "saline_bags", "required": 1890,
   "available": 1134, "allocated": 1134, "floors_scaled": false}], "crews_assigned": 10,
   "critical_wards": 7, "deficit_wards": 12}],
 "solve_ms": 6.1}
```

### 2.2 `POST /api/v1/overflow/route` — intra-city overflow routing (rubric P2; ADR-0012)

**Request `OverflowRequest`**

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| `scope` | `City` or `"all"` | | `"all"` | |
| `origin_week` | DatasetOriginWeek | | required | |
| `horizon` | Horizon | 1–4 | 3 | Week whose bed demand is routed |
| `service_level` | float | 0.50–0.99 | 0.90 | Quantile for planned beds |
| `capacity_overrides` | map WardId → int 1–500 | ≤ 60 entries | `{}` | Unknown ward → 404 |

**Response `OverflowResponse`** = RunMeta + `request`, `capacity_method` (string, e.g.
`ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022)`), `wards` (list of `WardBedStatus`), `transfers`
(list of `Transfer`), `cities` (list of `CityBedSummary`), `solve_ms`.

`WardBedStatus`: `ward_id`, `city`, `beds_required`, `capacity`, `capacity_source` (`derived` | `override`),
`local_deficit` = max(required − capacity, 0), `headroom_before` = max(capacity − required, 0), `transferred_out`,
`transferred_in`, `net_deficit` (patients still without a bed), `utilisation_before` = required / capacity (may
exceed 1; capacity is always ≥ 1, so it is always defined), `utilisation_after`.

`Transfer`: `city`, `from_ward`, `to_ward`, `patients` (int ≥ 1).

`CityBedSummary`: `city`, `capacity_total`, `required_total`, `utilisation_before` = required_total /
capacity_total, `utilisation_after` = Σ min(load_after, capacity) / capacity_total, `headroom_after` =
Σ max(capacity − load_after, 0), `unroutable_patients` = Σ net_deficit, `transfers` (count).

**Invariants (tested):** every transfer stays inside one city; `transferred_out ≤ local_deficit`;
`transferred_in ≤ headroom_before`; a ward never both sends and receives; patients are conserved
(Σ out = Σ in per city); `unroutable_patients = max(Σ D_i − Σ H_j, 0)` per city (routing places everything that
fits); deterministic for identical input.

**Example request** `{"scope": "Dhaka North", "origin_week": "2024-08-05", "horizon": 3}`
**Example response (abridged)**
```json
{"model_version": "abhas-lgbm-1.1.2", "git_sha": "075e81b", "data_as_of": "2025-12-29", "offline": true,
 "generated_at": "2026-11-27T05:13:00Z", "request": {"...": "echo"},
 "capacity_method": "ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022)",
 "wards": [{"ward_id": "DNCC_Ward_09", "city": "Dhaka North", "beds_required": 9, "capacity": 5,
   "capacity_source": "derived", "local_deficit": 4, "headroom_before": 0, "transferred_out": 4,
   "transferred_in": 0, "net_deficit": 0, "utilisation_before": 1.8, "utilisation_after": 1.0}],
 "transfers": [{"city": "Dhaka North", "from_ward": "DNCC_Ward_09", "to_ward": "DNCC_Ward_02", "patients": 4}],
 "cities": [{"city": "Dhaka North", "capacity_total": 96, "required_total": 88, "utilisation_before": 0.917,
   "utilisation_after": 0.917, "headroom_after": 8, "unroutable_patients": 0, "transfers": 3}],
 "solve_ms": 4.0}
```

### 2.3 `POST /api/v1/simulator/run` — vector-control counterfactual (rubric P3; ADR-0013, 0011)

**Request `SimulatorRequest`**

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| `origin_week` | DatasetOriginWeek | | required | |
| `deployments` | list of `{ward_id, crews 1–20}` | ≤ 60, unique wards | null | Exactly one of `deployments`, `auto_crews` |
| `auto_crews` | int | 1–300 | null | Engine places crews greedily (ADR-0011) |
| `efficacy` | `low` / `base` / `high` | | `base` | |

**Response `SimulatorResponse`** = RunMeta + `request`, `efficacy` (`EfficacyParams`: `preset`, `e_max`, `k`,
`assumption_note`), `wards` (list of `WardImpact`, ROI descending), `totals` (`SimulatorTotals`).

`WardImpact`: `rank` (1 = best ROI), `ward_id`, `city`, `crews`, `reduction_fraction` = E(crews), `horizons`
(list of `HorizonImpact` for h = 2, 3, 4: `baseline_cases`, `counterfactual_cases`, `cases_prevented`),
`cases_prevented` (sum h 2–4), `cases_prevented_low`, `cases_prevented_high` (same deployment under the low and
high presets), `beds_avoided` = cases_prevented × beds ratio, `saline_avoided` = cases_prevented × saline ratio,
`roi_cases_per_crew`.

`SimulatorTotals`: `crews`, `cases_prevented`, `cases_prevented_low`, `cases_prevented_high`, `beds_avoided`,
`saline_avoided`.

**Invariants (tested):** `counterfactual_cases ≤ baseline_cases` for every ward and horizon under every preset;
`cases_prevented_low ≤ cases_prevented ≤ cases_prevented_high`; untreated wards are not in the list;
`rank` is a permutation of 1..n ordered by ROI (ties by ward_id); deterministic.

**Example request** `{"origin_week": "2024-08-05", "deployments": [{"ward_id": "DSCC_Ward_04", "crews": 2}], "efficacy": "base"}`
**Example response (abridged)**
```json
{"model_version": "abhas-lgbm-1.1.2", "git_sha": "075e81b", "data_as_of": "2025-12-29", "offline": false,
 "generated_at": "2026-11-27T05:14:00Z", "request": {"...": "echo"},
 "efficacy": {"preset": "base", "e_max": 0.40, "k": 0.50,
   "assumption_note": "Assumed, not fitted: no intervention labels in the data. See ADR-0013."},
 "wards": [{"rank": 1, "ward_id": "DSCC_Ward_04", "city": "Dhaka South", "crews": 2, "reduction_fraction": 0.2528,
   "horizons": [{"horizon": 2, "baseline_cases": 14.2, "counterfactual_cases": 12.1, "cases_prevented": 2.1}],
   "cases_prevented": 6.3, "cases_prevented_low": 3.2, "cases_prevented_high": 10.1,
   "beds_avoided": 1.86, "saline_avoided": 15.02, "roi_cases_per_crew": 3.15}],
 "totals": {"crews": 2, "cases_prevented": 6.3, "cases_prevented_low": 3.2, "cases_prevented_high": 10.1,
   "beds_avoided": 1.86, "saline_avoided": 15.02}}
```

### 2.4 `POST /api/v1/dispatch/notices` — multi-channel notices (rubric P4/P5; ADR-0014)

**Request `DispatchRequest`**

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| `origin_week` | DatasetOriginWeek | | required | |
| `ward_ids` | list of WardId | 1–60 | null | Exactly one of `ward_ids`, `scope` |
| `scope` | `City` or `"all"` | | null | |
| `channels` | list of `sms` / `whatsapp` / `brief` | ≥ 1 | all three | |
| `lang` | `en` / `bn` | | `en` | |
| `plan_id` | UUID string | | null | Use a saved allocation plan; else run allocation with the two fields below |
| `stock_pct` | int | 30–100 | 100 | Used only without `plan_id` |
| `total_crews` | int | 0–300 | 0 | Used only without `plan_id` |

**Response `DispatchResponse`** = RunMeta + `request`, `lang`, `notices` (list of `Notice`).

`Notice`: `facts` (`NoticeFacts`), `sms` (`SmsMessage` or null), `whatsapp` (string or null), `brief_url`
(string or null).

`NoticeFacts` (the only source of numbers): `ward_id`, `ward_name`, `city`, `window_start`, `window_end`
(ISO dates), `tier`, `predicted_cases` (window sum, one decimal), `saline_bags`, `diagnostic_kits`,
`hospital_beds` (each `{required, allocated}`), `crews_assigned`, `deficit_level`, `action` (tier action text in
the request language).

`SmsMessage`: `text`, `encoding` (`GSM-7` | `UCS-2`), `characters`, `segments` (ADR-0014 rules).

**Invariants (tested):** every number in `sms.text`, `whatsapp` and the brief HTML appears in `NoticeFacts`
(Bangla digits normalised to ASCII before comparing); English SMS fits one segment; Bangla SMS ≤ 3 segments;
ward text is HTML-escaped in the brief; no network call (socket guard).

**Example SMS (English, GSM-7, 141 characters, 1 segment):**
`ABHAS Ward 04 Dhaka South, wk of 26 Aug: CRITICAL. 19 cases expected. Saline 38/45, kits 18/22, beds 6/6. Crews 2. Deficit: saline 7, kits 4.`
(The pattern is `allocated/required`.) The Bangla equivalent is UCS-2, 120 characters, 2 segments.

### 2.5 `GET /api/v1/dispatch/brief/{ward_id}.html` — printable commissioner brief

Query: `origin_week` (required), `lang` (`en`|`bn`, default `en`), `plan_id` (optional), `stock_pct`,
`total_crews` (as above). Returns `text/html; charset=utf-8`, A4 portrait print CSS, self-contained (inline CSS,
no external fonts or images; fonts fall back to the system stack plus the self-hosted Noto Sans Bengali when
served by the web app). Sections: header (ward, city, window, tier with 1–4 meter), predicted cases with range,
supplies table (required vs allocated, deficit), assigned crews, actions in the chosen language, provenance footer
(model version, git SHA, data as of, generated at). 404 `unknown-ward`; 422 for bad parameters.
`scripts/export_samples.mjs` (WP4) renders it to PDF with Playwright into `/exports`.

### 2.6 Plans — `POST /api/v1/plans`, `GET /api/v1/plans`, `GET /api/v1/plans/compare` (ADR-0016)

**`POST /plans` body** (discriminated on `kind`): `{"kind": "allocation"|"overflow"|"simulation"|"dispatch",
"label": "1–80 chars", "request": <the matching request model>}`. The server runs it through the plan registry
and stores the result. Response `PlanRecord` (201) = RunMeta + `id` (UUID), `kind`, `label`, `created_at`,
`origin_week`, `inputs` (validated request), `outputs` (full run response), `headline` (`PlanHeadline`).

`PlanHeadline` (nullable fields, filled per kind): `stock_pct`, `mean_fulfilment_pct`, `critical_wards`,
`deficit_wards`, `crews`, `cases_prevented`, `unroutable_patients`, `notices`.

**`GET /plans`** query: `kind` (optional), `limit` 1–100 (default 20). Response `PlanList` = `{plans: [PlanSummary]}`
(newest first). `PlanSummary` = `id`, `kind`, `label`, `created_at`, `origin_week`, `model_version`, `git_sha`,
`headline`.

**`GET /plans/compare`** query: `a`, `b` (UUIDs). Response `PlanComparison` = `{a: PlanSummary, b: PlanSummary,
diffs: [{metric, a, b, delta}]}` with `delta = b − a` when both present. 404 `unknown-plan`.
Comparing plans of different kinds is allowed; metrics absent on one side give `delta: null`.

**Invariants:** plans are append-only (no PUT or DELETE); `outputs` equals what the run endpoint returns for the
same request; `git_sha` and `model_version` are stored as they were at run time.

### 2.7 `GET /readyz` additions

Add to the existing success body: `git_sha` (as in RunMeta), `offline` (bool), and checks `supply_ratios` and
`ward_capacity` (true when the config files load and their `dataset_sha256` matches the seeded data). Readiness
must never make a network call.

## 3. Config files (created in WP0 by `ml/fit_supply.py`, committed, read at startup)

The script refuses to write unless the onsite file's SHA-256 is `24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0`.
It verifies that each constant reproduces 100 % of rows (`round_half_up(c × dengue_cases) == column`) and fails loudly
otherwise.

`apps/api/config/supply_ratios.json`
```json
{"method": "supply = round_half_up(c × dengue_cases); constants reproduce 31,320/31,320 rows",
 "dataset_sha256": "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0",
 "ratios": {"saline_bags": 2.385, "diagnostic_kits": 1.164, "hospital_beds": 0.298},
 "valid_interval": {"saline_bags": [2.383333, 2.386364], "diagnostic_kits": [1.161765, 1.166667],
                    "hospital_beds": [0.296875, 0.300000]},
 "row_match": {"saline_bags": 1.0, "diagnostic_kits": 1.0, "hospital_beds": 1.0}}
```
`apps/api/config/ward_capacity.json`
```json
{"method": "max(1, ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022))", "fitted_years": [2016, 2022],
 "dataset_sha256": "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0",
 "assumption": "Derived: the dataset has no capacity column. Replace with real hospital capacity before deployment.",
 "total_beds": 284, "wards": {"DSCC_Ward_04": 7, "GCC_Ward_02": 3}}
```
Expected: 60 wards, 3–7 beds each, 284 in total (the ward values above are illustrative; the script computes them).

## 4. Shared modules (pure, deterministic, offline; NumPy/SciPy only)

| Module | Function | Inputs | Output | Invariants |
|---|---|---|---|---|
| `shared/supply.py` | `window_case_quantile(means, nb_r, q)` | per-horizon means, per-horizon NB size r, quantile | int cases | Moment-matched NB; Poisson when variance ≤ mean; 0 when means sum to 0; monotone in q |
| | `supply_for_cases(cases, ratios)` | int cases, SupplyRatios | `{saline_bags, diagnostic_kits, hospital_beds}` ints | `floor(c × cases + 0.5)` (round half up); 0 cases → 0; equals the dataset for every row |
| | `verify_constants(frame, ratios)` | DataFrame with cases and the 3 supplies | match share per supply | Used by `ml/fit_supply.py`; must be 1.0 |
| `shared/optimizer.py` | `density_factors(densities, city_median)` | floats | floats in [0.5, 2] | Clipped |
| | `priority_weights(tiers, density_factors)` | tiers, floats | floats | Low 1, Medium 2, High 4, Critical 8 × factor |
| | `allocate_city(demand, weights, stock_pct, floor_pct, ward_ids)` | ints, floats, ints, ids | `AllocationResult(allocated, floors_scaled)` | HiGHS LP; Σ = min(S, Σd); 0 ≤ x ≤ d; ties by ward_id |
| | `largest_remainder_round(values, total, ward_ids)` | floats, int | ints | Sum exactly `total`; ties by ward_id |
| | `classify_deficit(required, allocated, tier)` | ints, tier | `(level, reasons)` | ADR-0010 rule |
| | `greedy_crews(marginal_fn, wards, total_crews, cap=5)` | callable, ids, int | map ward → crews | Exact for non-increasing marginals; flags approximation otherwise |
| `shared/routing.py` | `derive_capacity(beds_history, years, q=0.95, margin=1.10, minimum=1)` | per-ward weekly beds | map ward → int | Training years only |
| | `route_city(required, capacity, ward_ids)` | ints, ints, ids (one city) | `RoutingResult(transfers, loads, u_star)` | Stage 1 LP min-max utilisation; stage 2 MILP min arcs; conservation; no self-arcs |
| | `summarise_city(required, capacity, loads)` | | CityBedSummary fields | Definitions in §2.2 |
| `shared/intervention.py` | `EFFICACY_PRESETS` | | low (0.25, 0.35), base (0.40, 0.50), high (0.55, 0.70) | Constant |
| | `reduction(crews, e_max, k)` | int, floats | float in [0, e_max) | `e_max·(1 − e^(−k·crews))`; 0 crews → 0 |
| | `MONOTONE_RAIN_FEATURES` | | map horizon → set of feature names | Must equal `ml/train.py` constraints; a test asserts it |
| | `apply_reduction(feature_row, horizon, fraction, rain_total)` | dict, int, float, float | new dict | Scales only that horizon's monotone rain features; `rain_anomaly` drops by fraction × rain; never increases any feature |
| | `roi(prevented, crews)` | floats | float | prevented / crews |
| `shared/plan_registry.py` | `register_runner(kind, fn)`, `run(kind, request)` | | `(outputs, headline)` | Composition root registers; no feature imports another |

## 5. Ports

| Port | File | Methods | Adapter |
|---|---|---|---|
| `SupplyRatioSource` | `ports/supply.py` | `ratios() -> SupplyRatios` (dataclass: three constants, valid intervals, row_match, dataset_sha256) | `adapters/config_supply.py` reads `config/supply_ratios.json` |
| `BedCapacitySource` | `ports/capacity.py` | `method: str`, `capacity(ward_ids) -> Mapping[str, int]` (unknown → KeyError → 404) | `adapters/config_capacity.py` reads `config/ward_capacity.json` |
| `CounterfactualForecaster` | `ports/intervention.py` | `window(ward_ids, origin_week, horizons) -> map (ward, h) → PointForecast`; `counterfactual(ward_ids, origin_week, horizons, fractions: map ward → float) -> map (ward, h) → PointForecast`; `nb_size(horizon) -> float` | `ForecastEngine` gains these methods; reduction applied at feature level (ADR-0013), never via raw weather |
| `PlanStore` | `ports/repositories.py` (extend) | `save(record)`, `get(id)`, `list(kind, limit)` | SQLAlchemy adapter over the 0002 tables |

## 6. Database — Alembic `0002_phase2_plans` (reversible)

| Table | Columns | Indexes / constraints |
|---|---|---|
| `plans` | `id` String(36) PK · `kind` String(16) not null · `label` String(80) not null · `origin_week` Date not null · `model_version` String(64) not null · `git_sha` String(40) not null · `data_as_of` Date not null · `offline` Boolean not null · `created_at` DateTime(tz) not null, server default now | `ix_plans_kind_created` (kind, created_at desc); check `kind in ('allocation','overflow','simulation','dispatch')` |
| `plan_runs` | `plan_id` String(36) PK, FK → plans.id ON DELETE CASCADE · `inputs_json` Text not null · `outputs_json` Text not null · `headline_json` Text not null · `solve_ms` Float not null | — |
| `dispatch_log` | `id` Integer PK autoincrement · `plan_id` String(36) FK → plans.id null · `ward_id` String(16) not null · `channel` String(16) not null · `lang` String(2) not null · `encoding` String(8) null · `segments` Integer null · `characters` Integer null · `created_at` DateTime(tz) not null | `ix_dispatch_log_ward_created` (ward_id, created_at) |

No `ward_capacity` table: capacity lives in the versioned JSON file (ADR-0012). `downgrade()` drops the three
tables in reverse order. `npm run db:check` must pass up → down → up.

## 7. Gates (`.orca-team/gates.json`)

Add to `commands`: `"offline": "npm run offline:check"`. Root `package.json` gains
`"offline:check": "npm run test:offline:api && npm run test:offline:web"` where `test:offline:api` runs pytest with
the socket guard (`-m offline` plus the whole suite under `ABHAS_OFFLINE=1`) and `test:offline:web` runs the
Playwright project `offline` (every non-localhost request aborted, all five Command Center steps). Keep the gates
`slices`, `contract`, `ci`, `e2e`, `migrations`, `load`. Timeouts: `offline` 20 min.
