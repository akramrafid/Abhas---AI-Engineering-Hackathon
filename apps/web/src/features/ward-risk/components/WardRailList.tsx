"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { TIER_META, TIER_ORDER } from "@/components/brand/RiskTierBadge";
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
  const [tierFilter, setTierFilter] = useState<RiskTier | "all">("all");

  const visibleForecasts = useMemo(() => {
    if (tierFilter === "all") return sortedForecasts;
    const filtered = sortedForecasts.filter((wf) => wf.peak_tier === tierFilter);
    return filtered.length > 0 ? filtered : sortedForecasts;
  }, [sortedForecasts, tierFilter]);

  const maxPeakCases = useMemo(() => {
    let peak = 1;
    for (const wf of sortedForecasts) {
      const h = findPeakHorizon(wf.horizons);
      if (h && h.expected_cases > peak) peak = h.expected_cases;
    }
    return peak;
  }, [sortedForecasts, findPeakHorizon]);

  return (
    <Card className="no-print overflow-hidden lg:sticky lg:top-20">
      <CardHeader className="bg-paper/75 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={clsx("text-sm font-bold", lang === "bn" && "font-bangla")}>
            {city} {copy.cityWardsSuffix}
          </CardTitle>
          <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-navy ring-1 ring-mist tnum">
            {sortedForecasts.length} {copy.totalLabel}
          </span>
        </div>

        {/* Actionable tier filter bar — shows only tiers present in this city */}
        <div
          role="group"
          aria-label="Filter wards by risk tier"
          className="mt-2 flex flex-wrap gap-1.5 text-[11px] tnum"
        >
          <button
            type="button"
            aria-pressed={tierFilter === "all"}
            onClick={() => setTierFilter("all")}
            className={clsx(
              "cursor-pointer rounded-lg px-2 py-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
              lang === "bn" && "font-bangla",
              tierFilter === "all"
                ? "bg-navy text-white"
                : "bg-white text-slate ring-1 ring-mist hover:text-navy",
            )}
          >
            {lang === "bn" ? `সব (${sortedForecasts.length})` : `All (${sortedForecasts.length})`}
          </button>
          {([...TIER_ORDER].reverse() as RiskTier[])
            .filter((t) => tierCounts[t] > 0)
            .map((t) => {
              const count = tierCounts[t];
              const active = tierFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTierFilter(active ? "all" : t)}
                  className={clsx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                    lang === "bn" && "font-bangla",
                    active
                      ? "bg-royal text-white"
                      : "bg-white text-navy ring-1 ring-mist hover:text-royal",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: active ? "#FFFFFF" : TIER_META[t].bgVar }}
                  />
                  <span>
                    {lang === "bn" ? TIER_META[t].labelBn : t} {count}
                  </span>
                </button>
              );
            })}
        </div>
      </CardHeader>

      <ul
        data-testid="ward-priority-list"
        className="abhas-scroll max-h-[620px] divide-y divide-mist/70 overflow-y-auto"
      >
        {visibleForecasts.map((wf, index) => {
          const isSelected = wf.ward_id === selectedWardId;
          const wfPeak = findPeakHorizon(wf.horizons);
          const barPct = wfPeak
            ? Math.max(10, Math.round((wfPeak.expected_cases / maxPeakCases) * 100))
            : 0;
          const rank = String(index + 1).padStart(2, "0");
          const tierMeta = TIER_META[wf.peak_tier];

          return (
            <li key={wf.ward_id}>
              <button
                type="button"
                data-testid={`ward-row-${wf.ward_id}`}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelectWard(wf.ward_id)}
                className={clsx(
                  "group flex w-full cursor-pointer flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-royal",
                  isSelected
                    ? "bg-royal/[0.08] ring-1 ring-inset ring-royal/35"
                    : "bg-white hover:bg-paper/80",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-navy tnum">
                    <span
                      className={clsx(
                        "flex h-5 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold transition-colors",
                        isSelected
                          ? "bg-royal text-white"
                          : "bg-paper text-slate ring-1 ring-mist group-hover:bg-white",
                      )}
                    >
                      {rank}
                    </span>
                    <span className="truncate font-mono text-xs font-bold transition-colors group-hover:text-royal">
                      {wf.ward_id}
                    </span>
                  </p>
                  {wfPeak ? (
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-navy tnum">
                      {wfPeak.expected_cases.toFixed(1)}{" "}
                      <span className="font-sans text-[11px] font-normal text-slate">
                        {copy.casesUnit} · +{wfPeak.horizon}w
                      </span>
                    </span>
                  ) : null}
                </div>

                {/* Calm proportional load bar + compact tier status line (prevents red-banner alarm fatigue) */}
                <div className="flex w-full items-center gap-2.5">
                  <div
                    aria-hidden="true"
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist/65"
                  >
                    <div
                      className={clsx(
                        "h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isSelected ? "bg-royal" : "bg-navy/75 group-hover:bg-royal",
                      )}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span
                    lang={lang}
                    className={clsx(
                      "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate",
                      lang === "bn" && "font-bangla",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tierMeta.bgVar }}
                    />
                    <span className="text-navy">
                      {lang === "bn" ? tierMeta.labelBn : wf.peak_tier}
                    </span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
