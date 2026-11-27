# Merge Check — `akramrafid/p2-wp1` (Allocation Engine)

_Type: integration check — cross-family review by Opus at the end._

- **Branch**: `akramrafid/p2-wp1` → `version-onsite-final`
- **Owned paths verified**:
  - `apps/api/app/shared/supply.py`
  - `apps/api/app/shared/optimizer.py` (allocation functions only; `greedy_crews` left for WP3)
  - `apps/api/app/adapters/config_supply.py`
  - `apps/api/app/features/allocation/{service,deps,router}.py`
  - `apps/api/tests/shared/test_supply.py`
  - `apps/api/tests/shared/test_optimizer.py`
  - `apps/api/tests/features/allocation/test_allocation.py`
  - `.orca-team/handoff/p2-wp1.md`
- **Contract match**: Exact `AllocationRequest`/`AllocationResponse` schema match (zero OpenAPI drift); `stub_allocation_runner` aliased to `live_allocation_runner`.
- **Tests & invariants proven**:
  - `17 passed` (`tests/shared/test_supply.py`, `tests/shared/test_optimizer.py`, `tests/features/allocation/test_allocation.py`)
  - Hand-solved algorithms `S0–S4` and `A1–A5` pass exactly; Hypothesis property tests prove monotonicity, conservation, bounds, and strict permutation invariance.
  - `ruff`: 0 issues · `pyright`: 0 errors.

Verdict: MERGE
