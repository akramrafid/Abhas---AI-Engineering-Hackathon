"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { BrandRibbon } from "@/components/brand/BrandRibbon";
import { Providers } from "@/components/Providers";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SelectField } from "@/components/ui/Select";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { TabNav, type TabItem } from "@/components/ui/Tabs";
import { HeatmapView } from "@/features/heatmap/components/HeatmapView";
import { LagsPanel } from "@/features/lags/components/LagsPanel";
import { ScenarioPanel } from "@/features/scenario/components/ScenarioPanel";
import { ValidationView } from "@/features/validation/components/ValidationView";
import { WardForecastView } from "@/features/ward-risk/components/WardForecastView";
import {
  useWardsQuery,
  useWeatherStatusQuery,
  type City,
  type WeatherMode,
} from "@/lib/api/client";
import {
  DEFAULT_DATA_END,
  DEFAULT_FIRST_FORECAST_ORIGIN,
  DEMO_CONFIG,
  generateMondayWeeks,
  isValidMondayInRange,
  type HorizonWindow,
} from "@/lib/demo-config";

type DashboardTab = "ward-risk" | "lags" | "scenario" | "heatmap" | "validation";

const DASHBOARD_TABS: readonly TabItem<DashboardTab>[] = [
  { id: "ward-risk", label: "Ward Forecast", testId: "tab-ward-risk" },
  { id: "lags", label: "Lags", testId: "tab-lags" },
  { id: "scenario", label: "Scenario", testId: "tab-scenario" },
  { id: "heatmap", label: "City Heatmap", testId: "tab-heatmap" },
  { id: "validation", label: "Validation", testId: "tab-validation" },
];

