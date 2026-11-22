"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { cityDisplayName, wardLabel, type MapView } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps, type HorizonPick } from "@/components/ward-map/hooks";
import { WardRiskMap } from "@/components/ward-map/WardRiskMap";
import type { City, Ward, WeatherMode } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { WINDOW_HORIZONS, type HorizonWindow } from "@/lib/demo-config";
import type { Lang } from "@/lib/i18n";

const COPY = {
  en: {
    title: "Ward risk map",
    description: (origin: string) =>
      `All 60 wards, forecast made ${origin}. Dot colour is the tier; a bigger dot means more expected cases among the wards shown. Select a ward to open its forecast.`,
    approx: "Ward positions are approximate: the dataset has no ward boundaries.",
    peak: "Peak in window",
    views: { dhaka: "Dhaka region", chattogram: "Chattogram", all: "All five" },
    ledger: "Highest risk in view",
    loading: "Loading forecasts for all five city corporations…",
    error: "The ward forecasts could not be loaded",
    empty: "No forecasts for this week.",
    cases: "expected",
  },
  bn: {
    title: "ওয়ার্ড ঝুঁকি মানচিত্র",
    description: (origin: string) =>
      `৬০টি ওয়ার্ড, পূর্বাভাস ${origin}। রং ঝুঁকির স্তর, আকার প্রত্যাশিত রোগী। পূর্বাভাস দেখতে ওয়ার্ড বেছে নিন।`,
    approx: "ওয়ার্ডের অবস্থান আনুমানিক: ডেটাসেটে ওয়ার্ডের সীমানা নেই।",
    peak: "সর্বোচ্চ",
    views: { dhaka: "ঢাকা অঞ্চল", chattogram: "চট্টগ্রাম", all: "পাঁচটি নগর" },
    ledger: "সবচেয়ে বেশি ঝুঁকি",
    loading: "পাঁচটি নগরের পূর্বাভাস লোড হচ্ছে…",
    error: "ওয়ার্ডের পূর্বাভাস লোড করা যায়নি",
    empty: "এই সপ্তাহের পূর্বাভাস নেই।",
    cases: "প্রত্যাশিত",
  },
} as const;

const VIEW_CITIES: Record<MapView, readonly City[]> = {
  dhaka: ["Dhaka North", "Dhaka South", "Gazipur", "Narayanganj"],
  chattogram: ["Chattogram"],
  all: ["Dhaka North", "Dhaka South", "Gazipur", "Narayanganj", "Chattogram"],
};

export interface RiskMapViewProps {
  wards: readonly Ward[];
  selectedCity: City;
  selectedWardId: string;
  originWeek: string;
  windowKey: HorizonWindow;
  source: WeatherMode;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
}

