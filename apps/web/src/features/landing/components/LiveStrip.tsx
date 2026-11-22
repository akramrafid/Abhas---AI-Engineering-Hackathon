"use client";

import { useMemo } from "react";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { Marquee } from "@/components/ui/Marquee";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { wardLabel } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { useWardsQuery } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { STORM_ORIGIN } from "../rain-clock-steps";

// Dataset facts measured in TASK.md ("Measured facts about the dataset").
const FACTS = [
  { value: 31320, label: "ward-weeks of history, 2016 to 2025", decimals: 0 },
  { value: 60, label: "wards in five city corporations", decimals: 0 },
  { value: 0.47, label: "rain-to-cases correlation, three weeks later", decimals: 2 },
  { value: 4, label: "weeks of warning, forecast per ward", decimals: 0 },
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
    <section aria-label="Abhas in numbers and this week's ward list" className="bg-ink pb-20 pt-16 text-white sm:pb-28">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-4 sm:px-8 lg:grid-cols-4">
        {FACTS.map((fact) => (
          <div key={fact.label} className="flex flex-col-reverse border-l border-white/10 pl-5">
            <dt className="mt-2 text-sm leading-5 text-mist">{fact.label}</dt>
            <dd className="font-mono text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none text-white">
              <NumberTicker value={fact.value} decimalPlaces={fact.decimals} />
            </dd>
          </div>
        ))}
      </dl>

      {ranked.length ? (
        <div className="mt-16" data-testid="ward-marquee">
          <p className="mx-auto max-w-6xl px-4 text-sm text-mist sm:px-8">
            Forecast for the week of <span className="font-mono text-white tnum">{target ? formatShortDate(target) : "…"}</span>,
            made {formatShortDate(STORM_ORIGIN)}. Every ward, highest expected cases first.
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
