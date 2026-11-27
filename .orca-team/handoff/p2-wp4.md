# WP4 Handoff — Dispatch & Exports (`akramrafid/p2-wp4`)

- **Owned paths modified**:
  - `apps/api/app/features/dispatch/{templates,service,deps,router}.py`
  - `apps/api/tests/features/dispatch/test_dispatch.py`
  - `scripts/export_samples.mjs`
- **Notes for Integrator**:
  - `stub_dispatch_runner` is aliased to `live_dispatch_runner` in `features/dispatch/router.py` so `main.py` automatically runs live dispatch.
  - Add `"exports": "node scripts/export_samples.mjs"` to root `package.json` after merge.
  - Remove `NotImplementedError` stub assertion for `DispatchService().notices` in `tests/test_p2_contracts.py` on merge.
  - Run `npm run exports` after WP1–WP4 are merged so `/exports` reflects live allocation + crew placement + dispatch output.
