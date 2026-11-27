# Merge Check — `akramrafid/p2-wp5` (Command Center 5-Step UI)

_Type: integration check — cross-family review by Opus at the end._

- **Branch**: `akramrafid/p2-wp5` → `version-onsite-final`
- **Owned paths verified**:
  - `apps/web/src/features/command/**` (10 files: `api.ts`, `CommandCenterView.tsx`, `DeficitBadge.tsx`, `PlanCompareDrawer.tsx`, `ProvenanceStrip.tsx`, `StepForecast.tsx`, `StepAllocate.tsx`, `StepRoute.tsx`, `StepSimulate.tsx`, `StepDispatch.tsx`)
  - `apps/web/src/lib/i18n.ts`
  - `apps/web/src/components/dashboard/shell/views.ts`
  - `apps/web/src/app/dashboard/page.tsx`
  - `apps/web/e2e/command.spec.ts`
  - `.orca-team/handoff/p2-wp5.md`
- **Contract match**: Strictly imports generated TypeScript schemas from `@/lib/api/schema`; aligns `tab-command` and `command-step-1..5` test IDs with `apps/web/e2e/offline.spec.ts`.
- **Checks & invariants proven**:
  - `tsc --noEmit`: 0 errors · `eslint`: 0 errors.
  - Strictly zero Lime (`#D4F53C`) tokens anywhere inside `[data-view="data"]`.
  - Covers all 5 operational steps, live debounced slider re-solve, Save-as-Plan + Compare Plans drawer, EN/BN dispatch toggle, and WCAG 2.2 AA E2E assertions.

Verdict: MERGE
