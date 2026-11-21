ROLE: UI · role 10 Frontend engineer · hat build
LEAD_BRANCH: lead   TASK: fix-r1-ui — Fix r1 findings CR-2 (HIGH), CR-9 (banner), CR-18 + design-hook finding
OWNED PATHS: apps/web/src/** (not src/features/brand/**) · apps/web/e2e/** · apps/web/package.json
FINDINGS TO FIX:
  CR-2 HIGH: the demo scenario baseline must be a non-Critical ward-week with < 20 mm rain in the origin week
       (AC-7). Find one with GET /api/v1/wards/{id}/history (Dhaka South preferred, Monday 2016-02-29…2025-12-29,
       ideally pre-monsoon May/June so 120 mm is a realistic what-if). Add DEMO_CONFIG.scenarioBaseline {wardId,
       originWeek} with a comment stating its observed rain; in demo mode the ScenarioPanel uses it. Write the
       chosen ward and week into your worker_done report (LEAD records it in docs/demo.md).
       e2e ac_7: assert scenario h=3 expected_cases > baseline h=3 expected_cases (will be meaningful once the
       real model merges; keep it passing on the stub).
  CR-9: when model_version starts with "stub", show a visible "Sample data — model not loaded" banner on the
       forecast, heatmap and validation views (tokens only; no Lime in data views).
  CR-18: axe scan in e2e must fail on ANY WCAG A/AA violation (or list explicit justified exclusions); fix what it finds.
  Design hook: apps/web/src/features/ward-risk/components/WardForecastView.tsx:262 uses a thick one-side accent
       border ("side-tab", an AI-UI tell). Replace with a subtler treatment consistent with docs/brand/BRAND.md.
GATE TO PASS: node .orca-team/tools/gates.mjs e2e  (+ npm run ci)
SKILLS: production-standards, production-hardening, receiving-code-review, verification-before-completion, frontend-engineering, frontend-design, web-design-guidelines, webapp-testing
READ FIRST: .orca-team/reviews/r1-code.md (the findings below quote file:line and the exact fix), AGENTS.md §6, docs/PRD.md.
DONE WHEN: each finding has a test proving the fix where testable (name tests after the CR id, e.g. test_cr_7_...),
  `npm run ci` is green, the gates listed below pass, and your worker_done report maps finding → commit → test.
  Small commits on your branch: "ui: fix CR-n <what>". Never edit files outside OWNED PATHS; need one → orca orchestration ask LEAD.
  Claude Opus reviews your branch before merge.
