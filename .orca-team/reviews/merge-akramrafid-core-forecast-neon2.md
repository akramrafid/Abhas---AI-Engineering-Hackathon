# Merge review: akramrafid/core-forecast-neon2

- **Author**: CORE (`antigravity/Gemini 4 Neon (XHigh)`)
- **Reviewer**: LEAD (`antigravity/Gemini 4 Neon (XHigh)`) — same-family integration check; cross-family Claude Opus 5.5 review pending (r2).
- **Checked**: `git diff akramrafid/fix-r1-lead...akramrafid/core-forecast-neon2` (56 files: `ml/{train,backtest,verify_artifact}.py`, `ml/artifacts/{current.joblib,metadata.json}`, `adapters/{lgbm_model,llm,fake_llm,runtime}.py`, `observability/*`, `shared/{drivers,tiers,forecast_engine}.py`, real `forecast`/`heatmap`/`validation`/`advisory`/`ops` slices + tests + `docs/llmops.md`). Zero edits to `app/main.py`, `app/core/*`, or `features/*/schemas.py` (disjoint from `fix-r1-lead`).
- **Not verified**: `heatmap/router.py` still uses raw Query params instead of `HeatmapQuery` (to be wired in WP2); model is untuned CPU baseline (golden pass rate 38/48 = 79.17%, 1 case short of 80% floor — WP1 GPU Optuna tuning + XGBoost challenger will resolve); cross-family Opus review pending in r2.

Verdict: MERGE
