"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  isUnknownWardError,
  type City,
  type HorizonForecast,
  type RiskTier,
  type Ward,
  type WardForecast,
  type WeatherMode,
} from "@/lib/api/client";
import { WINDOW_HORIZONS, type HorizonWindow } from "@/lib/demo-config";
import { UI_COPY, type Lang } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import { WardNotFoundCard } from "@/components/ui/WardNotFoundCard";
import { PrintableWardBrief } from "@/components/ward-brief/PrintableWardBrief";
import { useCityForecastQuery } from "../hooks";
import { AdvisoryCard } from "./AdvisoryCard";
import { DriversList } from "./DriversList";
import { ForecastChart } from "./ForecastChart";
import { HorizonTable } from "./HorizonTable";
import { PeakTierCard } from "./PeakTierCard";
import { WardRailList } from "./WardRailList";

export interface WardForecastViewProps {
  city: City;
  cityWards: readonly Ward[];
  selectedWardId: string;
  unknownWardId: string | null;
  originWeek: string;
  windowKey: HorizonWindow;
  source: WeatherMode;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
  onResetUnknownWard: () => void;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

function findPeakHorizon(horizons: readonly HorizonForecast[]): HorizonForecast | null {
  if (horizons.length === 0) return null;
  return horizons.reduce((best, cur) => {
    const rankDiff = TIER_RANK[cur.tier] - TIER_RANK[best.tier];
    if (rankDiff !== 0) return rankDiff > 0 ? cur : best;
    return cur.expected_cases > best.expected_cases ? cur : best;
  }, horizons[0]);
}

export function WardForecastView({
  city,
  cityWards,
  selectedWardId,
  unknownWardId,
  originWeek,
  windowKey,
  source,
  lang,
  onSelectWard,
  onResetUnknownWard,
}: WardForecastViewProps) {
  const [inspectedHorizon, setInspectedHorizon] = useState<number | null>(null);
  const copy = UI_COPY[lang].wardRisk;

  const wardIds = useMemo(() => cityWards.map((w) => w.ward_id), [cityWards]);
  const horizons = WINDOW_HORIZONS[windowKey];

  const forecastQuery = useCityForecastQuery({
    wardIds,
    originWeek,
    horizons,
    source,
    enabled: !unknownWardId && wardIds.length > 0 && Boolean(originWeek),
  });

  const wardMetaMap = useMemo(() => {
    const m = new Map<string, Ward>();
    for (const w of cityWards) m.set(w.ward_id, w);
    return m;
  }, [cityWards]);

  const sortedForecasts = useMemo<WardForecast[]>(() => {
    const list = forecastQuery.data?.forecasts ?? [];
    return [...list].sort((a, b) => {
      const tierDiff = TIER_RANK[b.peak_tier] - TIER_RANK[a.peak_tier];
      if (tierDiff !== 0) return tierDiff;
      const peakA = Math.max(0, ...a.horizons.map((h) => h.expected_cases));
      const peakB = Math.max(0, ...b.horizons.map((h) => h.expected_cases));
      if (peakB !== peakA) return peakB - peakA;
      return a.ward_id.localeCompare(b.ward_id);
    });
  }, [forecastQuery.data?.forecasts]);

  if (unknownWardId) {
    return (
      <WardNotFoundCard
        wardId={unknownWardId}
        onReset={onResetUnknownWard}
        lang={lang}
      />
    );
  }

  // Error guard (AC-8): never display a stale tier card when forecast request fails.
  if (forecastQuery.isError) {
    if (isUnknownWardError(forecastQuery.error)) {
      return (
        <WardNotFoundCard
          detail={forecastQuery.error.detail ?? forecastQuery.error.title}
          onReset={onResetUnknownWard}
          lang={lang}
        />
      );
    }

    return (
      <ErrorBanner
        testId="forecast-error-banner"
        retryTestId="forecast-retry"
        title="Could not load ward forecast"
        error={forecastQuery.error}
        onRetry={() => {
          void forecastQuery.refetch();
        }}
      />
    );
  }

  if (forecastQuery.isPending || (forecastQuery.isFetching && !forecastQuery.data)) {
    return (
      <PanelSkeleton
        testId="ward-forecast-loading"
        label="Loading ward forecast…"
      />
    );
  }

  const response = forecastQuery.data;
  const selectedForecast =
    sortedForecasts.find((f) => f.ward_id === selectedWardId) ?? sortedForecasts[0] ?? null;

  if (!response || !selectedForecast) {
    return (
      <EmptyState
        testId="ward-empty-state"
        title="No forecast available for this selection"
        description="Choose a city, ward, and Monday origin week above to load the 2–4-week dengue early-warning outlook."
        actionLabel="Load Dhaka South default ward"
        onAction={onResetUnknownWard}
      />
    );
  }

  const peakHorizon = findPeakHorizon(selectedForecast.horizons);
  const activeDriverHorizon =
    selectedForecast.horizons.find((h) => h.horizon === inspectedHorizon) ?? peakHorizon;
  const wardMeta = wardMetaMap.get(selectedForecast.ward_id);
  const escalated = selectedForecast.horizons.some((h) => h.tier_escalated);

  const tierCounts: Record<RiskTier, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };
  for (const fc of sortedForecasts) {
    tierCounts[fc.peak_tier] += 1;
  }

