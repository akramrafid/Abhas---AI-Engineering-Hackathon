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
import { UI_COPY, type Lang } from "@/lib/i18n";
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

function ResourceBarCell({
  label,
  wardId,
  line,
  lang,
}: {
  label: string;
  wardId: string;
  line: ResourceLine;
  lang: Lang;
}) {
  const s2 = UI_COPY[lang].command.step2;
  const bn = lang === "bn";
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
        aria-label={s2.fulfilmentAria(wardId, label)}
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
        <p className={clsx("font-mono text-[11px] font-semibold text-ink tnum", bn && "font-bangla")}>
          {s2.shortSuffix(line.deficit)}
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
  const s2 = UI_COPY[lang].command.step2;
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
            <CardTitle lang={lang} className={bn ? "font-bangla" : undefined}>
              {s2.title}
            </CardTitle>
            <CardDescription lang={lang} className={bn ? "font-bangla" : undefined}>
              {s2.description}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="equity-floor-badge"
              lang={lang}
              className={clsx(
                "inline-flex items-center rounded-md border border-mist bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-navy tnum",
                bn && "font-bangla",
              )}
            >
              {s2.equityFloorBadge(equityFloorPct)}
            </span>
            {data ? (
              <span
                lang={lang}
                className={clsx(
                  "inline-flex items-center rounded-md border border-mist bg-paper px-2.5 py-1 font-mono text-xs font-medium text-slate tnum",
                  bn && "font-bangla",
                )}
              >
                {s2.crewsMethodBadge(data.crew_method)}
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
                label={s2.stockSliderLabel}
                min={30}
                max={100}
                step={1}
                value={stockPct}
                valueLabel={`${stockPct}%`}
                ariaValueText={s2.stockAriaText(stockPct)}
                minLabel={s2.stockMinLabel}
                maxLabel={s2.stockMaxLabel}
                onChange={onStockPctChange}
              />
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={s2.stockPresetsAria}
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
                    label={s2.crewsSliderLabel}
                    min={0}
                    max={60}
                    step={1}
                    value={Math.min(60, totalCrews)}
                    valueLabel={s2.crewsValueLabel(totalCrews)}
                    ariaValueText={s2.crewsAriaText(totalCrews)}
                    minLabel={s2.crewsMinLabel}
                    maxLabel={s2.crewsMaxLabel}
                    onChange={onTotalCrewsChange}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="command-crews-input"
                    lang={lang}
                    className={clsx("text-xs font-semibold text-navy", bn && "font-bangla")}
                  >
                    {s2.exactCrewsLabel}
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
                <p lang={lang} className={clsx("font-mono text-xs text-slate tnum", bn && "font-bangla")}>
                  {s2.ratiosSummary(
                    data.supply_ratios.saline_bags ?? 2.385,
                    data.supply_ratios.diagnostic_kits ?? 1.164,
                    data.supply_ratios.hospital_beds ?? 0.298,
                    Math.round((data.service_levels.saline_bags ?? 0.8) * 100),
                    Math.round((data.service_levels.hospital_beds ?? 0.9) * 100),
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <div
            role="status"
            aria-live="polite"
            data-testid="allocation-live-status"
            lang={lang}
            className={clsx(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-paper px-3.5 py-2 text-xs text-navy",
              bn && "font-bangla",
            )}
          >
            <span className="font-mono font-semibold tnum">
              {s2.activeStatus(
                data?.request.stock_pct ?? stockPct,
                data?.request.total_crews ?? totalCrews,
                totalCritical,
                totalDeficit,
              )}
            </span>
            {isFetching ? (
              <span className="font-mono font-semibold text-navy">{s2.resolving}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step2-error-banner"
          retryTestId="step2-retry"
          title={s2.errorTitle}
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton testId="step2-loading" label={s2.loadingLabel} />
      ) : null}

      {!isError && data && data.wards.length === 0 ? (
        <EmptyState title={s2.emptyTitle} description={s2.emptyDescription} />
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
                    <span
                      lang={lang}
                      className={clsx("font-mono text-xs font-semibold text-navy tnum", bn && "font-bangla")}
                    >
                      {s2.cityCrewsCount(citySummary.crews_assigned)}
                    </span>
                  </div>
                  <p lang={lang} className={clsx("font-mono text-xs text-slate tnum", bn && "font-bangla")}>
                    {s2.cityDeficitSummary(citySummary.critical_wards, citySummary.deficit_wards)}
                  </p>
                </CardHeader>
                <CardContent className="p-3.5">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr
                        lang={lang}
                        className={clsx(
                          "border-b border-mist text-left text-[11px] font-semibold text-slate",
                          bn && "font-bangla",
                        )}
                      >
                        <th scope="col" className="pb-1.5">
                          {s2.colResource}
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          {s2.colReq}
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          {s2.colAvail}
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          {s2.colAlloc}
                        </th>
                        <th scope="col" className="pb-1.5 text-right">
                          {s2.colFloor}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist font-mono tnum">
                      {citySummary.resources.map((r) => (
                        <tr key={r.resource}>
                          <th
                            scope="row"
                            lang={lang}
                            className={clsx("py-1.5 text-left font-sans font-medium text-ink", bn && "font-bangla")}
                          >
                            {s2.resources[r.resource]}
                          </th>
                          <td className="py-1.5 text-right text-slate">{r.required}</td>
                          <td className="py-1.5 text-right text-slate">{r.available}</td>
                          <td className="py-1.5 text-right font-semibold text-navy">
                            {r.allocated}
                          </td>
                          <td className="py-1.5 text-right">
                            {r.floors_scaled ? (
                              <span
                                lang={lang}
                                className={clsx(
                                  "rounded bg-ink px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white",
                                  bn && "font-bangla",
                                )}
                              >
                                {s2.floorScaled}
                              </span>
                            ) : (
                              <span
                                lang={lang}
                                className={clsx("font-sans text-[11px] text-slate", bn && "font-bangla")}
                              >
                                {s2.floorOk(equityFloorPct)}
                              </span>
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
              <CardTitle lang={lang} className={bn ? "font-bangla" : undefined}>
                {s2.wardTableTitle}
              </CardTitle>
              <CardDescription lang={lang} className={bn ? "font-bangla" : undefined}>
                {s2.wardTableDescription}
              </CardDescription>
            </CardHeader>
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={s2.wardTableAria}
            >
              <table
                data-testid="allocation-ward-table"
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
                      {s2.colWard}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s2.colRiskTier}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s2.colSaline}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s2.colKits}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s2.colBeds}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      {s2.colCrews}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      {s2.colDeficit}
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
                        <p className={clsx("text-[11px] font-normal text-slate", bn && "font-bangla")}>
                          {ward.city} · {s2.weightPrefix} {ward.priority_weight.toFixed(1)}
                        </p>
                      </th>
                      <td className="px-3.5 py-3">
                        <RiskTierBadge tier={ward.tier} size="sm" lang={lang} />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label={s2.resources.saline_bags}
                          wardId={ward.ward_id}
                          line={ward.saline_bags}
                          lang={lang}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label={s2.resources.diagnostic_kits}
                          wardId={ward.ward_id}
                          line={ward.diagnostic_kits}
                          lang={lang}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <ResourceBarCell
                          label={s2.resources.hospital_beds}
                          wardId={ward.ward_id}
                          line={ward.hospital_beds}
                          lang={lang}
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
