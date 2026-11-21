ROLE: UI-2 · role 10 Frontend engineer (Brand) · hat build
LEAD_BRANCH: lead
TASK: ui-brand — Abhas brand kit, tokens CSS, SVGs, favicons, shared brand components, /brand page          WAVE: 1A      FEATURE: brand
MODEL: antigravity · Gemini 4 Hydrogen (XHigh)
SKILLS: production-standards, verification-before-completion, frontend-engineering, frontend-design, web-design-guidelines
GOAL: Implement the already-designed Abhas brand system verbatim from `docs/brand/` (`BRAND.md`, `tokens.json`, `logo/*.svg`, `art/*.svg`): deterministic token CSS + Tailwind v4 `@theme`, public SVGs + favicons, reusable brand components in `src/components/brand/` (so dashboard slices can import them without violating `gates.mjs slices`), and the `/brand` showcase page (`FR-9 / AC-16`).
OWNED PATHS (only these may be edited):
  - apps/web/public/brand/**
  - apps/web/public/favicon*
  - apps/web/scripts/gen-tokens.mjs
  - apps/web/src/styles/tokens.css
  - apps/web/src/app/globals.css
  - apps/web/src/components/brand/**
  - apps/web/src/features/brand/**
  - apps/web/src/app/brand/**
READ-ONLY CONTEXT: TASK.md, docs/PRD.md (FR-9, AC-16, NFR-6), docs/KICKOFF-PROMPT.md (§6), docs/brand/BRAND.md, docs/brand/tokens.json, docs/brand/logo/*, docs/brand/art/*, apps/web/src/app/layout.tsx, .orca-team/PLAN.md
CONTRACT:
  - Treat `docs/brand/` as the single source of truth — do NOT redesign the brand, never use a mosquito, skull, or red cross, and add NO decorative animations.
  - `apps/web/scripts/gen-tokens.mjs`: reads `../../docs/brand/tokens.json` and generates `apps/web/src/styles/tokens.css` (all CSS variables + Tailwind v4 `@theme inline` tokens + tabular-nums `.tnum` utility) deterministically. Run it so `tokens.css` is exact.
  - Copy SVGs from `docs/brand/logo/` and `docs/brand/art/` into `apps/web/public/brand/` (`logo/*.svg`, `art/*.svg`), and copy/derive `apps/web/public/favicon.svg` from `abhas-app-icon.svg`.
  - Build reusable components in `apps/web/src/components/brand/` (NOT inside `src/features/brand/`, because `gates.mjs slices` forbids cross-feature imports!):
    * `AbhasLogo.tsx`: renders primary (light ground), reverse (Ink/Navy/Royal dark ground), or mono lockup with the SVG mark + `ABHAS` wordmark (`Manrope` 800, uppercase, `tracking-[0.08em]`) and optional Bangla `আভাস` or city edition subtitle.
    * `RiskTierBadge.tsx`: renders any tier (`Low | Medium | High | Critical`) using ONLY token CSS variables (`--color-risk-*`), ALWAYS displaying BOTH the EN + BN label (`Low / নিম্ন`, `Medium / মাঝারি`, `High / উচ্চ`, `Critical / সংকটপূর্ণ`) AND a 1–4 accessible bar meter (`aria-label` + `role="img"`), meeting WCAG 2.2 AA contrast. Export typed `TIER_META` helper (labels EN/BN, meter 1–4, action copy from `tokens.json`).
    * `BrandRibbon.tsx`: renders `art/abhas-ribbon-*.svg` strictly on Ink or Navy hero bands (never behind data).
  - Build `apps/web/src/features/brand/BrandShowcase.tsx` and `apps/web/src/app/brand/page.tsx`: clean `/brand` page showcasing the colour palette tokens (with contrast ratios and the "Lime only on Ink/Navy/Royal, never in data views" rule), typography specimen (Manrope, IBM Plex Mono tabular numerals, Noto Sans Bengali), logo lockup variants on light & dark grounds, and the 4-tier risk scale with EN/BN labels, 1–4 meter, and recommended public-health actions.
  - STRICT rules (`AC-16`): ZERO hardcoded hex colours in `apps/web/src/components/brand/**`, `apps/web/src/features/brand/**`, or `apps/web/src/app/brand/**` (every colour comes from Tailwind theme classes / `var(--color-*)` generated from `tokens.json`); Lime appears ONLY on Ink/Navy/Royal and NEVER inside data/tier components.
ACCEPTANCE CRITERIA:
  AC-16: Every colour comes from tokens generated from `docs/brand/tokens.json`, Lime never appears in a data view, and `/brand` shows the tokens, tier scale, and logo.
  NFR-6: WCAG 2.2 AA contrast everywhere; tiers readable under colour-vision deficiency via EN/BN text + 1–4 bar meter.
GATE TO PASS: node .orca-team/tools/gates.mjs slices && npm run ci   (+ `npm --prefix apps/web run build` succeeds)
ENV VARS NEEDED: none
DEV PORT: 3002
OUT OF SCOPE: Do not edit `apps/web/package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, or any `apps/api/**` files. (`@fontsource/manrope`, `@fontsource/ibm-plex-mono`, `@fontsource/noto-sans-bengali` are already installed and imported in `layout.tsx`.)
DONE WHEN: `gen-tokens.mjs` run, SVGs copied, shared brand components + `/brand` page built, `npm --prefix apps/web run build`, `gates.mjs slices`, and `npm run ci` are green, committed on your branch, and `worker_done` is sent.
