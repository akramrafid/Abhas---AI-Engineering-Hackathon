"use client";

import { AlertTriangle, LineChart, MapPin, ShieldCheck } from "@/components/icons";
import { clsx } from "clsx";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { wardLabel } from "@/components/ward-map/geo";
import type { City } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import type { WorkspaceSignals } from "./useWorkspaceSignals";

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
  lang: Lang;
}

/** Four executive KPI tiles above forecast views. Every figure comes from the live API. */
export function StatTiles({ signals, city, lang }: StatTilesProps) {
  const copy = COPY[lang];
  const bn = lang === "bn";
  const top = signals.topWard;
  const criticalPct = signals.criticalCount !== null ? Math.min(100, Math.round((signals.criticalCount / 60) * 100)) : 0;

  const tiles = [
    {
      icon: AlertTriangle,
      label: copy.critical,
      value: signals.criticalCount,
      decimals: 0,
      note: copy.criticalNote,
      progressPct: criticalPct,
    },
    {
      icon: MapPin,
      label: copy.city(city),
      value: signals.cityAlertCount,
      decimals: 0,
      note: copy.cityNote,
      progressPct: null,
    },
    {
      icon: LineChart,
      label: copy.top,
      value: top?.expected_cases ?? null,
      decimals: 1,
      note: top ? `${wardLabel(top.ward_id)} · ${top.city}` : "—",
      progressPct: null,
    },
    {
      icon: ShieldCheck,
      label: copy.mae,
      value: signals.holdoutMae,
      decimals: 2,
      note: copy.maeNote,
      progressPct: null,
    },
  ];

  return (
    <dl
      data-testid="stat-tiles"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-busy={signals.isPending}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            data-enter
            className="group flex flex-col justify-between rounded-[16px] bg-white p-4 ring-1 ring-mist/90 transition-colors duration-200 hover:ring-royal/35 sm:p-4.5"
          >
            <div className="flex items-start justify-between gap-2.5">
              <dt
                lang={lang}
                className={clsx("text-xs font-semibold leading-snug text-slate", bn && "font-bangla")}
              >
                {tile.label}
              </dt>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-royal/[0.07] text-royal ring-1 ring-royal/12 transition-colors duration-200 group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
            </div>

            <dd className="mt-3">
              <span className="block font-sans text-[1.9rem] font-extrabold leading-none tracking-[-0.03em] text-navy tnum">
                {tile.value === null ? "…" : <NumberTicker value={tile.value} decimalPlaces={tile.decimals} />}
              </span>
              {tile.progressPct !== null ? (
                <div
                  aria-hidden="true"
                  className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist/70"
                >
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#0B1A5C_0%,#2F5BFF_100%)] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ width: `${tile.progressPct}%` }}
                  />
                </div>
              ) : null}
              <span
                lang={lang}
                className={clsx(
                  "mt-2 block truncate text-[11px] font-medium text-slate",
                  bn && "font-bangla",
                )}
              >
                {tile.note}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
