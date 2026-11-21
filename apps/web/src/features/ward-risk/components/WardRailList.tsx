"use client";

import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { City, HorizonForecast, RiskTier, WardForecast } from "@/lib/api/client";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface WardRailListProps {
  city: City;
  sortedForecasts: readonly WardForecast[];
  selectedWardId: string;
  tierCounts: Record<RiskTier, number>;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
  findPeakHorizon: (horizons: readonly HorizonForecast[]) => HorizonForecast | null;
}

export function WardRailList({
  city,
  sortedForecasts,
  selectedWardId,
  tierCounts,
  lang,
  onSelectWard,
  findPeakHorizon,
}: WardRailListProps) {
  const copy = UI_COPY[lang].wardRisk;

  return (
    <Card className="no-print overflow-hidden">
      <CardHeader className="bg-paper py-3.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={clsx("text-sm", lang === "bn" && "font-bangla")}>
            {city} {copy.cityWardsSuffix}
          </CardTitle>
          <span className="font-mono text-xs text-slate tnum">
            {sortedForecasts.length} {copy.totalLabel}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px] text-slate tnum">
          {([...TIER_ORDER].reverse() as RiskTier[]).map((t) => (
            <span
              key={t}
              className="rounded-sm border border-mist bg-white px-1.5 py-0.5"
            >
              {t}: {tierCounts[t]}
            </span>
          ))}
        </div>
      </CardHeader>

      <ul
        data-testid="ward-priority-list"
        className="max-h-[680px] divide-y divide-mist overflow-y-auto"
      >
        {sortedForecasts.map((wf) => {
          const isSelected = wf.ward_id === selectedWardId;
          const wfPeak = findPeakHorizon(wf.horizons);
          return (
            <li key={wf.ward_id}>
              <button
                type="button"
                data-testid={`ward-row-${wf.ward_id}`}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelectWard(wf.ward_id)}
                className={clsx(
                  "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left",
                  isSelected
                    ? "bg-paper ring-1 ring-inset ring-royal/30"
                    : "bg-white hover:bg-paper/60",
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-navy tnum">
                    {isSelected ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-royal"
                      />
                    ) : null}
                    <span className="whitespace-nowrap">{wf.ward_id}</span>
                  </p>
                  {wfPeak ? (
                    <p className="font-mono text-[11px] text-slate tnum">
                      {wfPeak.expected_cases.toFixed(1)} {copy.casesUnit} (+{wfPeak.horizon}w)
                    </p>
                  ) : null}
                </div>
                <RiskTierBadge tier={wf.peak_tier} size="sm" lang={lang} className="shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
