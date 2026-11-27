# WP3 Handoff — Counterfactual Simulator & Greedy Crews (`akramrafid/p2-wp3`)

- **Owned paths modified**:
  - `apps/api/app/shared/intervention.py` (`reduction`, `apply_reduction`, `roi`, `assign_crews_for_wards`)
  - `apps/api/app/shared/optimizer.py` (`greedy_crews`)
  - `apps/api/app/shared/forecast_engine.py` (`nb_size`, `window`, `counterfactual`, `counterfactual_grid`)
  - `apps/api/app/features/simulator/{service,deps,router}.py`
  - `apps/api/app/features/allocation/deps.py` (wires `assign_crews_for_wards` into `AllocationService`)
  - `apps/api/tests/shared/test_intervention.py`
  - `apps/api/tests/features/simulator/test_simulator.py`
- **Notes for Integrator**:
  - `stub_simulator_runner` is aliased to `live_simulator_runner` in `features/simulator/router.py`.
  - Both `AllocationService` and `SimulatorService` (`auto_crews`) call `shared.intervention.assign_crews_for_wards` with identical per-city priority weights, guaranteeing identical crew placement for the same origin and crew budget (WP3-5).
  - Remove `NotImplementedError` stub assertions for `greedy_crews`, `reduction`, `apply_reduction`, `roi` in `tests/test_p2_contracts.py` on merge.
