# Merge review — akramrafid/ui-dashboard

_Reviewer: LEAD (antigravity/Gemini 4 Neon XHigh · cross-family Opus review deferred until 19:20 BST quota reset per STATUS.md rule)_

- Scope: strictly owned files only (`docs/ux/{flow,wireframes}.md`, `apps/web/src/lib/{api/client,demo-config}.ts`, `apps/web/src/components/{Providers,ui/*}.tsx`, `apps/web/src/features/{ward-risk,lags,scenario,heatmap,validation}/**`, `apps/web/src/app/page.tsx`, `apps/web/e2e/dashboard.spec.ts`, `apps/web/playwright.config.ts`); zero edits to `apps/api/`, `contracts/`, `package.json`, `layout.tsx`, `tokens.css`, or `brand/`.
- AC-1, AC-6, AC-7, AC-8, AC-11, AC-13, AC-14, AC-16, NFR-6 verified: `Select-String` confirms zero raw hex color codes across all `apps/web/src/**/*.{ts,tsx}`; `DEMO_CONFIG` pins real dataset monsoon-surge `DSCC_Ward_04` / `2024-08-05` (`216.4 mm` rain -> 23 cases at h+3); worker verified `gates.mjs slices` (8 api, 6 web slices), `next build`, `npm run ci`, and 9/9 Playwright + axe-core WCAG 2.2 AA e2e specs (0 serious/critical violations, 0 Lime in `[data-view='data']`).
- Pending cross-family OUTSIDER hallway test (`docs/ux/hallway-test.md`) after `core-forecast` lands and Claude Opus resets at 19:20 BST.

Verdict: MERGE
