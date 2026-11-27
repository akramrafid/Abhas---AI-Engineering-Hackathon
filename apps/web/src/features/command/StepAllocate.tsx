"use client";

import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { SliderField } from "@/components/ui/Slider";
import type { ApiError } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import type { AllocationResponse, ResourceLine } from "./api";
import { DeficitBadge } from "./DeficitBadge";

export interface StepAllocateProps {
  stockPct: number;
  totalCrews: number;
  equityFloorPct: number;
  lang: Lang;
  data: AllocationResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onStockPctChange: (pct: number) => void;
  onTotalCrewsChange: (crews: number) => void;
}

const STOCK_PRESETS = [100, 80, 60, 45, 30] as const;

const RESOURCE_LABELS: Record<
  "saline_bags" | "diagnostic_kits" | "hospital_beds",
  string
> = {
  saline_bags: "Saline bags",
  diagnostic_kits: "Diagnostic kits",
  hospital_beds: "Hospital beds",
};

function ResourceBarCell({
  label,
  wardId,
  line,
}: {
  label: string;
  wardId: string;
  line: ResourceLine;
}) {
  const pct = Math.max(0, Math.min(100, line.fulfilment_pct));
  const hasDeficit = line.deficit > 0;
  return (
    <div className="min-w-[116px] space-y-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tnum">
        <span className="font-semibold text-ink">
          {line.allocated}/{line.required}
        </span>
        <span className={clsx("text-[11px]", hasDeficit ? "font-bold text-ink" : "text-slate")}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${wardId} ${label} fulfilment`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-200",
            hasDeficit ? "bg-navy" : "bg-royal",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hasDeficit ? (
        <p className="font-mono text-[11px] font-semibold text-ink tnum">
          −{line.deficit} short
        </p>
      ) : null}
    </div>
  );
}

export function StepAllocate({
  stockPct,
  totalCrews,
  equityFloorPct,
  lang,
  data,
  isPending,
  isFetching,
  isError,
  error,
  onRetry,
  onStockPctChange,
  onTotalCrewsChange,
}: StepAllocateProps) {
  const bn = lang === "bn";
  const totalCritical = data
    ? data.cities.reduce((sum, c) => sum + c.critical_wards, 0)
    : 0;
  const totalDeficit = data
    ? data.cities.reduce((sum, c) => sum + c.deficit_wards, 0)
    : 0;

  return (
    <div data-testid="command-panel-2" className="space-y-5">
      {/* Constrained allocation controls */}
      <Card>
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className={bn ? "font-bangla" : undefined}>
              {bn
                ? "ধাপ ২ · সীমিত সরবরাহ ও স্প্রে দল বণ্টন"
                : "Step 2 · Constrained supply allocation & spraying crews"}
            </CardTitle>
            <CardDescription className={bn ? "font-bangla" : undefined}>
              {bn
                ? "আঞ্চলিক মজুত (৩০–১০০%) এবং স্প্রে দলের সংখ্যা পরিবর্তন করলে ১৫০ মিলিসেকেন্ডে লাইভ অপ্টিমাইজার পুনরায় হিসাব করে।"
                : "Adjust Available Regional Stock (30–100%) and spraying crews. The HiGHS LP solver re-optimizes within each city pool live (150 ms debounce) with a guaranteed equity floor."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="equity-floor-badge"
              className="inline-flex items-center rounded-md border border-mist bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-navy tnum"
            >
              Equity floor: {equityFloorPct}%
            </span>
            {data ? (
              <span className="inline-flex items-center rounded-md border border-mist bg-paper px-2.5 py-1 font-mono text-xs font-medium text-slate tnum">
                Crews: {data.crew_method}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Available Regional Stock slider */}
            <div className="space-y-3 rounded-xl border border-mist bg-paper/50 p-4">
              <SliderField
                id="command-stock-slider"
                testId="stock-slider"
                label="Available Regional Stock"
                min={30}
                max={100}
                step={1}
                value={stockPct}
                valueLabel={`${stockPct}%`}
                ariaValueText={`${stockPct} percent available regional stock`}
                minLabel="30% severe shortage"
                maxLabel="100% full stock"
                onChange={onStockPctChange}
              />
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Stock percentage quick presets"
              >
                {STOCK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`stock-preset-${preset}`}
                    aria-pressed={stockPct === preset}
                    onClick={() => onStockPctChange(preset)}
                    className={clsx(
                      "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                      stockPct === preset
                        ? "border-royal bg-royal text-white"
                        : "border-mist bg-white text-navy hover:border-royal",
                    )}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {/* Total Spraying Crews slider + numeric input */}
            <div className="space-y-3 rounded-xl border border-mist bg-paper/50 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SliderField
                    id="command-crews-slider"
                    testId="crews-slider"
                    label="Total Spraying Crews"
                    min={0}
                    max={60}
                    step={1}
                    value={Math.min(60, totalCrews)}
                    valueLabel={`${totalCrews} crews`}
                    ariaValueText={`${totalCrews} spraying crews`}
                    minLabel="0 crews"
                    maxLabel="60 crews"
                    onChange={onTotalCrewsChange}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="command-crews-input"
                    className="text-xs font-semibold text-navy"
                  >
                    Exact crews
                  </label>
                  <input
                    id="command-crews-input"
                    data-testid="crews-input"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={totalCrews}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (Number.isFinite(raw)) {
                        onTotalCrewsChange(Math.max(0, Math.min(60, Math.round(raw))));
                      }
                    }}
                    className="min-h-10 w-24 rounded-lg border border-mist bg-white px-3 py-1.5 font-mono text-sm font-semibold text-navy tnum focus-visible:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  />
                </div>
              </div>
              {data ? (
                <p className="font-mono text-xs text-slate tnum">
                  Ratios/case: saline {data.supply_ratios.saline_bags ?? 2.385} · kits{" "}
                  {data.supply_ratios.diagnostic_kits ?? 1.164} · beds{" "}
                  {data.supply_ratios.hospital_beds ?? 0.298} · P
                  {Math.round((data.service_levels.saline_bags ?? 0.8) * 100)}/P
                  {Math.round((data.service_levels.hospital_beds ?? 0.9) * 100)}
                </p>
              ) : null}
            </div>
          </div>

          <div
            role="status"
            aria-live="polite"
            data-testid="allocation-live-status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-paper px-3.5 py-2 text-xs text-navy"
          >
            <span className="font-mono font-semibold tnum">
              Active solution: stock {data?.request.stock_pct ?? stockPct}% · crews{" "}
              {data?.request.total_crews ?? totalCrews} · {totalCritical} critical deficit ·{" "}
              {totalDeficit} deficit wards
            </span>
            {isFetching ? (
              <span className="font-mono font-semibold text-navy">Re-solving…</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step2-error-banner"
          retryTestId="step2-retry"
          title="Allocation optimization failed"
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton
          testId="step2-loading"
          label="Solving constrained intra-city supply allocation…"
        />
      ) : null}

      {!isError && data && data.wards.length === 0 ? (
        <EmptyState
          title="No wards in allocation scope"
          description="Select a valid scope and origin week in Step 1."
        />
      ) : null}

      {!isError && data && data.wards.length > 0 ? (
        <>
          {/* City resource totals */}
          <div
            data-testid="city-allocation-totals"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {data.cities.map((citySummary) => (
              <Card
                key={citySummary.city}
                data-testid={`city-total-${citySummary.city}`}
                className="overflow-hidden"
              >
                <CardHeader className="bg-paper/60 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">{citySummary.city}</CardTitle>
                    <span className="font-mono text-xs font-semibold text-navy tnum">
                      {citySummary.crews_assigned} crews
                    </span>
                  </div>
                  <p className="font-mono text-xs text-slate tnum">
                    {citySummary.critical_wards} critical · {citySummary.deficit_wards} deficit
                    wards
                  </p>
                </CardHeader>
                <CardContent className="p-3.5">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-mist text-left text-[11px] font-semibold text-slate">
                        <th scope="col" className="pb-1.5">
                          Resource
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          Req.
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          Avail.
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          Alloc.
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          Floor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist font-mono tnum">
                      {citySummary.resources.map((r) => (
                        <tr key={r.resource}>
                          <th
                            scope="row"
                            className="py-1.5 text-left font-sans font-medium text-ink"
                          >
                            {RESOURCE_LABELS[r.resource]}
                          </th>
                          <td className="py-1.5 text-right text-slate">{r.required}</td>
                          <td className="py-1.5 text-right text-slate">{r.available}</td>
                          <td className="py-1.5 text-right font-semibold text-navy">
                            {r.allocated}
                          </td>
                          <td className="py-1.5 text-right">
                            {r.floors_scaled ? (
                              <span className="rounded bg-ink px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                                Scaled
                              </span>
                            ) : (
                              <span className="font-sans text-[11px] text-slate">20% OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-ward required vs allocated table */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Per-ward supply allocations & deficit alerts</CardTitle>
              <CardDescription>
                Allocated / required progress bars per resource, greedy crew placement, and explicit deficit reasons.
              </CardDescription>
            </CardHeader>
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Per-ward supply allocation table"
            >
              <table
                data-testid="allocation-ward-table"
                className="w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                    <th scope="col" className="px-3.5 py-2.5">
                      Ward
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Risk Tier
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Saline Bags
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Diagnostic Kits
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Hospital Beds
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Crews
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Deficit Status & Reasons
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist bg-white align-top">
                  {data.wards.map((ward) => (
                    <tr
                      key={ward.ward_id}
                      data-testid={`alloc-row-${ward.ward_id}`}
                      className="hover:bg-paper/60"
                    >
                      <th scope="row" className="px-3.5 py-3">
                        <p className="font-mono text-xs font-bold text-navy tnum">
                          {ward.ward_id}
                        </p>
                        <p className="text-[11px] font-normal text-slate">
                          {ward.city} · wt {ward.priority_weight.toFixed(1)}
                        </p>
                      </th>
                      <td className="px-3.5 py-3">
                        <RiskTierBadge tier={ward.tier} size="sm" lang={lang} />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label="saline bags"
                          wardId={ward.ward_id}
                          line={ward.saline_bags}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label="diagnostic kits"
                          wardId={ward.ward_id}
                          line={ward.diagnostic_kits}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label="hospital beds"
                          wardId={ward.ward_id}
                          line={ward.hospital_beds}
                        />
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-sm font-bold text-navy tnum">
                        {ward.crews}
                      </td>
                      <td className="px-3.5 py-3">
                        <DeficitBadge
                          level={ward.deficit_level}
                          lang={lang}
                          testId={`deficit-badge-${ward.ward_id}`}
                        />
                        {ward.deficit_reasons.length > 0 ? (
                          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-ink">
                            {ward.deficit_reasons.map((reason, idx) => (
                              <li key={`${ward.ward_id}-reason-${idx}`}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
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
