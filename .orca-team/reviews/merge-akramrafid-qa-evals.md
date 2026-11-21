# Merge review — akramrafid/qa-evals

_Reviewer: LEAD (antigravity/Gemini 4 Neon XHigh · cross-family Opus review deferred until 19:20 BST quota reset per STATUS.md rule)_

- Scope: strictly owned files only (`apps/api/evals/**`, `apps/api/tests/integration/test_evals_lock.py`, `tests/load/smoke.js`, `docs/test-plan.md`); zero edits to `apps/api/app/**`, contracts, or `apps/web/`.
- Datasets locked before tuning: 48 stratified held-out cases covering all 22 distinct 2024–2025 Critical target weeks + 10 High + 8 Medium + 8 Low (`heldout_sha256: 4ab5539f136b...`), 48 dev cases, and 36 in-season retrieval queries; tamper exit code 3 verified by integration tests.
- Worker verified `npm run eval:lock`, `gates.mjs retrieval` (`recall@15=0.5704`, `mrr=0.8019`, `n=36`), `gates.mjs slices`, and `npm run ci` (10/10 pytest, `smoke:local` PASS); k6 load script `tests/load/smoke.js` aligns cleanly with `NFR-2` and our `RATE_LIMIT_PER_MINUTE=10000` test override.

Verdict: MERGE
