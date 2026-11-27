# WP1 Handoff — Allocation Engine (`akramrafid/p2-wp1`)

- **Owned paths modified**:
  - `apps/api/app/shared/supply.py`
  - `apps/api/app/shared/optimizer.py` (all allocation functions; `greedy_crews` left stubbed for WP3)
  - `apps/api/app/adapters/config_supply.py`
  - `apps/api/app/features/allocation/{service,deps,router}.py`
  - `apps/api/tests/shared/test_supply.py`
  - `apps/api/tests/shared/test_optimizer.py`
  - `apps/api/tests/features/allocation/test_allocation.py`
- **Notes for Integrator**:
  - `stub_allocation_runner` is aliased to `live_allocation_runner` in `features/allocation/router.py` so `main.py` automatically runs the live engine.
  - Wire `check_supply_ratios_ready` from `app.adapters.config_supply` into `/readyz` in `main.py`.
  - Remove `NotImplementedError` stub assertions for WP1 functions (`window_case_quantile`, `supply_for_cases`, `fit_ratios`, `density_factors`, `priority_weights`, `allocate_city`, `largest_remainder_round`, `classify_deficit`) in `tests/test_p2_contracts.py` on merge.
  - WP3 will wire `greedy_crews` via the `crew_assigner` parameter on `AllocationService`.
