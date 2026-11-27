"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { clsx } from "clsx";
import type { City, Ward } from "@/lib/api/client";
import { DEMO_CONFIG, type HorizonWindow } from "@/lib/demo-config";
import { UI_COPY, type Lang } from "@/lib/i18n";
import {
  useAllocationPlanQuery,
  useCreatePlanMutation,
  useDispatchNoticesQuery,
  useOverflowRouteQuery,
  usePlansListQuery,
  useSimulatorRunQuery,
  type AllocationRequest,
  type Deployment,
  type DispatchChannel,
  type DispatchRequest,
  type EfficacyPreset,
  type OverflowRequest,
  type PlanCreateRequest,
  type PlanRecord,
  type RunMeta,
  type Scope,
  type SimulatorRequest,
} from "./api";
import { PlanCompareDrawer } from "./PlanCompareDrawer";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { StepAllocate } from "./StepAllocate";
import { StepDispatch } from "./StepDispatch";
import { StepForecast } from "./StepForecast";
import { StepRoute } from "./StepRoute";
import { StepSimulate } from "./StepSimulate";

export type CommandStep = 1 | 2 | 3 | 4 | 5;

export interface CommandCenterViewProps {
  cities: readonly City[];
  wards: readonly Ward[];
  mondayWeeks: readonly string[];
  originWeek: string;
  windowKey: HorizonWindow;
  lang: Lang;
  step: CommandStep;
  onStepChange: (step: CommandStep) => void;
  onOriginWeekChange: (week: string) => void;
}

