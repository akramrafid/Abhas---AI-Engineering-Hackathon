# Merge review: akramrafid/fix-r1-lead

- **Author**: CORE (`antigravity/Gemini 4 Neon (XHigh)`)
- **Reviewer**: LEAD (`antigravity/Gemini 4 Neon (XHigh)`) — same-family integration check; cross-family Claude Opus 5.5 review pending (r2).
- **Checked**: `git diff lead...akramrafid/fix-r1-lead` across 10 files (4 small conventional commits: CR-1 `useShell` bypass for absolute exe paths in `scripts/setup.mjs`; CR-3 `FIRST_FORECAST_ORIGIN`, `in_dataset_range`, `DatasetOriginWeek` in `app/core/types.py`, `ForecastRequest`/`ScenarioRequest`/`HeatmapQuery` validators, updated `contracts/openapi.json`; CR-10 `prod` normalized to `production` in `app/core/config.py`; CR-16 `app/core/readiness.py` + DB seeded check + extensible readiness checks in `app/main.py`). Tests cover every finding (`test_cr_1_*`, `test_cr_3_*`, `test_cr_10_*`, `test_cr_16_*`). No secrets or extra deps added.
- **Not verified**: Full `shell: false` removal for non-absolute Windows shims (SEC-1) and `origin_week` upper bound in live mode (SEC-5) remain for WP3; cross-family Opus verification pending in r2.

Verdict: MERGE
