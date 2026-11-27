"use client";

import { AlertTriangle, LineChart, MapPin, ShieldCheck } from "@/components/icons";
import { clsx } from "clsx";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { wardLabel } from "@/components/ward-map/geo";
import type { City } from "@/lib/api/client";
import type { HorizonWindow } from "@/lib/demo-config";
import type { Lang } from "@/lib/i18n";
import type { WorkspaceSignals } from "./useWorkspaceSignals";

const WINDOW_MEASURE: Record<HorizonWindow, Record<Lang, string>> = {
  "1w": { en: "peak week, h1", bn: "শীর্ষ সপ্তাহ, h1" },
  "2-4w": { en: "peak week, h2–4", bn: "শীর্ষ সপ্তাহ, h2–4" },
  "1-4w": { en: "peak week, h1–4", bn: "শীর্ষ সপ্তাহ, h1–4" },
};

const COPY = {
  en: {
    critical: "Wards Critical",
    criticalNote: "of 60, peak in the window",
    city: (c: string) => `High or Critical in ${c}`,
    cityNote: "act on these first",
    top: "Highest expected cases",
    mae: "Hold-out error, 3 weeks ahead",
    maeNote: "cases per ward-week, 2024–2025",
  },
  bn: {
    critical: "সংকটপূর্ণ ওয়ার্ড",
    criticalNote: "৬০টির মধ্যে, সময়সীমার সর্বোচ্চ",
    city: (c: string) => `${c}: উচ্চ বা সংকটপূর্ণ`,
    cityNote: "আগে এগুলোতে ব্যবস্থা নিন",
    top: "সর্বোচ্চ প্রত্যাশিত রোগী",
    mae: "যাচাই ত্রুটি, ৩ সপ্তাহ আগে",
    maeNote: "প্রতি ওয়ার্ড-সপ্তাহে রোগী, ২০২৪–২০২৫",
  },
} as const;

export interface StatTilesProps {
  signals: WorkspaceSignals;
  city: City;
  windowKey?: HorizonWindow;
  lang: Lang;
}

/** Four executive KPI tiles above forecast views. Every figure comes from the live API. */
export function StatTiles({ signals, city, windowKey = "2-4w", lang }: StatTilesProps) {
  const copy = COPY[lang];
  const bn = lang === "bn";
  const top = signals.topWard;
  const measureNote = WINDOW_MEASURE[windowKey][lang];
  const criticalPct = signals.criticalCount !== null ? Math.min(100, Math.round((signals.criticalCount / 60) * 100)) : 0;

  const tiles = [
    {
      testId: "stat-tile-critical",
      icon: AlertTriangle,
      label: copy.critical,
      value: signals.criticalCount,
      decimals: 0,
      note: copy.criticalNote,
      progressPct: criticalPct,
    },
    {
      testId: "stat-tile-city-alerts",
      icon: MapPin,
      label: copy.city(city),
      value: signals.cityAlertCount,
      decimals: 0,
      note: copy.cityNote,
      progressPct: null,
    },
    {
      testId: "stat-tile-top-ward",
      icon: LineChart,
      label: copy.top,
      value: top?.expected_cases ?? null,
      decimals: 1,
      note: top ? `${wardLabel(top.ward_id, lang)} · ${top.city} · ${measureNote}` : measureNote,
      progressPct: null,
    },
    {
      testId: "stat-tile-mae",
      icon: ShieldCheck,
      label: copy.mae,
      value: signals.holdoutMae,
      decimals: 2,
      note: copy.maeNote,
      progressPct: null,
    },
  ];

  return (
    <div
      data-testid="stat-tiles"
      className="grid grid-cols-2 divide-y divide-mist/80 overflow-hidden rounded-2xl bg-white ring-1 ring-mist/90 sm:divide-y-0 lg:grid-cols-4 lg:divide-x"
      aria-busy={signals.isPending}
    >
      {tiles.map((tile, idx) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.testId}
            data-testid={tile.testId}
            data-enter
            className={clsx(
              "group flex flex-col justify-between px-4 py-3.5 transition-colors duration-150 hover:bg-paper/55",
              idx % 2 === 1 && "border-l border-mist/80 lg:border-l-0",
              idx >= 2 && "border-t border-mist/80 lg:border-t-0",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                lang={lang}
                className={clsx("truncate text-xs font-semibold text-slate", bn && "font-bangla")}
              >
                {tile.label}
              </p>
              <Icon
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-royal/80 transition-colors duration-150 group-hover:text-royal"
              />
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                data-testid={`${tile.testId}-value`}
                className="font-mono text-2xl font-bold leading-none tracking-[-0.02em] text-navy tnum"
              >
                {tile.value === null ? "…" : <NumberTicker value={tile.value} decimalPlaces={tile.decimals} />}
              </span>
              {tile.progressPct !== null ? (
                <span className="font-mono text-[11px] font-semibold text-slate tnum">
                  ({tile.progressPct}%)
                </span>
              ) : null}
            </div>

            <span
              data-testid={`${tile.testId}-note`}
              title={tile.note}
              lang={lang}
              className={clsx(
                "mt-1.5 block text-[11px] font-medium leading-snug text-slate",
                bn && "font-bangla",
              )}
            >
              {tile.note}
            </span>
          </div>
        );
      })}
    </div>
  );
}
