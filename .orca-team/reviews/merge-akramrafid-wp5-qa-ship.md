# Merge Review: `akramrafid/wp5-qa-ship`

- Branch: `akramrafid/wp5-qa-ship`
- Target: `lead`
- Author seat: `QA`
- Reviewer: `LEAD` (Antigravity Gemini)
- Verdict: MERGE

## Summary of Changes
- **CR-4**: Eval runner refuse-to-overwrite lock enforcement.
- **CR-5**: Dev split guard and correct training end-year parameterization.
- **CR-6**: 200-row single-row p95 latency timing calculation in `scoring.py`.
- **CR-11**: Tightened smoke test assertion for 404 `/unknown-ward` RFC-9457 error problem type.
- **CR-14**: Full held-out eval dump to `results/eval.json`.
- **CR-15**: Climatology fallback rows counted as skipped, failing `--split heldout` if any occur.
- **Archive**: Archived pre-WP1 failed WIP rows to `apps/api/evals/history-pre-wp1-wip-archive.jsonl`.
- **Integration Tests**: Added comprehensive suite `apps/api/tests/integration/test_evals_hardening.py` (499 lines).

## Gate & Test Verification
- Python integration tests: `pytest apps/api/tests/integration/test_evals_hardening.py`
- Slices: preserved (evals tooling & tests only).
- Contract & smoke: preserved.
