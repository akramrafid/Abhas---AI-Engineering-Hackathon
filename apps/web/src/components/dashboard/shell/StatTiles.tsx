"use client";

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

/** Four counting tiles above forecast views. Every figure comes from the live API. */
export function StatTiles({ signals, city, lang }: StatTilesProps) {
  const copy = COPY[lang];
  const bn = lang === "bn";
  const top = signals.topWard;
  const tiles = [
    { label: copy.critical, value: signals.criticalCount, decimals: 0, note: copy.criticalNote },
    { label: copy.city(city), value: signals.cityAlertCount, decimals: 0, note: copy.cityNote },
    {
      label: copy.top,
      value: top?.expected_cases ?? null,
      decimals: 1,
      note: top ? `${wardLabel(top.ward_id)} · ${top.city}` : "",
    },
    { label: copy.mae, value: signals.holdoutMae, decimals: 2, note: copy.maeNote },
  ];

  return (
    <dl data-testid="stat-tiles" className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={signals.isPending}>
      {tiles.map((tile) => (
        <div key={tile.label} data-enter className="flex flex-col-reverse justify-end rounded-[14px] bg-white p-4 ring-1 ring-mist">
          <dd className="mt-2">
            <span className="block font-sans text-[1.85rem] font-semibold leading-none tracking-tight text-navy tnum">
              {tile.value === null ? "…" : <NumberTicker value={tile.value} decimalPlaces={tile.decimals} />}
            </span>
            <span lang={lang} className={clsx("mt-2 block text-xs text-slate", bn && "font-bangla")}>
              {tile.note}
            </span>
          </dd>
          <dt lang={lang} className={clsx("text-sm font-semibold text-ink", bn && "font-bangla")}>
            {tile.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