export function RiskMapView({
  wards,
  selectedCity,
  selectedWardId,
  originWeek,
  windowKey,
  source,
  lang,
  onSelectWard,
}: RiskMapViewProps) {
  const copy = COPY[lang];
  const horizons = WINDOW_HORIZONS[windowKey];
  // Opens on the nearest horizon in the window: "peak" of a monsoon window is often all Critical.
  const [pick, setPick] = useState<HorizonPick>(() => WINDOW_HORIZONS[windowKey][0] ?? "peak");
  const [viewOverride, setViewOverride] = useState<{ city: City; view: MapView } | null>(null);
  const [hoveredWardId, setHoveredWardId] = useState<string | null>(null);
  const view: MapView =
    viewOverride && viewOverride.city === selectedCity
      ? viewOverride.view
      : selectedCity === "Chattogram"
        ? "chattogram"
        : "dhaka";
  const heatmaps = useAllCityHeatmaps(originWeek, source);

  const effectivePick: HorizonPick = pick !== "peak" && !horizons.includes(pick) ? (horizons[0] ?? "peak") : pick;
  const mapWards = useMemo(
    () => buildMapWards(wards, heatmaps.cellsByWard, effectivePick, horizons),
    [wards, heatmaps.cellsByWard, effectivePick, horizons],
  );
  const ledger = useMemo(
    () =>
      mapWards
        .filter((w) => VIEW_CITIES[view].includes(w.city as City) && w.tier)
        .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0))
        .slice(0, 10),
    [mapWards, view],
  );

  const tierCounts = TIER_ORDER.map((tier) => ({ tier, n: mapWards.filter((w) => w.tier === tier).length }));
  const label = `${copy.title}: ${tierCounts.map((t) => `${t.n} ${t.tier}`).join(", ")}.`;

  return (
    <Card data-testid="risk-map-view">
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle lang={lang} className={lang === "bn" ? "font-bangla" : undefined}>
            {copy.title}
          </CardTitle>
          <CardDescription lang={lang} className={clsx("max-w-2xl", lang === "bn" && "font-bangla")}>
            {copy.description(formatShortDate(originWeek))}
          </CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Segmented
            label="Map area"
            testIdPrefix="risk-map-view"
            options={(["dhaka", "chattogram", "all"] as const).map((v) => ({ id: v, text: copy.views[v] }))}
            value={view}
            onChange={(nextView) => setViewOverride({ city: selectedCity, view: nextView })}
            lang={lang}
            measure={false}
          />
          <Segmented
            label="Forecast horizon"
            testIdPrefix="risk-map-horizon"
            options={[
              { id: "peak" as const, text: copy.peak },
              ...horizons.map((h) => ({ id: h, text: `+${h}w` })),
            ]}
            value={effectivePick}
            onChange={setPick}
            lang={lang}
          />
        </div>
      </CardHeader>
      <CardContent>
        {heatmaps.isError ? (
          <ErrorBanner
            title={copy.error}
            error={heatmaps.error}
            onRetry={heatmaps.refetch}
            testId="risk-map-error"
          />
        ) : heatmaps.isPending ? (
          <PanelSkeleton testId="risk-map-loading" label={copy.loading} />
        ) : mapWards.every((w) => !w.tier) ? (
          <p className="py-10 text-center text-sm text-slate">{copy.empty}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div>
              <WardRiskMap
                wards={mapWards}
                view={view}
                mode="risk"
                label={label}
                highlightWardId={hoveredWardId ?? (selectedWardId || null)}
                onSelectWard={onSelectWard}
                interactive
                showPinnedData
                lang={lang}
                className="h-[clamp(22rem,60vh,36rem)] rounded-[14px]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate">
                {tierCounts.map(({ tier, n }) => (
                  <span key={tier} className="inline-flex items-center gap-1.5">
                    <RiskTierBadge tier={tier} size="sm" lang={lang} />
                    <span className="font-mono text-ink tnum">{n}</span>
                  </span>
                ))}
                <span lang={lang} className={lang === "bn" ? "font-bangla" : undefined}>{copy.approx}</span>
              </div>
            </div>
            <section aria-labelledby="risk-map-ledger">
              <h3 id="risk-map-ledger" lang={lang} className={clsx("text-sm font-bold text-navy", lang === "bn" && "font-bangla")}>
                {copy.ledger}
              </h3>
              <ol className="mt-3 divide-y divide-mist" data-testid="risk-map-ledger">
                {ledger.map((ward) => (
                  <li key={ward.ward_id}>
                    <button
                      type="button"
                      onClick={() => onSelectWard(ward.ward_id)}
                      onMouseEnter={() => setHoveredWardId(ward.ward_id)}
                      onMouseLeave={() => setHoveredWardId(null)}
                      onFocus={() => setHoveredWardId(ward.ward_id)}
                      onBlur={() => setHoveredWardId(null)}
                      aria-current={ward.ward_id === selectedWardId ? "true" : undefined}
                      className={clsx(
                        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-paper",
                        ward.ward_id === selectedWardId && "bg-paper",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate text-sm font-semibold text-ink", lang === "bn" && "font-bangla")}>
                          {wardLabel(ward.ward_id, lang)}
                        </span>
                        <span className={clsx("block truncate text-xs text-slate tnum", lang === "bn" && "font-bangla")}>
                          {cityDisplayName(ward.city, lang)} · {ward.expected_cases?.toFixed(1)} {copy.cases}
                        </span>
                      </span>
                      {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" lang={lang} className="shrink-0" /> : null}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SegmentedProps<T extends string | number> {
  /** Mono only for measured values (+2w); words stay in Manrope. */
  measure?: boolean;
  label: string;
  testIdPrefix: string;
  options: readonly { id: T; text: string }[];
  value: T;
  onChange: (value: T) => void;
  lang: Lang;
}

function Segmented<T extends string | number>({ label, testIdPrefix, options, value, onChange, lang, measure = true }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          data-testid={`${testIdPrefix}-${option.id}`}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          lang={lang}
          className={clsx(
            "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
            lang === "bn" ? "font-bangla" : measure && typeof option.id === "number" ? "font-mono tnum" : "font-sans",
            option.id === value ? "border-royal bg-royal text-white" : "border-mist bg-white text-navy hover:bg-paper",
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}
