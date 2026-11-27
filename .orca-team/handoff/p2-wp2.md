# WP2 Handoff — Overflow Routing Engine (`akramrafid/p2-wp2`)

- **Owned paths modified**:
  - `apps/api/app/shared/routing.py`
  - `apps/api/app/adapters/config_capacity.py`
  - `apps/api/app/features/overflow/{service,deps,router}.py`
  - `apps/api/tests/shared/test_routing.py`
  - `apps/api/tests/features/overflow/test_overflow.py`
- **Notes for Integrator**:
  - `stub_overflow_runner` is aliased to `live_overflow_runner` in `features/overflow/router.py` so `main.py` automatically runs live overflow routing.
  - Wire `check_ward_capacity_ready` from `app.adapters.config_capacity` into `/readyz` in `main.py`.
  - Remove `NotImplementedError` stub assertions for `derive_capacity`, `route_city`, `summarise_city`, and `OverflowService().route` in `tests/test_p2_contracts.py` on merge.
