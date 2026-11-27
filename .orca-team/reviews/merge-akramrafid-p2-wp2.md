# Merge Check — `akramrafid/p2-wp2` (Overflow Routing Engine)

_Type: integration check — cross-family review by Opus at the end._

- **Branch**: `akramrafid/p2-wp2` → `version-onsite-final`
- **Owned paths verified**:
  - `apps/api/app/shared/routing.py`
  - `apps/api/app/adapters/config_capacity.py`
  - `apps/api/app/features/overflow/{service,deps,router}.py`
  - `apps/api/tests/shared/test_routing.py`
  - `apps/api/tests/features/overflow/test_overflow.py`
  - `.orca-team/handoff/p2-wp2.md`
- **Contract match**: Exact `OverflowRequest`/`OverflowResponse` schema match (zero OpenAPI drift); `stub_overflow_runner` aliased to `live_overflow_runner`.
- **Tests & invariants proven**:
  - `9 passed` (`tests/shared/test_routing.py`, `tests/features/overflow/test_overflow.py`)
  - Hand-solved algorithms `R1–R3` pass exactly; `derive_capacity` strictly uses training years `2016..2022`; Hypothesis property tests prove intra-city pool isolation, conservation, zero self-arcs, disjoint sender/receiver sets, exact unroutable counts, and permutation invariance.
  - `ruff`: 0 issues · `pyright`: 0 errors.

Verdict: MERGE
