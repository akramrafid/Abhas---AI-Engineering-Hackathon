"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_META, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SelectField, type SelectOption } from "@/components/ui/Select";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import type { ApiError, City, RiskTier } from "@/lib/api/client";
import { formatOriginWeekOption } from "@/lib/dates";
import { UI_COPY, type Lang } from "@/lib/i18n";
import type { AllocationResponse, Scope } from "./api";

export interface StepForecastProps {
  cities: readonly City[];
  mondayWeeks: readonly string[];
  scope: Scope;
  originWeek: string;
  hStart: number;
  hEnd: number;
  lang: Lang;
  data: AllocationResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onScopeChange: (scope: Scope) => void;
  onOriginWeekChange: (week: string) => void;
  onWindowChange: (hStart: number, hEnd: number) => void;
  onProceed: () => void;
}

export function StepForecast({
  cities,
  mondayWeeks,
  scope,
  originWeek,
  hStart,
  hEnd,
  lang,
  data,
  isPending,
  isError,
  error,
  onRetry,
  onScopeChange,
  onOriginWeekChange,
  onWindowChange,
  onProceed,
}: StepForecastProps) {
  const [tierFilter, setTierFilter] = useState<RiskTier | "ALL">("ALL");
  const copy = UI_COPY[lang].command;
  const s1 = copy.step1;
  const bn = lang === "bn";

  const horizonOptions = useMemo<SelectOption[]>(
    () =>
      ([1, 2, 3, 4] as const).map((h) => ({
        value: String(h),
        label: s1.horizonOptions[h],
      })),
    [s1.horizonOptions],
  );

  const scopeOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: copy.scopeAll },
      ...cities.map((c) => ({ value: c, label: c })),
    ],
    [cities, copy.scopeAll],
  );

  const weekOptions = useMemo<SelectOption[]>(
    () =>
      mondayWeeks.map((w) => ({
        value: w,
        label: formatOriginWeekOption(w),
      })),
    [mondayWeeks],
  );

  const wards = useMemo(() => data?.wards ?? [], [data?.wards]);
  const visibleWards = useMemo(() => {
    if (tierFilter === "ALL") return wards;
    return wards.filter((w) => w.tier === tierFilter);
  }, [wards, tierFilter]);

  const summary = useMemo(() => {
    let expectedTotal = 0;
    let plannedTotal = 0;
    let criticalCount = 0;
    for (const w of wards) {
      expectedTotal += w.expected_cases;
      plannedTotal += w.planned_cases;
      if (w.tier === "Critical") criticalCount += 1;
    }
    return {
      wardCount: wards.length,
      criticalCount,
      expectedTotal,
      plannedTotal,
    };
  }, [wards]);

  return (
    <div data-testid="command-panel-1" className="space-y-5">
      {/* Scope, origin week, and window controls */}
      <Card>
        <CardHeader>
          <CardTitle lang={lang} className={bn ? "font-bangla" : undefined}>
            {s1.title}
          </CardTitle>
          <CardDescription lang={lang} className={bn ? "font-bangla" : undefined}>
            {s1.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              id="command-scope-select"
              testId="command-scope-select"
              label={copy.scopeLabel}
              value={scope}
              options={scopeOptions}
              onChange={(e) => onScopeChange(e.target.value as Scope)}
            />
            <SelectField
              id="command-origin-select"
              testId="command-origin-select"
              label={copy.originLabel}
              mono
              value={originWeek}
              options={weekOptions}
              onChange={(e) => onOriginWeekChange(e.target.value)}
            />
            <SelectField
              id="command-h-start"
              testId="command-h-start"
              label={copy.windowStartLabel}
              mono
              value={String(hStart)}
              options={horizonOptions}
              onChange={(e) => {
                const nextStart = Number(e.target.value);
                onWindowChange(nextStart, Math.max(nextStart, hEnd));
              }}
            />
            <SelectField
              id="command-h-end"
              testId="command-h-end"
              label={copy.windowEndLabel}
              mono
              value={String(hEnd)}
              options={horizonOptions.filter((o) => Number(o.value) >= hStart)}
              onChange={(e) => {
                const nextEnd = Number(e.target.value);
                onWindowChange(hStart, Math.max(hStart, nextEnd));
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step1-error-banner"
          retryTestId="step1-retry"
          title={s1.errorTitle}
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton testId="step1-loading" label={s1.loadingLabel} />
      ) : null}

      {!isError && data && wards.length === 0 ? (
        <EmptyState
          testId="step1-empty"
          title={s1.emptyTitle}
          description={s1.emptyDescription}
        />
      ) : null}

      {!isError && data && wards.length > 0 ? (
        <>
          {/* Summary KPI strip */}
          <div data-testid="step1-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p lang={lang} className={clsx("text-xs font-semibold text-slate", bn && "font-bangla")}>
                {s1.kpiWards}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {summary.wardCount}
              </p>
              <p lang={lang} className={clsx("mt-1 text-xs text-slate", bn && "font-bangla")}>
                {s1.kpiWindowNote(hStart, hEnd)}
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p lang={lang} className={clsx("text-xs font-semibold text-slate", bn && "font-bangla")}>
                {s1.kpiCritical}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-ink tnum">
                {summary.criticalCount}
              </p>
              <p lang={lang} className={clsx("mt-1 text-xs text-slate", bn && "font-bangla")}>
                {s1.kpiCriticalNote}
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p lang={lang} className={clsx("text-xs font-semibold text-slate", bn && "font-bangla")}>
                {s1.kpiExpected}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {summary.expectedTotal.toFixed(1)}
              </p>
              <p lang={lang} className={clsx("mt-1 text-xs text-slate", bn && "font-bangla")}>
                {s1.kpiExpectedNote}
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p lang={lang} className={clsx("text-xs font-semibold text-slate", bn && "font-bangla")}>
                {s1.kpiPlanned}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-royal tnum">
                {summary.plannedTotal.toFixed(1)}
              </p>
              <p lang={lang} className={clsx("mt-1 text-xs text-slate", bn && "font-bangla")}>
                {s1.kpiPlannedNote}
              </p>
            </div>
          </div>

          {/* Ward forecast demand table */}
          <Card className="overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle lang={lang} className={bn ? "font-bangla" : undefined}>
                  {s1.tableTitle(visibleWards.length, wards.length)}
                </CardTitle>
                <CardDescription lang={lang} className={bn ? "font-bangla" : undefined}>
                  {s1.tableDescription}
                </CardDescription>
              </div>
              <button
                type="button"
                data-testid="step1-next-btn"
                onClick={onProceed}
                lang={lang}
                className={clsx(
                  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy",
                  bn && "font-bangla",
                )}
              >
                {s1.proceedBtn}
              </button>
            </CardHeader>

            <CardContent className="border-b border-mist bg-paper py-3">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={s1.filterAria}
              >
                <button
                  type="button"
                  aria-pressed={tierFilter === "ALL"}
                  onClick={() => setTierFilter("ALL")}
                  lang={lang}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
                    bn && "font-bangla",
                    tierFilter === "ALL"
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  {s1.filterAll(wards.length)}
                </button>
                {([...TIER_ORDER].reverse() as RiskTier[]).map((tier) => {
                  const count = wards.filter((w) => w.tier === tier).length;
                  return (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={tierFilter === tier}
                      onClick={() => setTierFilter(tier)}
                      lang={lang}
                      className={clsx(
                        "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold tnum",
                        bn ? "font-bangla" : "font-mono",
                        tierFilter === tier
                          ? "border-royal bg-royal text-white"
                          : "border-mist bg-white text-navy hover:bg-paper",
                      )}
                    >
                      {bn ? TIER_META[tier].labelBn : tier} ({count})
                    </button>
                  );
                })}
              </div>
            </CardContent>

            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={s1.tableAria}
            >
              <table
                data-testid="step1-forecast-table"
                className="w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr
                    lang={lang}
                    className={clsx(
                      "border-b border-mist bg-paper text-xs font-semibold text-slate",
                      bn && "font-bangla",
                    )}
                  >
                    <th scope="col" className="px-3.5 py-2.5">
                      {s1.colWard}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s1.colCity}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s1.colTier}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      {s1.colExpected}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      {s1.colPlanned}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      {s1.colPriority}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      {s1.colSupplies}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist bg-white">
                  {visibleWards.map((w) => (
                    <tr
                      key={w.ward_id}
                      data-testid={`step1-row-${w.ward_id}`}
                      className="hover:bg-paper/60"
                    >
                      <th
                        scope="row"
                        className="px-3.5 py-3 font-mono text-xs font-bold text-navy tnum"
                      >
                        {w.ward_id}
                      </th>
                      <td className="px-3.5 py-3 text-xs text-slate">{w.city}</td>
                      <td className="px-3.5 py-3">
                        <RiskTierBadge tier={w.tier} size="sm" lang={lang} />
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-xs font-semibold text-ink tnum">
                        {w.expected_cases.toFixed(1)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-xs font-bold text-navy tnum">
                        {w.planned_cases.toFixed(1)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-xs text-slate tnum">
                        {w.priority_weight.toFixed(2)}
                        <span className="ml-1 text-[11px]">
                          (×{w.density_factor.toFixed(2)})
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-xs text-navy tnum">
                        {w.saline_bags.required} / {w.diagnostic_kits.required} /{" "}
                        {w.hospital_beds.required}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
