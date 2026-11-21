# Merge review — akramrafid/ui-brand

_Reviewer: LEAD (antigravity/Gemini 4 Neon XHigh · cross-family Opus review deferred until 19:20 BST quota reset per STATUS.md rule)_

- Scope: strictly owned files only (`apps/web/public/brand/**`, `favicon.svg`, `scripts/gen-tokens.mjs`, `src/styles/tokens.css`, `src/app/globals.css`, `src/components/brand/{AbhasLogo,BrandRibbon,RiskTierBadge}.tsx`, `src/features/brand/BrandShowcase.tsx`, `src/app/brand/page.tsx`); zero changes to `package.json`, `layout.tsx`, `page.tsx`, or `apps/api/`.
- AC-16 & NFR-6 verified: `Select-String` confirms zero raw hex color codes in any TSX file; `tokens.css` deterministically generated from `docs/brand/tokens.json`; `RiskTierBadge` always displays EN/BN labels (`Low/নিম্ন`, `Medium/মাঝারি`, `High/উচ্চ`, `Critical/সংকটপূর্ণ`) + 1–4 accessible bar meter (`role="img"`, `aria-label`), placed in `src/components/brand/` so dashboard slices stay compliant with `gates.mjs slices`.
- Worker verified `next build`, `gates.mjs slices`, `npm run ci`, and Playwright + axe-core WCAG 2.2 AA (0 violations, 375px/1440px zero overflow, color-vision checks).

Verdict: MERGE
