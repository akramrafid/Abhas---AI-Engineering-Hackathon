"use client";

import { useMemo } from "react";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { Marquee } from "@/components/ui/Marquee";
import { wardLabel } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { useWardsQuery } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { STORM_ORIGIN } from "../rain-clock-steps";


const HARD_STATS = [
  { value: "60", label: "wards monitored" },
  { value: "5", label: "city corporations" },
  { value: "31,320", label: "ward-weeks analysed" },
  { value: "~20%", label: "lower 3w MAE vs baseline" },
  { value: "0.59 ms", label: "CPU forecast per ward" },
] as const;

export function LiveStrip() {
  const wardsQuery = useWardsQuery();
  const storm = useAllCityHeatmaps(STORM_ORIGIN, "dataset");
  const ranked = useMemo(
    () =>
      buildMapWards(wardsQuery.data?.wards ?? [], storm.cellsByWard, 3, [3])
        .filter((w) => w.tier)
        .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0)),
    [wardsQuery.data, storm.cellsByWard],
  );
  const half = Math.ceil(ranked.length / 2);
  const target = ranked[0]?.target_week;

  return (
    <section aria-label="Measured coverage and this week's ward list" className="bg-ink pb-20 pt-10 text-white sm:pb-28">
      {/* Hard-number social proof bar (honest measured coverage, no invented logos) */}
      <div className="mx-auto mb-14 max-w-6xl px-4 sm:px-8">
        <dl className="grid grid-cols-2 gap-6 border-y border-white/10 py-7 sm:grid-cols-3 lg:grid-cols-5">
          {HARD_STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-mist">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-extrabold tracking-tight text-white tnum sm:text-3xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {ranked.length ? (
        <div data-testid="ward-marquee">
          <p className="mx-auto max-w-6xl px-4 text-sm text-mist sm:px-8">
            Forecast for the week of <span className="font-mono text-white tnum">{target ? formatShortDate(target) : "…"}</span>,
            made <span className="font-mono text-white tnum">{formatShortDate(STORM_ORIGIN)}</span>, from 31,320 ward-weeks of history across 60 wards. Every ward, highest expected cases first.
          </p>
          <div className="mt-5 space-y-3 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            {[ranked.slice(0, half), ranked.slice(half)].map((row, i) => (
              <Marquee key={i} reverse={i === 1} pauseOnHover>
                {row.map((ward) => (
                  <span
                    key={ward.ward_id}
                    className="inline-flex items-center gap-3 rounded-[10px] bg-navy/70 py-2 pl-3.5 pr-2 ring-1 ring-white/10"
                  >
                    <span className="text-sm font-semibold">{wardLabel(ward.ward_id)}</span>
                    <span className="text-xs text-mist">{ward.city}</span>
                    <span className="font-mono text-sm text-white tnum">{ward.expected_cases?.toFixed(1)}</span>
                    {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" /> : null}
                  </span>
                ))}
              </Marquee>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