  return (
    <div className="space-y-4">
      <StubDataBanner modelVersion={response.model_version} />

      <PrintableWardBrief
        forecast={selectedForecast}
        wardMeta={wardMeta}
        originWeek={response.origin_week}
        modelVersion={response.model_version}
        lang={lang}
      />

      <div className="no-print grid gap-5 lg:grid-cols-[332px_1fr] lg:items-start">
        <WardRailList
          city={city}
          sortedForecasts={sortedForecasts}
          selectedWardId={selectedForecast.ward_id}
          tierCounts={tierCounts}
          lang={lang}
          findPeakHorizon={findPeakHorizon}
          onSelectWard={(wid) => {
            setInspectedHorizon(null);
            onSelectWard(wid);
          }}
        />

        <div className="space-y-5" aria-live="polite">
          <PeakTierCard
            response={response}
            selectedForecast={selectedForecast}
            peakHorizon={peakHorizon}
            wardMeta={wardMeta}
            windowKey={windowKey}
            escalated={escalated}
            lang={lang}
            onPrintBrief={() => {
              if (typeof window !== "undefined") window.print();
            }}
          />

          <Card className="overflow-hidden">
            <CardHeader className="bg-paper/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
                  {copy.trajectoryTitle}
                </CardTitle>
                <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
                  {copy.trajectoryDesc}
                </CardDescription>
              </div>
              <div className={clsx("flex items-center gap-3 text-xs font-medium text-slate", lang === "bn" && "font-bangla")}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-mist/80">
                  <span className="h-0.5 w-3.5 rounded-full bg-royal" aria-hidden="true" />
                  {lang === "bn" ? "প্রত্যাশিত রোগী" : "Expected cases"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-mist/80">
                  <span
                    className="h-2.5 w-3.5 rounded-xs border border-royal/30 bg-forecast-band"
                    aria-hidden="true"
                  />
                  {lang === "bn" ? "৮০% পরিসর" : "80% band"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <ForecastChart horizons={selectedForecast.horizons} />
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <HorizonTable
              horizons={selectedForecast.horizons}
              activeHorizon={activeDriverHorizon?.horizon ?? null}
              lang={lang}
              onSelectHorizon={setInspectedHorizon}
            />

            <Card className="overflow-hidden">
              <CardHeader className="bg-paper/40">
                <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
                  {copy.driversTitle}
                </CardTitle>
                <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
                  {copy.driversDescPrefix}{" "}
                  <span className="font-semibold text-navy tnum">
                    {activeDriverHorizon
                      ? `+${activeDriverHorizon.horizon}w (${activeDriverHorizon.target_week})`
                      : "selected window"}
                  </span>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DriversList
                  drivers={activeDriverHorizon?.drivers ?? []}
                  horizonLabel={
                    activeDriverHorizon
                      ? `+${activeDriverHorizon.horizon}w · ${activeDriverHorizon.target_week}`
                      : "peak horizon"
                  }
                  lang={lang}
                />
              </CardContent>
            </Card>
          </div>

          {activeDriverHorizon ? (
            <AdvisoryCard
              wardId={selectedForecast.ward_id}
              originWeek={response.origin_week}
              horizon={activeDriverHorizon.horizon}
              lang={lang}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
