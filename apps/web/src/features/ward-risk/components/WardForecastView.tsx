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
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
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
import { useCityForecastQuery } from "../hooks";
import { DriversList } from "./DriversList";
import { ForecastChart } from "./ForecastChart";

export interface WardForecastViewProps {
  city: City;
  cityWards: readonly Ward[];
  selectedWardId: string;
  unknownWardId: string | null;
  originWeek: string;
  windowKey: HorizonWindow;
  source: WeatherMode;
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

function formatWeatherSourceLabel(ws: string): string {
  switch (ws) {
    case "live":
      return "Live · Open-Meteo (city centroid)";
    case "cache":
      return "Cached weather (stale fallback)";
    case "climatology":
      return "Climatology fallback";
    default:
      return "Dataset mode (offline)";
  }
}

export function WardForecastView({
  city,
  cityWards,
  selectedWardId,
  unknownWardId,
  originWeek,
  windowKey,
  source,
  onSelectWard,
  onResetUnknownWard,
}: WardForecastViewProps) {
  const [inspectedHorizon, setInspectedHorizon] = useState<number | null>(null);

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

  // Unknown ward guard (AC-8): show explicit message, never a blank chart or stale tier.
  if (unknownWardId) {
    return (
      <div
        data-testid="ward-not-found"
        role="alert"
        className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
      >
        <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
        <p className="text-sm text-slate">
          No ward matching{" "}
          <code className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">
            {unknownWardId}
          </code>{" "}
          exists in the seeded dataset. Select a valid ward to view its early-warning forecast.
        </p>
        <button
          type="button"
          data-testid="ward-not-found-reset"
          onClick={onResetUnknownWard}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
        >
          Select Dhaka South default ward
        </button>
      </div>
    );
  }

  // Error guard (AC-8): NEVER display a stale tier card when forecast request fails.
  if (forecastQuery.isError) {
    if (isUnknownWardError(forecastQuery.error)) {
      return (
        <div
          data-testid="ward-not-found"
          role="alert"
          className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
        >
          <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
          <p className="text-sm text-slate">{forecastQuery.error.detail ?? forecastQuery.error.title}</p>
          <button
            type="button"
            data-testid="ward-not-found-reset"
            onClick={onResetUnknownWard}
            className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
          >
            Select Dhaka South default ward
          </button>
        </div>
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

  if (forecastQuery.isPending || forecastQuery.isFetching && !forecastQuery.data) {
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

  // Count wards per tier in the selected city
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
      <div className="grid gap-5 lg:grid-cols-[310px_1fr] lg:items-start">
      {/* Left rail: City Ward Priority List */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-paper py-3.5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">{city} wards</CardTitle>
            <span className="font-mono text-xs text-slate tnum">
              {sortedForecasts.length} total
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px] text-slate tnum">
            {([...TIER_ORDER].reverse() as RiskTier[]).map((t) => (
              <span
                key={t}
                className="rounded-sm border border-mist bg-white px-1.5 py-0.5"
              >
                {t}: {tierCounts[t]}
              </span>
            ))}
          </div>
        </CardHeader>

        <ul
          data-testid="ward-priority-list"
          className="max-h-[640px] divide-y divide-mist overflow-y-auto"
        >
          {sortedForecasts.map((wf) => {
            const isSelected = wf.ward_id === selectedForecast.ward_id;
            const wfPeak = findPeakHorizon(wf.horizons);
            return (
              <li key={wf.ward_id}>
                <button
                  type="button"
                  data-testid={`ward-row-${wf.ward_id}`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => {
                    setInspectedHorizon(null);
                    onSelectWard(wf.ward_id);
                  }}
                  className={clsx(
                    "flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left",
                    isSelected
                      ? "bg-paper border-l-4 border-l-royal"
                      : "bg-white hover:bg-paper/60 border-l-4 border-l-transparent",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-navy tnum">
                      {wf.ward_id}
                    </p>
                    {wfPeak ? (
                      <p className="font-mono text-xs text-slate tnum">
                        Peak {wfPeak.expected_cases.toFixed(1)} cases (+{wfPeak.horizon}w)
                      </p>
                    ) : null}
                  </div>
                  <RiskTierBadge tier={wf.peak_tier} size="sm" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Main content column */}
      <div className="space-y-5" aria-live="polite">
        {/* Peak-Window Tier Card */}
        <Card data-testid="peak-tier-card">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-mono text-lg tnum">
                  {selectedForecast.ward_id}
                </CardTitle>
                <span className="rounded-sm bg-paper px-2 py-0.5 text-xs font-medium text-navy">
                  {selectedForecast.city}
                </span>
                <span className="rounded-sm border border-mist px-2 py-0.5 font-mono text-xs text-slate tnum">
                  Window {windowKey === "2-4w" ? "2–4w" : "1–4w"}
                </span>
              </div>
              <CardDescription className="font-mono text-xs tnum">
                Origin week {response.origin_week} · {formatWeatherSourceLabel(response.weather_source)} · Model{" "}
                {response.model_version}
                {response.cached ? " · cached" : ""}
              </CardDescription>
            </div>

            <RiskTierBadge
              tier={selectedForecast.peak_tier}
              size="lg"
              showAction
              data-testid="peak-tier-badge"
            />
          </CardHeader>

          <CardContent className="space-y-4">
            {peakHorizon ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-mist bg-paper p-3.5">
                  <p className="text-xs font-semibold text-slate">Peak risk score</p>
                  <p
                    data-testid="peak-risk-score"
                    className="mt-1 font-mono text-2xl font-bold text-navy tnum"
                  >
                    {peakHorizon.risk_score}
                    <span className="text-sm font-medium text-slate"> / 100</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate">
                    Probability of reaching High cut-off
                  </p>
                </div>

                <div className="rounded-md border border-mist bg-paper p-3.5">
                  <p className="text-xs font-semibold text-slate">
                    Peak expected cases (+{peakHorizon.horizon}w)
                  </p>
                  <p
                    data-testid="peak-expected-cases"
                    className="mt-1 font-mono text-2xl font-bold text-navy tnum"
                  >
                    {peakHorizon.expected_cases.toFixed(1)}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate tnum">
                    80% band: {peakHorizon.p10.toFixed(1)} – {peakHorizon.p90.toFixed(1)} cases
                  </p>
                </div>

                <div className="rounded-md border border-mist bg-paper p-3.5">
                  <p className="text-xs font-semibold text-slate">Peak target week</p>
                  <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                    {peakHorizon.target_week}
                  </p>
                  <p className="mt-0.5 text-xs text-slate">
                    +{peakHorizon.horizon} week{peakHorizon.horizon === 1 ? "" : "s"} after origin
                  </p>
                </div>
              </div>
            ) : null}

            {escalated ? (
              <p className="rounded-md border border-risk-medium bg-paper px-3 py-2 text-xs font-medium text-ink">
                Upper 80% bound (P90) exceeds this ward&apos;s seasonal endemic threshold — tier escalated by +1 level.
              </p>
            ) : null}

            {wardMeta ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-mist pt-3 text-xs text-slate">
                <span>
                  Water-logging index:{" "}
                  <strong className="font-mono text-ink tnum">
                    {wardMeta.water_logging_risk_index.toFixed(2)}
                  </strong>
                </span>
                <span>
                  Population density:{" "}
                  <strong className="font-mono text-ink tnum">
                    {Math.round(wardMeta.population_density_sqkm).toLocaleString()} / km²
                  </strong>
                </span>
                <span>
                  Sanitation score:{" "}
                  <strong className="font-mono text-ink tnum">
                    {wardMeta.sanitation_score.toFixed(2)}
                  </strong>
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Forecast Trajectory Chart */}
        <Card>
          <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Weekly forecast trajectory &amp; 80% band</CardTitle>
              <CardDescription>
                Expected weekly cases (Royal line) with conformal 80% uncertainty range (P10–P90).
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-royal" aria-hidden="true" />
                Expected cases
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-xs border border-royal/30 bg-forecast-band" aria-hidden="true" />
                80% band
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ForecastChart horizons={selectedForecast.horizons} />
          </CardContent>
        </Card>

        {/* Per-Horizon Table & Top 4 Drivers */}
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Per-horizon outlook</CardTitle>
              <CardDescription>
                Select any horizon row to inspect its top four drivers.
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
                    <th scope="col" className="px-4 py-2.5">Horizon</th>
                    <th scope="col" className="px-4 py-2.5">Target week</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Expected</th>
                    <th scope="col" className="px-4 py-2.5 text-right">80% band</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Score</th>
                    <th scope="col" className="px-4 py-2.5">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {selectedForecast.horizons.map((h) => {
                    const active = activeDriverHorizon?.horizon === h.horizon;
                    return (
                      <tr
                        key={h.horizon}
                        data-testid={`horizon-row-${h.horizon}`}
                        onClick={() => setInspectedHorizon(h.horizon)}
                        className={clsx(
                          "cursor-pointer",
                          active ? "bg-paper" : "bg-white hover:bg-paper/60",
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-navy tnum">
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setInspectedHorizon(h.horizon)}
                            className="cursor-pointer font-mono text-xs font-semibold text-navy hover:text-royal tnum"
                          >
                            +{h.horizon}w
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink tnum">
                          {h.target_week}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink tnum">
                          {h.expected_cases.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate tnum">
                          {h.p10.toFixed(1)}–{h.p90.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-ink tnum">
                          {h.risk_score}
                        </td>
                        <td className="px-4 py-3">
                          <RiskTierBadge tier={h.tier} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top drivers</CardTitle>
              <CardDescription>
                Primary weather and ward vulnerability signals for{" "}
                <span className="font-mono text-navy tnum">
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
              />
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}
