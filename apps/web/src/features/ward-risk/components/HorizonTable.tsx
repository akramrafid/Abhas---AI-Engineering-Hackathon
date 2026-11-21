"use client";

import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import type { HorizonForecast } from "@/lib/api/client";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface HorizonTableProps {
  horizons: readonly HorizonForecast[];
  activeHorizon: number | null;
  lang: Lang;
  onSelectHorizon: (horizon: number) => void;
}

export function HorizonTable({
  horizons,
  activeHorizon,
  lang,
  onSelectHorizon,
}: HorizonTableProps) {
  const copy = UI_COPY[lang].wardRisk;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
          {copy.perHorizonTitle}
        </CardTitle>
        <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
          {copy.perHorizonDesc}
        </CardDescription>
      </CardHeader>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Per-horizon forecast outlook table"
      >
        <table
          data-testid="horizon-table"
          className="w-full border-collapse text-left text-sm"
        >
          <thead>
            <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
              <th scope="col" className="px-2.5 py-2.5">Horizon</th>
              <th scope="col" className="px-2.5 py-2.5">Target week</th>
              <th scope="col" className="px-2.5 py-2.5 text-right">Expected</th>
              <th scope="col" className="px-2.5 py-2.5 text-right">80% band</th>
              <th scope="col" className="px-2.5 py-2.5 text-right">Score</th>
              <th scope="col" className="px-2.5 py-2.5">Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {horizons.map((h) => {
              const active = activeHorizon === h.horizon;
              return (
                <tr
                  key={h.horizon}
                  data-testid={`horizon-row-${h.horizon}`}
                  onClick={() => onSelectHorizon(h.horizon)}
                  className={clsx(
                    "cursor-pointer",
                    active ? "bg-paper" : "bg-white hover:bg-paper/60",
                  )}
                >
                  <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-xs font-semibold text-navy tnum">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectHorizon(h.horizon)}
                      className="cursor-pointer font-mono text-xs font-semibold text-navy hover:text-royal tnum"
                    >
                      +{h.horizon}w
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-xs text-ink tnum">
                    {h.target_week}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm font-semibold text-ink tnum">
                    {h.expected_cases.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-xs text-slate tnum">
                    {h.p10.toFixed(1)}–{h.p90.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-xs text-ink tnum">
                    {h.risk_score}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5">
                    <RiskTierBadge tier={h.tier} size="sm" lang={lang} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
