# Merge Check — `akramrafid/p2-wp4` (Multi-Channel Dispatch & Exports)

_Type: integration check — cross-family review by Opus at the end._

- **Branch**: `akramrafid/p2-wp4` → `version-onsite-final`
- **Owned paths verified**:
  - `apps/api/app/features/dispatch/{templates,service,deps,router}.py`
  - `apps/api/tests/features/dispatch/test_dispatch.py`
  - `scripts/export_samples.mjs`
  - `.orca-team/handoff/p2-wp4.md`
- **Contract match**: Exact `DispatchRequest`/`DispatchResponse` and `/dispatch/brief/{ward_id}.html` contract match (zero OpenAPI drift); `stub_dispatch_runner` aliased to `live_dispatch_runner`.
- **Tests & invariants proven**:
  - `10 passed` (`tests/features/dispatch/test_dispatch.py`)
  - Hand-solved algorithms `D1–D6` pass exactly (GSM-7 single segment EN, UCS-2 ≤ 3 segments BN, HTML escaping of `<script>`, number-faithfulness against `NoticeFacts` with Bangla digit normalization, zero external URLs in A4 HTML brief).
  - `ruff`: 0 issues · `pyright`: 0 errors.

Verdict: MERGE
