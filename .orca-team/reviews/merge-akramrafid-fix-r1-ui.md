# Merge review: akramrafid/fix-r1-ui

- **Author**: UI (`antigravity/Gemini 4 Neon (XHigh)`)
- **Reviewer**: LEAD (`antigravity/Gemini 4 Neon (XHigh)`) — same-family integration check; cross-family Claude Opus 5.5 review pending (r2).
- **Checked**: `git diff lead...akramrafid/fix-r1-ui` (4 conventional commits + 1 WIP commit adding `apps/web/AGENTS.md` identical to `lead`): CR-2 pins dry pre-monsoon scenario baseline (`DSCC_Ward_04`, `2024-05-27`, 10.33 mm rain, 0 cases) in `demo-config.ts` and wires it into `ScenarioPanel`; CR-9 adds `StubDataBanner` for `stub*` model versions; CR-18 fails Playwright axe scan on any WCAG A/AA violation and fixes heatmap tile accessible label; replaces thick left accent border in ward list.
- **Not verified**: Playwright `npm run e2e` against the newly merged real `core-forecast-neon2` API will be executed immediately after merge; cross-family Opus review pending in r2.

Verdict: MERGE
