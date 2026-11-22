"use client";

import { ChevronRight } from "@/components/icons";
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
      <CardHeader className="bg-paper/40">
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
            <tr className={clsx("border-b border-mist/85 bg-paper/75 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate", lang === "bn" && "font-bangla tracking-normal")}>
              <th scope="col" className="px-4 py-2.5">{lang === "bn" ? "সময়সীমা" : "Horizon"}</th>
              <th scope="col" className="px-3 py-2.5">{lang === "bn" ? "লক্ষ্য সপ্তাহ" : "Target week"}</th>
              <th scope="col" className="px-3 py-2.5 text-right">{lang === "bn" ? "প্রত্যাশিত" : "Expected"}</th>
              <th scope="col" className="px-3 py-2.5 text-right">{lang === "bn" ? "৮০% পরিসর" : "80% band"}</th>
              <th scope="col" className="px-3 py-2.5 text-right">{lang === "bn" ? "স্কোর" : "Score"}</th>
              <th scope="col" className="px-4 py-2.5">{lang === "bn" ? "ঝুঁকির স্তর" : "Tier"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist/75">
            {horizons.map((h) => {
              const active = activeHorizon === h.horizon;
              return (
                <tr
                  key={h.horizon}
                  data-testid={`horizon-row-${h.horizon}`}
                  onClick={() => onSelectHorizon(h.horizon)}
                  className={clsx(
                    "group cursor-pointer transition-colors duration-150",
                    active ? "bg-royal/[0.06]" : "bg-white hover:bg-paper/75",
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-navy tnum">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectHorizon(h.horizon)}
                      className={clsx(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors tnum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                        active
                          ? "bg-royal text-white"
                          : "bg-paper text-navy ring-1 ring-mist group-hover:bg-white group-hover:text-royal",
                      )}
                    >
                      +{h.horizon}w
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-ink tnum">
                    {h.target_week}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold text-navy tnum">
                    {h.expected_cases.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-medium text-slate tnum">
                    <span className="rounded-md bg-paper/80 px-2 py-0.5 ring-1 ring-mist/70">
                      {h.p10.toFixed(1)}–{h.p90.toFixed(1)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold text-navy tnum">
                    {h.risk_score}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <RiskTierBadge tier={h.tier} size="sm" lang={lang} />
                      <ChevronRight
                        aria-hidden="true"
                        className={clsx(
                          "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                          active
                            ? "translate-x-0.5 text-royal"
                            : "text-slate/45 group-hover:translate-x-0.5 group-hover:text-royal",
                        )}
                      />
                    </div>
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
