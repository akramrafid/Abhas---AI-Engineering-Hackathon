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
                  "flex w-full cursor-pointer flex-col gap-2 px-3.5 py-3 text-left transition-colors",
                  isSelected
                    ? "bg-paper ring-1 ring-inset ring-royal/35"
                    : "bg-white hover:bg-paper/60",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-navy tnum">
                    {isSelected ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-royal"
                      />
                    ) : null}
                    <span className="truncate">{wf.ward_id}</span>
                  </p>
                  {wfPeak ? (
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate tnum">
                      {wfPeak.expected_cases.toFixed(1)} {copy.casesUnit} · +{wfPeak.horizon}w
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full items-center justify-between gap-2">
                  <RiskTierBadge tier={wf.peak_tier} size="sm" lang={lang} className="shrink-0" />
                  {isSelected ? (
                    <span
                      lang={lang}
                      className={clsx(
                        "shrink-0 rounded-full bg-royal/10 px-2 py-0.5 text-[11px] font-semibold text-royal",
                        lang === "bn" && "font-bangla",
                      )}
                    >
                      {lang === "bn" ? "নির্বাচিত" : "Selected"}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
