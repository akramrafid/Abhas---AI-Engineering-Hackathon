# Merge review: akramrafid/wp1-core-model

- **Author**: CORE-MODEL (`antigravity/Gemini 4 Neon (XHigh)`)
- **Reviewer**: LEAD (`antigravity/Gemini 4 Neon (XHigh)`) — same-family integration check; cross-family Claude Opus 5.5 review pending (r2).
- **Checked**: `git diff lead..akramrafid/wp1-core-model` (25 files, `1047667..eaa9526`: `ml/{gpu_probe,train,backtest}.py`, `ml/artifacts/{abhas-lgbm-1.1.2.joblib,current.joblib,metadata.json,best_params.json}`, `app/adapters/lgbm_model.py`, `app/shared/{drivers,tiers}.py`, `pyproject.toml` `[dependency-groups] train`, `uv.lock`, `evals/{history.jsonl,report.md}`, `evals/results/{baseline,backtest,validation,eval,latest-all,latest-heldout,retrieval}.json`, `tests/ml/*`, `docs/ai-design.md`). Pre-tuning baseline committed (`3f9766e`), seeded purged 2019–2022 Optuna tuning for LightGBM (CV MAE 1.2033) beating verified RTX 3060 CUDA-12 XGBoost challenger (1.2050), 2023-only conformal & cost-sensitive tier calibration `(4.5, 9.0, 11.0)`, 954.6 KiB SHA-verified artifact with `0.0000` CPU reproduction, 11/11 AC-5 hold-out floors PASS (`40/48 = 83.33%`), and `retrieval` improved to `recall@15 = 0.6111` (climatology `0.5704`).
- **Not verified**: Overlap in `apps/api/evals/results/retrieval.json` with WP4 (take WP1's improved `abhas-lgbm-1.1.2` metrics); `gates.mjs eval` regression check against pre-WP1 `floors_passed: false` WIP row (`574f78a`) to be verified/resolved on `lead`; deferred SEC-9/SEC-12 follow-up after merge; cross-family Claude Opus 5.5 review pending in r2.

Verdict: MERGE
