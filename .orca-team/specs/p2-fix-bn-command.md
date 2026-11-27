ROLE: UI · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-bn-command — full Bangla for the Command tab (QA Q2)
PRIORITY: P2 (MEDIUM; the EN ↔ বাংলা toggle is on screen in the demo)
SKILLS: frontend-engineering, production-hardening, webapp-testing, verification-before-completion

## Problem
With `lang=bn`, the Command tab is mostly English. Measured in the browser at `/dashboard?demo=1&tab=command&lang=bn`
(English-only lines against Bangla lines):

| Step | English only | Bangla |
|---|---|---|
| 2 | 170 | 122 |
| 3 | 224 | 2 |
| 4 | 99 | 2 |
| 5 | 13 | 3 |

- Step labels are mixed ("1 পূর্বাভাস Demand").
- Untranslated examples: "Routing horizon", "Planned bed quantile", "Placement mode", "Efficacy preset", "Available
  Regional Stock", "Active solution".
- `PlanCompareDrawer.tsx` and `ProvenanceStrip.tsx` have no Bangla branches at all.

## Owned paths
- `apps/web/src/lib/i18n.ts`: add every Command string under `UI_COPY.en.command` / `UI_COPY.bn.command`.
- `apps/web/src/features/command/**`: replace inline English literals and `bn ? … : …` ternaries with `copy.*` keys.
- `apps/web/e2e/command.spec.ts`

## Expected behaviour
1. Every visible label, button, heading, KPI caption, table header, empty or error state and aria-label in steps 1–5,
   the compare drawer and the provenance strip comes from `UI_COPY[lang].command`.
2. Keep these in English: ward IDs, model version, git SHA, encoding names (GSM-7, UCS-2) and units that are standard
   in Bangladesh health logistics. Numbers in BN use Bangla digits only where the Phase 1 dashboard already does;
   follow the existing `i18n.ts` helpers.
3. Bangla text uses the brand Bangla font (Noto Sans Bengali, as in Phase 1). No layout overflow at 1280 px or 390 px.

## Tests that prove the fix
- e2e `AC-WP5-bn every command step is Bangla`: for steps 1–5 with `lang=bn`, collect the visible text of
  `[data-testid^="command-step-panel"]` (or the step container). Assert that it contains no word from a deny-list of
  the English labels above, and that it contains at least one Bangla character (U+0980–U+09FF) per heading.
- axe WCAG 2.2 AA: 0 violations on steps 1–5 in BN.
- A screenshot of each step in BN at 1280 px, attached to the PR or handoff.

## Gate
`npm run ci` · `node .orca-team/tools/gates.mjs e2e`. Commit as `version-onsite-final: fix(ui-command): complete EN/BN copy`.
