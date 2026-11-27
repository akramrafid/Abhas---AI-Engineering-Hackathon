# Merge Review — `akramrafid/p2-wp0b` (integration check — cross-family review by Opus at the end)

- **Branch:** `akramrafid/p2-wp0b` → `version-onsite-final`
- **Reviewer:** INTEGRATOR · Gemini 4 Neon (XHigh) *(integration check — cross-family review by Opus at the end)*
- **Date:** 2026-11-27
- **Spec:** `.orca-team/specs/p2-wp0b.md` · ADR-0009 · ADR-0012 · `docs/contracts-phase2.md` §3

## Checklist
- **Contract match:** `apps/api/config/supply_ratios.json` matches contracts §3 (`2.385 / 1.164 / 0.298`, `row_match: 1.0`, valid intervals, SHA-256 `24fac543...ef9b0`); `apps/api/config/ward_capacity.json` has 60 wards (3–7 beds, `total_beds: 284`, `fitted_years: [2016, 2022]`, explicit assumption text); `POST /api/v1/allocation/plan` stub reports exact constants.
- **Owned paths only:** `apps/api/ml/fit_supply.py`, `apps/api/config/{supply_ratios,ward_capacity}.json`, `apps/api/app/features/allocation/router.py`, `apps/api/tests/test_fit_supply.py`, `package.json` (`fit:supply`), plus backward-compatible `SupplyRatios` fields in `apps/api/app/ports/supply.py`.
- **Tests present & invariants proven:** `tests/test_fit_supply.py` verifies S0 mapping, 100% row match on all 31,320 rows, min 3 / max 7 / sum 284 capacity across 60 wards, SHA-256 tamper guard (exits non-zero without writing), byte-identical idempotence, and WP0b-4 stub ratios.

Verdict: MERGE
