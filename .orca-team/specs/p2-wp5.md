ROLE: UI · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp5 — Command Center web slice, the 5-step operator flow (rubric P1–P4 live, P6 video)
SKILLS: production-standards, frontend-engineering, frontend-design, web-design-guidelines, webapp-testing, impeccable
READ FIRST: docs/contracts-phase2.md §2 · DESIGN.md and PRODUCT.md (brand rules: Lime never in data views; risk colours
  only for risk with EN/BN label + 1–4 meter; Plex Mono for numbers) · apps/web/src/features/** (Phase 1 patterns) ·
  apps/web/src/components/dashboard/shell/** (dock, header, stat tiles).
DEPENDS ON: WP0 merged (types). Build against the stub fixtures, then the live endpoints as WP1–WP4 land.

OWNED PATHS
- apps/web/src/features/command/** (new) · apps/web/src/lib/i18n.ts (new tab key "command" and its EN/BN copy)
- apps/web/src/app/dashboard/page.tsx (mount the Command tab only) · apps/web/e2e/command.spec.ts (new)

THE FLOW (one tab "Command", five steps with a stepper; state in the URL)
1. Forecast — city/all, origin week, window; ward table with tier and window cases.
2. Allocate — stock slider 30–100 % and crews input; live re-solve (debounced 150 ms); per-ward required vs allocated
   bars for the three supplies; deficit badges (critical/deficit) with reasons; city totals.
3. Route — per-city bed utilisation before/after, transfer list, net deficits, unroutable patients, capacity method
   label ("derived from history"), editable capacity overrides.
4. Simulate — pick wards and crews or "auto"; efficacy preset; ROI ranking table with the low–high band; cases, beds,
   saline avoided; chart of baseline vs counterfactual for h = 2–4.
5. Dispatch — choose wards, channels, language; SMS preview with encoding/segments; WhatsApp preview; open/print brief;
   "Save as plan" on every step; plan comparison drawer (GET plans/compare).
Every step shows the provenance strip (model version, git SHA, data as of) and an "Offline" badge when offline is true.

ACCEPTANCE CRITERIA
- WP5-1 (P1 live) Given step 2, when the slider moves from 100 to 30, then allocations and deficit badges update within
  one second without a page reload.
- WP5-2 (P2) Given step 3, then each city shows utilisation before/after, transfers and unroutable patients.
- WP5-3 (P3) Given step 4 with 3 wards treated, then the ROI ranking and the sensitivity band are visible.
- WP5-4 (P4/P5) Given step 5, then the SMS preview shows encoding and segment count and the brief opens printable.
- WP5-5 (a11y) axe WCAG 2.2 AA: zero violations on every step; keyboard-only operation of slider, stepper and tables.
- WP5-6 (offline) Given every non-localhost request aborted, then all five steps render and work (shared with WP6).

TESTS: apps/web/e2e/command.spec.ts — one test per AC; Lime-in-data-view check; mobile 390 px layout check.
GATE TO PASS: npm run ci · node .orca-team/tools/gates.mjs e2e
MERGE ORDER: 4th (after WP1–WP4 endpoints are live), but start on fixtures right after WP0.

WORKER RULES: as in p2-wp0.md; commits "version-onsite-final: ui: …".
