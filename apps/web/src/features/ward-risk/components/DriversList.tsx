"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "@/components/icons";
import { clsx } from "clsx";
import type { Driver } from "@/lib/api/client";
import { formatDriverLabel, UI_COPY, type Lang } from "@/lib/i18n";

export interface DriversListProps {
  drivers: readonly Driver[];
  horizonLabel: string;
  lang?: Lang;
}

interface WaterfallRow {
  key: string;
  label: string;
  effectPct: number;
  isOther?: boolean;
}

function buildWaterfallRows(
  drivers: readonly Driver[],
  lang: Lang,
): WaterfallRow[] {
  const topFour = drivers.slice(0, 4).map<WaterfallRow>((d) => ({
    key: d.key,
    label: formatDriverLabel(d, lang),
    effectPct: d.effect_pct,
  }));

  if (topFour.length === 0) return [];

  const rest = drivers.slice(4);
  let otherPct = 0;
  if (rest.length > 0) {
    const product = rest.reduce(
      (acc, d) => acc * Math.max(0.01, 1 + d.effect_pct / 100),
      1,
    );
    otherPct = Number(((product - 1) * 100).toFixed(1));
  }

  return [
    ...topFour,
    {
      key: "other",
      label: UI_COPY[lang].wardRisk.otherDriversLabel,
      effectPct: otherPct,
      isOther: true,
    },
  ];
}

export function DriversList({
  drivers,
  horizonLabel,
  lang = "en",
}: DriversListProps) {
  const rows = buildWaterfallRows(drivers, lang);
  const copy = UI_COPY[lang].wardRisk;

  if (rows.length === 0) {
    return (
      <div
        data-testid="drivers-panel"
        className="rounded-xl bg-paper p-4 text-sm text-slate ring-1 ring-mist"
      >
        No feature attribution drivers returned for {horizonLabel}.
      </div>
    );
  }

  const maxAbs = Math.max(15, ...rows.map((r) => Math.abs(r.effectPct)));

  return (
    <div data-testid="drivers-panel" className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper/75 px-3 py-2 text-[11px] font-medium text-slate ring-1 ring-mist/80">
        <p className={lang === "bn" ? "font-bangla" : undefined}>
          {copy.driversWaterfallCaption} ({horizonLabel})
        </p>
        <span className="font-semibold text-navy tnum">
          −{Math.round(maxAbs)}% · 0 · +{Math.round(maxAbs)}%
        </span>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          const isPositive = row.effectPct > 0;
          const isNegative = row.effectPct < 0;
          const rounded = Math.round(row.effectPct);
          const sign = rounded > 0 ? "+" : "";
          const formattedPct = `${sign}${rounded}%`;
          // Each side of the centered 0% axis occupies 50% width.
          const halfPct =
            row.effectPct === 0
              ? 0
              : Math.max(4, Math.min(50, (Math.abs(row.effectPct) / maxAbs) * 50));

          return (
            <li
              key={row.key}
              data-testid={`driver-row-${row.key}`}
              className={clsx(
                "space-y-1.5",
                row.isOther && "border-t border-mist/80 pt-3",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span
                  lang={lang}
                  className={clsx(
                    "inline-flex items-center gap-1.5 text-[13px] font-semibold",
                    row.isOther ? "text-slate" : "text-navy",
                    lang === "bn" && "font-bangla",
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-royal"
                      aria-hidden="true"
                    />
                  ) : isNegative ? (
                    <ArrowDownRight
                      className="h-4 w-4 shrink-0 text-slate"
                      aria-hidden="true"
                    />
                  ) : (
                    <Minus
                      className="h-4 w-4 shrink-0 text-slate"
                      aria-hidden="true"
                    />
                  )}
                  <span>{row.label}</span>
                </span>
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-bold tnum",
                    isPositive
                      ? "bg-royal/10 text-royal"
                      : "bg-paper text-slate ring-1 ring-mist",
                  )}
                >
                  {formattedPct}
                </span>
              </div>

              {/* Smoothly animated diverging waterfall bar centered on 0% baseline */}
              <div
                className="relative h-2.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist/85"
                aria-hidden="true"
              >
                <span className="absolute inset-y-0 left-1/2 z-10 w-px bg-navy/25" />
                {isPositive ? (
                  <div
                    className="absolute inset-y-0 rounded-r-full bg-[linear-gradient(90deg,#2F5BFF_0%,#5B7EFF_100%)] transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    style={{ left: "50%", width: `${halfPct}%` }}
                  />
                ) : isNegative ? (
                  <div
                    className="absolute inset-y-0 rounded-l-full bg-slate/80 transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    style={{ left: `${50 - halfPct}%`, width: `${halfPct}%` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
