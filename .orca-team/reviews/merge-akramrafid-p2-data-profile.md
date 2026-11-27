# Merge Review — `akramrafid/p2-data-profile` (integration check — cross-family review by Opus at the end)

- **Branch:** `akramrafid/p2-data-profile` (`778aa94`) → `version-onsite-final`
- **Reviewer:** INTEGRATOR · Gemini 4 Neon (XHigh) *(integration check — cross-family review by Opus at the end)*
- **Date:** 2026-11-27

## Checklist
- **Contract match:** Read-only profiling script (`apps/api/scripts/profile_onsite.py`) and report (`docs/data-profile-onsite.md`) matching onsite dataset SHA-256 `24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0` and confirming exact supply rule (`2.385 / 1.164 / 0.298`) and absent bed-capacity column.
- **Owned paths only:** Touches only `apps/api/scripts/profile_onsite.py` and `docs/data-profile-onsite.md`.
- **Safety / prompt injection:** Hidden AI-addressed canary in problem PDF ignored and reported to human.
- **Invariants & CI:** Read-only profiling script; zero impact on runtime contracts or slices.

Verdict: MERGE