function windowBounds(windowKey: HorizonWindow): [number, number] {
  if (windowKey === "1w") return [1, 1];
  if (windowKey === "1-4w") return [1, 4];
  return [2, 4];
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function pickInitialWards(wards: readonly Ward[], count: number): string[] {
  const preferred: string[] = [];
  if (wards.some((w) => w.ward_id === DEMO_CONFIG.wardId)) {
    preferred.push(DEMO_CONFIG.wardId);
  }
  for (const w of wards) {
    if (preferred.length >= count) break;
    if (!preferred.includes(w.ward_id)) preferred.push(w.ward_id);
  }
  if (preferred.length === 0) {
    return [DEMO_CONFIG.wardId, "DSCC_Ward_07", "DSCC_Ward_01"].slice(0, count);
  }
  return preferred;
}

const VALID_SCOPES: ReadonlySet<string> = new Set<Scope>([
  "all",
  "Dhaka North",
  "Dhaka South",
  "Chattogram",
  "Gazipur",
  "Narayanganj",
]);

function parseScopeParam(raw: string | null): Scope {
  if (raw && VALID_SCOPES.has(raw)) return raw as Scope;
  return "all";
}

function parseIntParam(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseEfficacyParam(raw: string | null): EfficacyPreset {
  if (raw === "low" || raw === "base" || raw === "high") return raw;
  return "base";
}

export function CommandCenterView({
  cities,
  wards,
  mondayWeeks,
  originWeek,
  windowKey,
  lang,
  step,
  onStepChange,
  onOriginWeekChange,
}: CommandCenterViewProps) {
  const copy = UI_COPY[lang].command;
  const bn = lang === "bn";
  const searchParams = useSearchParams();
  const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Shared workflow state across steps 1–5 (hydrated from URL query for reload persistence; L6)
  const [scope, setScopeState] = useState<Scope>(() => parseScopeParam(searchParams.get("scope")));
  const [[hStart, hEnd], setWindowPair] = useState<[number, number]>(() =>
    windowBounds(windowKey),
  );

  // Step 2: Allocation state (debounced 150 ms for live slider re-solve)
  const [stockPct, setStockPct] = useState<number>(() =>
    parseIntParam(searchParams.get("stock"), 30, 100, 100),
  );
  const [totalCrews, setTotalCrews] = useState<number>(() =>
    parseIntParam(searchParams.get("crews"), 0, 60, 10),
  );
  const equityFloorPct = 20;
  const debouncedStockPct = useDebouncedValue(stockPct, 150);
  const debouncedCrews = useDebouncedValue(totalCrews, 150);

  // Step 3: Overflow routing state
  const [routeHorizon, setRouteHorizon] = useState<number>(() =>
    parseIntParam(searchParams.get("routeHorizon"), 1, 4, 3),
  );
  const [routeServiceLevel, setRouteServiceLevel] = useState<number>(0.9);
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>({});
  const debouncedOverrides = useDebouncedValue(capacityOverrides, 200);

  // Step 4: Counterfactual simulator state (seeded with 3 wards for immediate ROI visibility)
  const [simMode, setSimMode] = useState<"manual" | "auto">("manual");
  const [customDeployments, setCustomDeployments] = useState<Deployment[] | null>(null);
  const [simAutoCrews, setSimAutoCrews] = useState<number>(10);
  const [simEfficacy, setSimEfficacy] = useState<EfficacyPreset>(() =>
    parseEfficacyParam(searchParams.get("simEfficacy")),
  );
  const debouncedAutoCrews = useDebouncedValue(simAutoCrews, 150);

  // Sync Command Center scenario parameters into URL query string so reload preserves state (L6).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("step", String(step));
    params.set("scope", scope);
    params.set("stock", String(stockPct));
    params.set("crews", String(totalCrews));
    params.set("routeHorizon", String(routeHorizon));
    params.set("simEfficacy", simEfficacy);
    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch) {
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
  }, [step, scope, stockPct, totalCrews, routeHorizon, simEfficacy]);

  const scopeWards = useMemo(
    () => (scope === "all" ? wards : wards.filter((w) => w.city === scope)),
    [wards, scope],
  );

  const defaultDeployments = useMemo<Deployment[]>(
    () => pickInitialWards(wards, 3).map((ward_id) => ({ ward_id, crews: 2 })),
    [wards],
  );
  const simDeployments = customDeployments ?? defaultDeployments;

  // Step 5: Dispatch state (L10: default wards strictly from current scope)
  const [dispatchTargetMode, setDispatchTargetMode] = useState<"scope" | "wards">("wards");
  const [customDispatchWards, setCustomDispatchWards] = useState<string[] | null>(null);
  const [dispatchChannels, setDispatchChannels] = useState<DispatchChannel[]>([
    "sms",
    "whatsapp",
    "brief",
  ]);
  const [noticeLangOverride, setNoticeLangOverride] = useState<Lang | null>(null);
  const [savedAllocationPlanId, setSavedAllocationPlanId] = useState<string | null>(null);
  const [useSavedPlan, setUseSavedPlan] = useState<boolean>(false);

  const setScope = useCallback((next: Scope) => {
    setScopeState(next);
    // Reset manual dispatch ward picks and capacity overrides when scope changes (L10/L2).
    setCustomDispatchWards(null);
    setCapacityOverrides({});
  }, []);

  const defaultDispatchWards = useMemo(() => pickInitialWards(scopeWards, 3), [scopeWards]);
  const dispatchWardIds = useMemo(() => {
    if (!customDispatchWards) return defaultDispatchWards;
    if (scope === "all") return customDispatchWards;
    const allowed = new Set(scopeWards.map((w) => w.ward_id));
    const filtered = customDispatchWards.filter((id) => allowed.has(id));
    return filtered.length > 0 ? filtered : defaultDispatchWards;
  }, [customDispatchWards, defaultDispatchWards, scope, scopeWards]);
  const noticeLang: Lang = noticeLangOverride ?? lang;

  // Plan save + compare drawer state
  const [compareOpen, setCompareOpen] = useState(false);
  const [lastSavedPlan, setLastSavedPlan] = useState<PlanRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Typed request payloads
  const allocationReq = useMemo<AllocationRequest>(
    () => ({
      scope,
      origin_week: originWeek,
      h_start: hStart,
      h_end: hEnd,
      stock_pct: debouncedStockPct,
      total_crews: debouncedCrews,
      service_level: null,
      equity_floor_pct: equityFloorPct,
    }),
    [scope, originWeek, hStart, hEnd, debouncedStockPct, debouncedCrews, equityFloorPct],
  );

  const overflowReq = useMemo<OverflowRequest>(
    () => ({
      scope,
      origin_week: originWeek,
      horizon: routeHorizon,
      service_level: routeServiceLevel,
      capacity_overrides: debouncedOverrides,
    }),
    [scope, originWeek, routeHorizon, routeServiceLevel, debouncedOverrides],
  );

  const simulatorReq = useMemo<SimulatorRequest | null>(() => {
    if (simMode === "auto") {
      return {
        origin_week: originWeek,
        auto_crews: debouncedAutoCrews,
        deployments: null,
        efficacy: simEfficacy,
      };
    }
    if (simDeployments.length === 0) return null;
    return {
      origin_week: originWeek,
      deployments: simDeployments,
      auto_crews: null,
      efficacy: simEfficacy,
    };
  }, [simMode, originWeek, debouncedAutoCrews, simDeployments, simEfficacy]);

  const dispatchReq = useMemo<DispatchRequest | null>(() => {
    if (dispatchChannels.length === 0) return null;
    if (dispatchTargetMode === "wards") {
      if (dispatchWardIds.length === 0) return null;
      return {
        origin_week: originWeek,
        ward_ids: dispatchWardIds,
        scope: null,
        channels: dispatchChannels,
        lang: noticeLang,
        plan_id: useSavedPlan ? savedAllocationPlanId : null,
        stock_pct: debouncedStockPct,
        total_crews: debouncedCrews,
      };
    }
    return {
      origin_week: originWeek,
      ward_ids: null,
      scope,
      channels: dispatchChannels,
      lang: noticeLang,
      plan_id: useSavedPlan ? savedAllocationPlanId : null,
      stock_pct: debouncedStockPct,
      total_crews: debouncedCrews,
    };
  }, [
    dispatchChannels,
    dispatchTargetMode,
    dispatchWardIds,
    originWeek,
    noticeLang,
    useSavedPlan,
    savedAllocationPlanId,
    debouncedStockPct,
    debouncedCrews,
    scope,
  ]);

  // Queries — only actively fetch the needed slice for the active step
  const allocationQuery = useAllocationPlanQuery(allocationReq, step === 1 || step === 2);
  const overflowQuery = useOverflowRouteQuery(overflowReq, step === 3);
  const simulatorQuery = useSimulatorRunQuery(simulatorReq, step === 4);
  const dispatchQuery = useDispatchNoticesQuery(dispatchReq, step === 5);
  const plansCountQuery = usePlansListQuery(undefined, true);
  const createPlanMutation = useCreatePlanMutation();

  // Active provenance envelope & solve latency
  const activeRunState = useMemo<{
    meta: RunMeta | null;
    solveMs: number | null;
    isFetching: boolean;
  }>(() => {
    if (step === 1 || step === 2) {
      const d = allocationQuery.data;
      return {
        meta: d ?? null,
        solveMs: d?.solve_ms ?? null,
        isFetching: allocationQuery.isFetching,
      };
    }
    if (step === 3) {
      const d = overflowQuery.data;
      return {
        meta: d ?? null,
        solveMs: d?.solve_ms ?? null,
        isFetching: overflowQuery.isFetching,
      };
    }
    if (step === 4) {
      const d = simulatorQuery.data;
      return {
        meta: d ?? null,
        solveMs: null,
        isFetching: simulatorQuery.isFetching,
      };
    }
    const d = dispatchQuery.data;
    return {
      meta: d ?? null,
      solveMs: null,
      isFetching: dispatchQuery.isFetching,
    };
  }, [step, allocationQuery, overflowQuery, simulatorQuery, dispatchQuery]);

  const defaultPlanLabel = useMemo(() => {
    if (step === 1 || step === 2) {
      return `${scope} · ${stockPct}% stock · ${totalCrews} crews`;
    }
    if (step === 3) {
      return `${scope} · overflow +${routeHorizon}w`;
    }
    if (step === 4) {
      return simMode === "auto"
        ? `Auto ${simAutoCrews} crews (${simEfficacy})`
        : `${simDeployments.length} wards (${simEfficacy})`;
    }
    return `Dispatch ${noticeLang.toUpperCase()} · ${stockPct}% stock`;
  }, [
    step,
    scope,
    stockPct,
    totalCrews,
    routeHorizon,
    simMode,
    simAutoCrews,
    simEfficacy,
    simDeployments.length,
    noticeLang,
  ]);

  const handleSavePlan = useCallback(
    (label: string) => {
      setSaveError(null);
      let payload: PlanCreateRequest | null = null;
      if (step === 1 || step === 2) {
        payload = {
          kind: "allocation",
          label,
          request: {
            ...allocationReq,
            stock_pct: stockPct,
            total_crews: totalCrews,
          },
        };
      } else if (step === 3) {
        payload = {
          kind: "overflow",
          label,
          request: {
            ...overflowReq,
            capacity_overrides: capacityOverrides,
          },
        };
      } else if (step === 4 && simulatorReq) {
        payload = {
          kind: "simulation",
          label,
          request: simulatorReq,
        };
      } else if (step === 5 && dispatchReq) {
        payload = {
          kind: "dispatch",
          label,
          request: dispatchReq,
        };
      }
      if (!payload) return;

      createPlanMutation.mutate(payload, {
        onSuccess: (record) => {
          setLastSavedPlan(record);
          if (record.kind === "allocation") {
            setSavedAllocationPlanId(record.id);
          }
        },
        onError: (err) => {
          setSaveError(err.detail ?? err.title ?? copy.provenance.saveFailedFallback);
        },
      });
    },
    [
      step,
      allocationReq,
      stockPct,
      totalCrews,
      overflowReq,
      capacityOverrides,
      simulatorReq,
      dispatchReq,
      createPlanMutation,
      copy.provenance.saveFailedFallback,
    ],
  );

  const steps: ReadonlyArray<{ num: CommandStep; label: string; subtitle: string }> = [
    { num: 1, label: copy.steps.forecast, subtitle: copy.stepSubtitles.forecast },
    { num: 2, label: copy.steps.allocate, subtitle: copy.stepSubtitles.allocate },
    { num: 3, label: copy.steps.route, subtitle: copy.stepSubtitles.route },
    { num: 4, label: copy.steps.simulate, subtitle: copy.stepSubtitles.simulate },
    { num: 5, label: copy.steps.dispatch, subtitle: copy.stepSubtitles.dispatch },
  ];

  const handleStepperKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    let nextIdx: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIdx = (idx + 1) % steps.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIdx = (idx - 1 + steps.length) % steps.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = steps.length - 1;
    }
    if (nextIdx !== null) {
      event.preventDefault();
      const target = steps[nextIdx];
      onStepChange(target.num);
      stepButtonRefs.current[nextIdx]?.focus();
    }
  };

  const handleCapacityOverrideChange = (wardId: string, capacity: number | null) => {
    setCapacityOverrides((prev) => {
      const next = { ...prev };
      if (capacity === null) {
        delete next[wardId];
      } else {
        next[wardId] = capacity;
      }
      return next;
    });
  };

  const handleToggleDispatchWard = (wardId: string) => {
    setCustomDispatchWards((prev) => {
      const current = prev ?? defaultDispatchWards;
      if (current.includes(wardId)) {
        if (current.length <= 1) return current;
        return current.filter((id) => id !== wardId);
      }
      return [...current, wardId];
    });
  };

  const handleToggleChannel = (ch: DispatchChannel) => {
    setDispatchChannels((prev) => {
      if (prev.includes(ch)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== ch);
      }
      return [...prev, ch];
    });
  };

  return (
    <div data-testid="command-center-view" className="space-y-4">
      {/* 5-step operational stepper */}
      <nav
        aria-label={copy.navAria}
        className="rounded-[16px] bg-white p-2 text-ink ring-1 ring-mist/90"
      >
        <div
          role="tablist"
          aria-label={copy.tablistAria}
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
        >
          {steps.map((s, idx) => {
            const active = step === s.num;
            const completed = s.num < step;
            return (
              <button
                key={s.num}
                ref={(el) => {
                  stepButtonRefs.current[idx] = el;
                }}
                id={`command-step-tab-${s.num}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="command-step-panel"
                tabIndex={active ? 0 : -1}
                data-testid={`command-step-${s.num}`}
                onClick={() => onStepChange(s.num)}
                onKeyDown={(e) => handleStepperKeyDown(e, idx)}
                lang={lang}
                className={clsx(
                  "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                  bn && "font-bangla",
                  active
                    ? "border-royal bg-royal text-white"
                    : completed
                      ? "border-mist bg-paper text-navy hover:border-royal"
                      : "border-mist bg-white text-navy hover:border-royal hover:bg-paper/60",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-xs font-bold tnum",
                    active
                      ? "bg-white text-navy"
                      : completed
                        ? "bg-navy text-white"
                        : "bg-paper text-navy ring-1 ring-mist",
                  )}
                >
                  {s.num}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold leading-tight">
                    {s.label}
                  </span>
                  <span
                    className={clsx(
                      "block truncate text-[11px] leading-tight",
                      active ? "text-white" : "text-slate",
                    )}
                  >
                    {s.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Provenance Strip + Save-as-Plan + Compare Plans (visible on every step) */}
      <ProvenanceStrip
        meta={activeRunState.meta}
        solveMs={activeRunState.solveMs}
        isFetching={activeRunState.isFetching}
        lang={lang}
        defaultPlanLabel={defaultPlanLabel}
        onSavePlan={handleSavePlan}
        isSavingPlan={createPlanMutation.isPending}
        savedPlan={lastSavedPlan}
        saveError={saveError}
        onOpenCompare={() => setCompareOpen(true)}
        savedPlanCount={plansCountQuery.data?.plans.length ?? null}
      />

      {/* Active step tabpanel */}
      <div
        id="command-step-panel"
        role="tabpanel"
        aria-labelledby={`command-step-tab-${step}`}
      >
        {step === 1 ? (
          <StepForecast
            cities={cities}
            mondayWeeks={mondayWeeks}
            scope={scope}
            originWeek={originWeek}
            hStart={hStart}
            hEnd={hEnd}
            lang={lang}
            data={allocationQuery.data}
            isPending={allocationQuery.isPending}
            isError={allocationQuery.isError}
            error={allocationQuery.error}
            onRetry={() => {
              void allocationQuery.refetch();
            }}
            onScopeChange={setScope}
            onOriginWeekChange={onOriginWeekChange}
            onWindowChange={(s, e) => setWindowPair([s, e])}
            onProceed={() => onStepChange(2)}
          />
        ) : null}

        {step === 2 ? (
          <StepAllocate
            stockPct={stockPct}
            totalCrews={totalCrews}
            equityFloorPct={equityFloorPct}
            lang={lang}
            data={allocationQuery.data}
            isPending={allocationQuery.isPending}
            isFetching={allocationQuery.isFetching}
            isError={allocationQuery.isError}
            error={allocationQuery.error}
            onRetry={() => {
              void allocationQuery.refetch();
            }}
            onStockPctChange={setStockPct}
            onTotalCrewsChange={setTotalCrews}
          />
        ) : null}

        {step === 3 ? (
          <StepRoute
            originWeek={originWeek}
            horizon={routeHorizon}
            serviceLevel={routeServiceLevel}
            capacityOverrides={capacityOverrides}
            lang={lang}
            data={overflowQuery.data}
            isPending={overflowQuery.isPending}
            isFetching={overflowQuery.isFetching}
            isError={overflowQuery.isError}
            error={overflowQuery.error}
            onRetry={() => {
              void overflowQuery.refetch();
            }}
            onHorizonChange={setRouteHorizon}
            onServiceLevelChange={setRouteServiceLevel}
            onCapacityOverrideChange={handleCapacityOverrideChange}
            onResetOverrides={() => setCapacityOverrides({})}
            onJumpShoulderWeek={() => {
              onOriginWeekChange("2024-08-12");
              setRouteHorizon(3);
            }}
          />
        ) : null}

        {step === 4 ? (
          <StepSimulate
            wards={wards}
            mode={simMode}
            deployments={simDeployments}
            autoCrews={simAutoCrews}
            efficacy={simEfficacy}
            lang={lang}
            data={simulatorQuery.data}
            isPending={simulatorQuery.isPending}
            isFetching={simulatorQuery.isFetching}
            isError={simulatorQuery.isError}
            error={simulatorQuery.error}
            onRetry={() => {
              void simulatorQuery.refetch();
            }}
            onModeChange={setSimMode}
            onDeploymentsChange={(next) => setCustomDeployments(next)}
            onAutoCrewsChange={setSimAutoCrews}
            onEfficacyChange={setSimEfficacy}
          />
        ) : null}

        {step === 5 ? (
          <StepDispatch
            scope={scope}
            originWeek={originWeek}
            stockPct={stockPct}
            totalCrews={totalCrews}
            wards={wards}
            targetMode={dispatchTargetMode}
            selectedWardIds={dispatchWardIds}
            channels={dispatchChannels}
            noticeLang={noticeLang}
            savedAllocationPlanId={savedAllocationPlanId}
            useSavedPlan={useSavedPlan}
            uiLang={lang}
            data={dispatchQuery.data}
            isPending={dispatchQuery.isPending}
            isFetching={dispatchQuery.isFetching}
            isError={dispatchQuery.isError}
            error={dispatchQuery.error}
            onRetry={() => {
              void dispatchQuery.refetch();
            }}
            onTargetModeChange={setDispatchTargetMode}
            onToggleWardId={handleToggleDispatchWard}
            onToggleChannel={handleToggleChannel}
            onNoticeLangChange={(l) => setNoticeLangOverride(l)}
            onUseSavedPlanChange={setUseSavedPlan}
          />
        ) : null}
      </div>

      {/* Bottom step navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-white px-4 py-3 text-ink ring-1 ring-mist/90">
        <button
          type="button"
          data-testid="command-prev-step"
          disabled={step === 1}
          onClick={() => onStepChange((step - 1) as CommandStep)}
          lang={lang}
          className={clsx(
            "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-mist bg-white px-4 py-2 text-xs font-semibold text-navy hover:border-royal hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45",
            bn && "font-bangla",
          )}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4 text-royal" />
          <span>{copy.previousStep}</span>
        </button>

        <span
          lang={lang}
          className={clsx("font-mono text-xs font-semibold text-slate tnum", bn && "font-bangla")}
        >
          {copy.stepCounter(step, scope, originWeek)}
        </span>

        <button
          type="button"
          data-testid="command-next-step"
          disabled={step === 5}
          onClick={() => onStepChange((step + 1) as CommandStep)}
          lang={lang}
          className={clsx(
            "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:opacity-45",
            bn && "font-bangla",
          )}
        >
          <span>{copy.nextStep}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <PlanCompareDrawer
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        lang={lang}
      />
    </div>
  );
}
