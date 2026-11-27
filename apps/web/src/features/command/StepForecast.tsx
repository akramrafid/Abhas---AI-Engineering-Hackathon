"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
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

const HORIZON_OPTIONS: readonly SelectOption[] = [
  { value: "1", label: "+1w (Next week)" },
  { value: "2", label: "+2w (2 weeks ahead)" },
  { value: "3", label: "+3w (3 weeks ahead)" },
  { value: "4", label: "+4w (4 weeks ahead)" },
];

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
  const bn = lang === "bn";

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
          <CardTitle className={bn ? "font-bangla" : undefined}>
            {bn
              ? "ধাপ ১ · পূর্বাভাস ও চাহিদা নির্ধারণ"
              : "Step 1 · Forecast scope & demand window"}
          </CardTitle>
          <CardDescription className={bn ? "font-bangla" : undefined}>
            {bn
              ? "নগর বা সকল ৬০ ওয়ার্ডের জন্য সূচনা সপ্তাহ এবং পূর্বাভাস সময়কাল নির্বাচন করুন।"
              : "Choose city scope, Monday origin week, and planning horizons (h_start–h_end). Window quantiles size saline, kits, and hospital bed demand."}
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
              options={HORIZON_OPTIONS}
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
              options={HORIZON_OPTIONS.filter((o) => Number(o.value) >= hStart)}
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
          title="Could not load forecast demand window"
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton
          testId="step1-loading"
          label="Computing ward forecast demand across planning window…"
        />
      ) : null}

      {!isError && data && wards.length === 0 ? (
        <EmptyState
          testId="step1-empty"
          title="No wards returned for this scope"
          description="Select another city or origin week to review ward forecasts."
        />
      ) : null}

      {!isError && data && wards.length > 0 ? (
        <>
          {/* Summary KPI strip */}
          <div
            data-testid="step1-kpis"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Wards in scope</p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {summary.wardCount}
              </p>
              <p className="mt-1 text-xs text-slate">
                Window +{hStart}w to +{hEnd}w
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Critical tier wards</p>
              <p className="mt-2 font-mono text-2xl font-bold text-ink tnum">
                {summary.criticalCount}
              </p>
              <p className="mt-1 text-xs text-slate">Peak tier across window</p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Expected cases</p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {summary.expectedTotal.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-slate">Sum of horizon means</p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Planned cases</p>
              <p className="mt-2 font-mono text-2xl font-bold text-royal tnum">
                {summary.plannedTotal.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-slate">Window quantile sizing basis</p>
            </div>
          </div>

          {/* Ward forecast demand table */}
          <Card className="overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>
                  Ward demand forecast ({visibleWards.length} of {wards.length})
                </CardTitle>
                <CardDescription>
                  Sorted by city and priority weight. Proceed to Step 2 to allocate limited supplies.
                </CardDescription>
              </div>
              <button
                type="button"
                data-testid="step1-next-btn"
                onClick={onProceed}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy"
              >
                {bn ? "বণ্টন ধাপে যান →" : "Proceed to Allocate →"}
              </button>
            </CardHeader>

            <CardContent className="border-b border-mist bg-paper py-3">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Filter forecast wards by risk tier"
              >
                <button
                  type="button"
                  aria-pressed={tierFilter === "ALL"}
                  onClick={() => setTierFilter("ALL")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
                    tierFilter === "ALL"
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  All ({wards.length})
                </button>
                {([...TIER_ORDER].reverse() as RiskTier[]).map((tier) => {
                  const count = wards.filter((w) => w.tier === tier).length;
                  return (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={tierFilter === tier}
                      onClick={() => setTierFilter(tier)}
                      className={clsx(
                        "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                        tierFilter === tier
                          ? "border-royal bg-royal text-white"
                          : "border-mist bg-white text-navy hover:bg-paper",
                      )}
                    >
                      {tier} ({count})
                    </button>
                  );
                })}
              </div>
            </CardContent>

            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Command Center Step 1 ward forecast table"
            >
              <table
                data-testid="step1-forecast-table"
                className="w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                    <th scope="col" className="px-3.5 py-2.5">
                      Ward
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      City
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Peak Risk Tier
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Expected Cases
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Planned Cases
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Priority Wt
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Saline / Kits / Beds Req.
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