function DashboardWorkspace() {
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "1";
  const urlWardParam = searchParams.get("ward")?.trim() || null;

  const [activeTab, setActiveTab] = useState<DashboardTab>("ward-risk");
  const [cityOverride, setCityOverride] = useState<City | null>(null);
  const [wardOverride, setWardOverride] = useState<string | null>(null);
  const [originWeekOverride, setOriginWeekOverride] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<HorizonWindow>(
    isDemoMode ? DEMO_CONFIG.window : "2-4w",
  );
  const [dismissedUrlWard, setDismissedUrlWard] = useState(false);

  const wardsQuery = useWardsQuery();
  const weatherStatusQuery = useWeatherStatusQuery();

  const wardsData = wardsQuery.data;
  const allWards = useMemo(() => wardsData?.wards ?? [], [wardsData?.wards]);
  const cities = useMemo<City[]>(
    () =>
      wardsData?.cities ?? [
        "Dhaka South",
        "Dhaka North",
        "Chattogram",
        "Gazipur",
        "Narayanganj",
      ],
    [wardsData?.cities],
  );

  // Resolve ?ward=<id> against loaded wards; preserve unknown ID so UI shows "Ward not found".
  const activeUrlWard = !dismissedUrlWard && !wardOverride ? urlWardParam : null;
  const matchedUrlWard = useMemo(() => {
    if (!activeUrlWard || !wardsData) return null;
    return allWards.find((w) => w.ward_id === activeUrlWard) ?? null;
  }, [activeUrlWard, wardsData, allWards]);

  const unknownWardId =
    activeUrlWard && wardsData && !matchedUrlWard ? activeUrlWard : null;

  // Determine selected city cleanly (derived during render, no cascading setState effects).
  const selectedCity: City = useMemo(() => {
    if (cityOverride && cities.includes(cityOverride)) return cityOverride;
    if (matchedUrlWard) return matchedUrlWard.city;
    if (cities.includes(DEMO_CONFIG.city)) return DEMO_CONFIG.city;
    return cities[0] ?? DEMO_CONFIG.city;
  }, [cityOverride, cities, matchedUrlWard]);

  const cityWards = useMemo(
    () => allWards.filter((w) => w.city === selectedCity),
    [allWards, selectedCity],
  );

  // Determine selected ward cleanly.
  const selectedWardId: string = useMemo(() => {
    if (unknownWardId) return "";
    if (wardOverride && cityWards.some((w) => w.ward_id === wardOverride)) {
      return wardOverride;
    }
    if (matchedUrlWard && matchedUrlWard.city === selectedCity) {
      return matchedUrlWard.ward_id;
    }
    if (
      selectedCity === DEMO_CONFIG.city &&
      cityWards.some((w) => w.ward_id === DEMO_CONFIG.wardId)
    ) {
      return DEMO_CONFIG.wardId;
    }
    return cityWards[0]?.ward_id ?? "";
  }, [unknownWardId, wardOverride, cityWards, matchedUrlWard, selectedCity]);

  const firstOrigin = wardsData?.first_forecast_origin ?? DEFAULT_FIRST_FORECAST_ORIGIN;
  const dataEnd = wardsData?.data_end ?? DEFAULT_DATA_END;

  const mondayWeeks = useMemo(
    () => generateMondayWeeks(firstOrigin, dataEnd),
    [firstOrigin, dataEnd],
  );

  const selectedOriginWeek = useMemo(() => {
    if (
      originWeekOverride &&
      isValidMondayInRange(originWeekOverride, firstOrigin, dataEnd)
    ) {
      return originWeekOverride;
    }
    if (isValidMondayInRange(DEMO_CONFIG.originWeek, firstOrigin, dataEnd)) {
      return DEMO_CONFIG.originWeek;
    }
    return mondayWeeks[0] ?? DEMO_CONFIG.originWeek;
  }, [originWeekOverride, firstOrigin, dataEnd, mondayWeeks]);

  // Demo mode stays 100% offline in dataset mode (AC-11).
  const activeSource: WeatherMode = isDemoMode
    ? "dataset"
    : weatherStatusQuery.data?.mode ?? "dataset";

  const cityWeatherSummary = weatherStatusQuery.data?.cities.find(
    (c) => c.city === selectedCity,
  );
  const weatherBadgeText = isDemoMode
    ? "Dataset mode (offline)"
    : cityWeatherSummary?.source === "live"
      ? "Live · Open-Meteo (city centroid)"
      : cityWeatherSummary?.source === "cache"
        ? "Cached weather"
        : cityWeatherSummary?.source === "climatology"
          ? "Climatology fallback"
          : "Dataset mode (offline)";

  const handleResetUnknownWard = () => {
    setDismissedUrlWard(true);
    setCityOverride(DEMO_CONFIG.city);
    setWardOverride(null);
  };

  const handleSelectWardFromMatrix = (wardId: string) => {
    const found = allWards.find((w) => w.ward_id === wardId);
    if (found) {
      setDismissedUrlWard(true);
      setCityOverride(found.city);
      setWardOverride(found.ward_id);
      setActiveTab("ward-risk");
    }
  };

  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities],
  );

  const wardOptions = useMemo(() => {
    if (unknownWardId) {
      return [
        { value: "", label: `Unknown ward (${unknownWardId})` },
        ...cityWards.map((w) => ({ value: w.ward_id, label: w.ward_id })),
      ];
    }
    return cityWards.map((w) => ({ value: w.ward_id, label: w.ward_id }));
  }, [cityWards, unknownWardId]);

  const weekOptions = useMemo(
    () => mondayWeeks.map((w) => ({ value: w, label: `${w} (Mon)` })),
    [mondayWeeks],
  );

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Dark Ink Brand Header (sole surface carrying reverse logo with Lime cap) */}
      <header className="relative overflow-hidden bg-ink text-white">
        <BrandRibbon variant="strip" surface="ink" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <AbhasLogo
              variant="reverse"
              size="sm"
              showBangla
              city={selectedCity}
            />
            <div className="border-l border-white/20 pl-3 sm:pl-4">
              <h1 className="font-sans text-sm font-semibold text-white">
                Ward-level dengue early warning
              </h1>
              <p className="hidden text-xs text-mist sm:block">
                Rain today. Risk in three weeks. Act now.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDemoMode ? (
              <span
                data-testid="demo-mode-badge"
                className="inline-flex items-center rounded-sm border border-white/25 bg-navy px-2.5 py-1 font-mono text-xs font-semibold text-white"
              >
                Demo mode · offline
              </span>
            ) : null}

            <span
              data-testid="weather-source-badge"
              className="inline-flex items-center rounded-sm border border-white/20 bg-navy/80 px-2.5 py-1 font-mono text-xs text-mist"
            >
              {weatherBadgeText}
            </span>

            <Link
              href="/brand"
              data-testid="nav-brand-link"
              className="inline-flex min-h-9 items-center rounded-md border border-white/25 bg-navy px-3 text-xs font-semibold text-white hover:bg-royal"
            >
              Brand System
            </Link>
          </div>
        </div>
      </header>

      {/* Primary View Tabs */}
      <nav
        aria-label="Dashboard views"
        className="border-b border-mist bg-white"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TabNav
            tabs={DASHBOARD_TABS}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </nav>

      {/* Main Clinical Data Workspace — strictly zero Lime anywhere inside [data-view="data"] */}
      <main
        data-view="data"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6"
      >
        {/* Shared Selection Bar (hidden on Validation tab where backtests span all 60 wards) */}
        {activeTab !== "validation" ? (
          <section
            aria-label="Forecast selection controls"
            className="rounded-lg border border-mist bg-white p-4"
          >
            {wardsQuery.isError ? (
              <ErrorBanner
                testId="wards-error-banner"
                retryTestId="retry-button"
                title="Could not load ward directory"
                error={wardsQuery.error}
                onRetry={() => {
                  void wardsQuery.refetch();
                }}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                <SelectField
                  id="city-select"
                  label="City"
                  testId="city-select"
                  value={selectedCity}
                  disabled={wardsQuery.isPending}
                  options={cityOptions}
                  onChange={(e) => {
                    setDismissedUrlWard(true);
                    setCityOverride(e.target.value as City);
                    setWardOverride(null);
                  }}
                />

                <SelectField
                  id="ward-select"
                  label="Ward"
                  testId="ward-select"
                  mono
                  value={selectedWardId}
                  disabled={wardsQuery.isPending || wardOptions.length === 0}
                  options={
                    wardOptions.length > 0
                      ? wardOptions
                      : [{ value: "", label: "Loading wards…" }]
                  }
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setDismissedUrlWard(true);
                    setWardOverride(e.target.value);
                  }}
                />

                <SelectField
                  id="origin-week-select"
                  label="Origin week (Monday)"
                  testId="origin-week-select"
                  mono
                  value={selectedOriginWeek}
                  disabled={wardsQuery.isPending}
                  options={weekOptions}
                  onChange={(e) => setOriginWeekOverride(e.target.value)}
                />

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate">
                    Forecast window
                  </span>
                  <div
                    data-testid="window-toggle"
                    role="group"
                    aria-label="Forecast horizon window"
                    className="inline-flex min-h-10 rounded-md border border-mist bg-paper p-0.5"
                  >
                    {(["1-4w", "2-4w"] as const).map((w) => {
                      const active = windowKey === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          data-testid={`window-${w}`}
                          aria-pressed={active}
                          onClick={() => setWindowKey(w)}
                          className={clsx(
                            "cursor-pointer rounded-sm px-3 font-mono text-xs font-semibold tnum",
                            active
                              ? "bg-royal text-white"
                              : "text-navy hover:bg-white",
                          )}
                        >
                          {w === "1-4w" ? "1–4w" : "2–4w"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* Active Tab Panel */}
        <section
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-btn-${activeTab}`}
          className="flex-1"
        >
          {activeTab === "ward-risk" && !wardsQuery.isError ? (
            wardsQuery.isPending ? (
              <PanelSkeleton
                testId="ward-forecast-loading"
                label="Loading wards and forecast…"
              />
            ) : (
              <WardForecastView
                city={selectedCity}
                cityWards={cityWards}
                selectedWardId={selectedWardId}
                unknownWardId={unknownWardId}
                originWeek={selectedOriginWeek}
                windowKey={windowKey}
                source={activeSource}
                onSelectWard={(wid) => {
                  setDismissedUrlWard(true);
                  setWardOverride(wid);
                }}
                onResetUnknownWard={handleResetUnknownWard}
              />
            )
          ) : null}

          {activeTab === "lags" && !wardsQuery.isError ? (
            <LagsPanel
              wardId={selectedWardId}
              unknownWardId={unknownWardId}
              onResetUnknownWard={handleResetUnknownWard}
            />
          ) : null}

          {activeTab === "scenario" && !wardsQuery.isError ? (
            <ScenarioPanel
              wardId={selectedWardId}
              originWeek={selectedOriginWeek}
              unknownWardId={unknownWardId}
              onResetUnknownWard={handleResetUnknownWard}
            />
          ) : null}

          {activeTab === "heatmap" && !wardsQuery.isError ? (
            <HeatmapView
              city={selectedCity}
              originWeek={selectedOriginWeek}
              source={activeSource}
              onSelectWard={handleSelectWardFromMatrix}
              onResetCity={() => {
                setCityOverride(DEMO_CONFIG.city);
                setWardOverride(null);
              }}
            />
          ) : null}

          {activeTab === "validation" ? <ValidationView /> : null}
        </section>
      </main>

      <footer className="border-t border-mist bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-slate sm:px-6">
          <span>
            Abhas (<span lang="bn" className="font-bangla">আভাস</span>) · Multi-week rainfall lag
            early warning · Weather attribution: Open-Meteo (CC BY 4.0)
          </span>
          <Link href="/brand" className="font-semibold text-royal hover:underline">
            Brand tokens &amp; tier scale
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Providers>
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl p-6">
            <PanelSkeleton label="Loading Abhas dashboard…" />
          </div>
        }
      >
        <DashboardWorkspace />
      </Suspense>
    </Providers>
  );
}
