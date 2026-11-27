"use client";

import { clsx } from "clsx";
import type { RiskTier } from "@/components/brand/RiskTierBadge";
import type { MapWard } from "@/components/ward-map/WardRiskMap";
import { cityDisplayName, wardNumber } from "@/components/ward-map/geo";
import { formatShortDate } from "@/lib/dates";
import type { City } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface WardRiskMatrixProps {
  wards: readonly MapWard[];
  selectedWardId: string;
  originWeek: string;
  onSelectWard: (wardId: string) => void;
  onInspectWardOnMap?: (ward: MapWard) => void;
  lang: Lang;
}

const CITY_ORDER: readonly City[] = [
  "Dhaka South",
  "Chattogram",
  "Dhaka North",
  "Gazipur",
  "Narayanganj",
];

const TIER_TILE_CLASSES: Record<RiskTier, string> = {
  Low: "bg-risk-low text-risk-low-on border-risk-low-border",
  Medium: "bg-risk-medium text-risk-medium-on border-risk-medium",
  High: "bg-risk-high text-risk-high-on border-risk-high",
  Critical: "bg-risk-critical text-risk-critical-on border-risk-critical",
};

export function WardRiskMatrix({
  wards,
  selectedWardId,
  originWeek,
  onSelectWard,
  onInspectWardOnMap,
  lang,
}: WardRiskMatrixProps) {
  const bn = lang === "bn";

  const grouped = CITY_ORDER.map((city) => ({
    city,
    items: wards
      .filter((w) => w.city === city)
      .sort((a, b) => wardNumber(a.ward_id) - wardNumber(b.ward_id)),
  })).filter((g) => g.items.length > 0);

  return (
    <section
      aria-labelledby="ward-risk-matrix-heading"
      className="flex flex-col rounded-[14px] border border-mist bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="ward-risk-matrix-heading"
            lang={lang}
            className={clsx("text-base font-bold text-navy", bn && "font-bangla")}
          >
            {bn ? "৬০ ওয়ার্ড ঝুঁকি ম্যাট্রিক্স" : "Predictions: 60-ward risk matrix"}
          </h3>
          <p lang={lang} className={clsx("mt-0.5 text-xs text-slate tnum", bn && "font-bangla")}>
            {bn
              ? `পূর্বাভাস ${formatShortDate(originWeek)} · ক্লিক করে মানচিত্রে ওয়ার্ড দেখুন`
              : `${formatShortDate(originWeek)} origin · click any ward tile to focus 3D tower`}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map((group) => (
          <div key={group.city}>
            <p
              lang={lang}
              className={clsx(
                "text-[11px] font-bold uppercase tracking-[0.06em] text-slate",
                bn && "font-bangla normal-case tracking-normal",
              )}
            >
              {cityDisplayName(group.city, lang)}
            </p>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {group.items.map((ward) => {
                const num = String(wardNumber(ward.ward_id)).padStart(2, "0");
                const isSelected = ward.ward_id === selectedWardId;
                const casesLabel = ward.expected_cases !== null ? ward.expected_cases.toFixed(0) : "—";
                const tierClass = ward.tier
                  ? TIER_TILE_CLASSES[ward.tier]
                  : "border-mist bg-paper text-ink";

                return (
                  <button
                    key={ward.ward_id}
                    type="button"
                    onClick={() => {
                      if (onInspectWardOnMap) onInspectWardOnMap(ward);
                      else onSelectWard(ward.ward_id);
                    }}
                    title={`${cityDisplayName(ward.city, lang)} · Ward ${num}: ${ward.tier ?? "Unknown"} (${ward.expected_cases?.toFixed(1) ?? "—"} expected cases)`}
                    aria-pressed={isSelected}
                    className={clsx(
                      "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border px-1 py-1 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal",
                      tierClass,
                      isSelected && "ring-2 ring-royal ring-offset-1",
                    )}
                  >
                    <span className="font-mono text-[10px] font-semibold leading-none tnum">{num}</span>
                    <span className="mt-0.5 font-mono text-xs font-bold leading-none tnum">
                      {casesLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p lang={lang} className={clsx("mt-4 text-[11px] leading-relaxed text-slate", bn && "font-bangla")}>
        {bn
          ? "প্রতিটি ঘরে ওয়ার্ড নম্বর (উপরে) এবং প্রত্যাশিত রোগীর সংখ্যা (নিচে) দেখানো হয়েছে। রং ঝুঁকির স্তর (নিম্ন, মাঝারি, উচ্চ, সংকটপূর্ণ) নির্দেশ করে।"
          : "Tile label = ward number (top) and forecast expected cases (bottom). Colours match calibrated Low / Medium / High / Critical risk tiers."}
      </p>
    </section>
  );
}
