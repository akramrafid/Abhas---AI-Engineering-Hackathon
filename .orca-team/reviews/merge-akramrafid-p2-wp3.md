# Merge Check — `akramrafid/p2-wp3` (Counterfactual Simulator & Greedy Crews)

_Type: integration check — cross-family review by Opus at the end._

- **Branch**: `akramrafid/p2-wp3` → `version-onsite-final`
- **Owned paths verified**:
  - `apps/api/app/shared/intervention.py`
  - `apps/api/app/shared/optimizer.py` (`greedy_crews`)
  - `apps/api/app/shared/forecast_engine.py` (`CounterfactualForecaster` methods)
  - `apps/api/app/features/simulator/{service,deps,router}.py`
  - `apps/api/app/features/allocation/deps.py` (crew assigner wiring)
  - `apps/api/tests/shared/test_intervention.py`
  - `apps/api/tests/features/simulator/test_simulator.py`
  - `.orca-team/handoff/p2-wp3.md`
- **Contract match**: Exact `SimulatorRequest`/`SimulatorResponse` schema match (zero OpenAPI drift); `stub_simulator_runner` aliased to `live_simulator_runner`; `auto_crews` and `allocation/plan` share `shared.intervention.assign_crews_for_wards`.
- **Tests & invariants proven**:
  - `19 passed` (`test_intervention.py`, `test_simulator.py`, `test_allocation.py`)
  - Hand-solved algorithms `E1`, `T1`, `T2`, `T3` (all 60 wards × 3 presets × 3 horizons), `G1–G3` pass exactly; `MONOTONE_RAIN_FEATURES` matches `ml/train.py`; counterfactuals never write to `predictions_cache`; 10-ward p95 well under 800 ms.
  - `ruff`: 0 issues · `pyright`: 0 errors.

Verdict: MERGE
