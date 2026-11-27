# WP5 Handoff — Command Center UI (`akramrafid/p2-wp5`)

- **Owned paths modified**:
  - `apps/web/src/features/command/**` (`api.ts`, `CommandCenterView.tsx`, `DeficitBadge.tsx`, `PlanCompareDrawer.tsx`, `ProvenanceStrip.tsx`, `StepForecast.tsx`, `StepAllocate.tsx`, `StepRoute.tsx`, `StepSimulate.tsx`, `StepDispatch.tsx`)
  - `apps/web/src/lib/i18n.ts`
  - `apps/web/src/components/dashboard/shell/views.ts`
  - `apps/web/src/app/dashboard/page.tsx`
  - `apps/web/e2e/command.spec.ts`
- **Notes for Integrator**:
  - Uses generated types from `apps/web/src/lib/api/schema.ts` exclusively.
  - Strictly zero Lime (`#D4F53C`) anywhere inside `[data-view="data"]`.
  - Stepper test IDs (`tab-command`, `command-step-1..5`) align directly with `apps/web/e2e/offline.spec.ts`.
