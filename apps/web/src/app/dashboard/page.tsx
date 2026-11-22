"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "@/components/icons";
import { clsx } from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SelectionBar } from "@/components/dashboard/SelectionBar";
import { Providers } from "@/components/Providers";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { AlertsDialog } from "@/components/dashboard/shell/AlertsDialog";
import { CommandSearch } from "@/components/dashboard/shell/CommandSearch";
import { StatTiles } from "@/components/dashboard/shell/StatTiles";
import { useWorkspaceSignals } from "@/components/dashboard/shell/useWorkspaceSignals";
import { useDashboardTheme } from "@/components/dashboard/shell/theme";
import { VIEW_META } from "@/components/dashboard/shell/views";
import { ViewDock, type DockItem } from "@/components/dashboard/shell/ViewDock";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { downloadCsv } from "@/lib/csv";
import { AboutCostView } from "@/features/about/components/AboutCostView";
import { HeatmapView } from "@/features/heatmap/components/HeatmapView";
import { LagsPanel } from "@/features/lags/components/LagsPanel";
import { PriorityListView } from "@/features/priority/components/PriorityListView";
import { RiskMapView } from "@/features/risk-map/components/RiskMapView";
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
  isHorizonWindow,
  isValidMondayInRange,
  type HorizonWindow,
} from "@/lib/demo-config";
import {
  isDashboardTab,
  isLang,
  UI_COPY,
  type DashboardTab,
  type Lang,
} from "@/lib/i18n";

function DashboardWorkspace() {
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "1";
  const urlWardParam = searchParams.get("ward")?.trim() || null;
  const urlOriginParam = searchParams.get("origin")?.trim() || null;
  const urlWindowParam = searchParams.get("window")?.trim() || null;
  const urlTabParam = searchParams.get("tab")?.trim() || null;
  const urlLangParam = searchParams.get("lang")?.trim() || null;

  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    isDashboardTab(urlTabParam) ? urlTabParam : "ward-risk",
  );
  const [lang, setLang] = useState<Lang>(() =>
    isLang(urlLangParam) ? urlLangParam : "en",
  );
  const [cityOverride, setCityOverride] = useState<City | null>(null);
  const [wardOverride, setWardOverride] = useState<string | null>(null);
  const [originWeekOverride, setOriginWeekOverride] = useState<string | null>(
    () => urlOriginParam,
  );
  const [windowKey, setWindowKey] = useState<HorizonWindow>(() => {
    if (isHorizonWindow(urlWindowParam)) return urlWindowParam;
    return isDemoMode ? DEMO_CONFIG.window : "2-4w";
  });
  const [dismissedUrlWard, setDismissedUrlWard] = useState(false);
  const [scenarioManualSelection, setScenarioManualSelection] = useState(false);

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

  // Synchronize HTML lang attribute and shareable URL state (?ward=&origin=&window=&tab=&lang=).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!wardsData) return;

    const params = new URLSearchParams();
    if (isDemoMode) params.set("demo", "1");
    const effectiveWard = unknownWardId ?? selectedWardId;
    if (effectiveWard) params.set("ward", effectiveWard);
    if (selectedOriginWeek) params.set("origin", selectedOriginWeek);
    params.set("window", windowKey);
    params.set("tab", activeTab);
    params.set("lang", lang);

    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch) {
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
  }, [
    wardsData,
    isDemoMode,
    unknownWardId,
    selectedWardId,
    selectedOriginWeek,
    windowKey,
    activeTab,
    lang,
  ]);

  // In demo mode, ScenarioPanel uses the pinned dry (< 20 mm) non-Critical baseline (CR-2 / AC-7)
  // unless the officer manually overrides the selection while on the Scenario tab.
  const scenarioUsesDemoBaseline =
    isDemoMode &&
    !scenarioManualSelection &&
    !unknownWardId &&
    (allWards.length === 0 ||
      allWards.some((w) => w.ward_id === DEMO_CONFIG.scenarioBaseline.wardId)) &&
    isValidMondayInRange(DEMO_CONFIG.scenarioBaseline.originWeek, firstOrigin, dataEnd);
  const scenarioWardId = scenarioUsesDemoBaseline
    ? DEMO_CONFIG.scenarioBaseline.wardId
    : selectedWardId;
  const scenarioOriginWeek = scenarioUsesDemoBaseline
    ? DEMO_CONFIG.scenarioBaseline.originWeek
    : selectedOriginWeek;

  // Demo mode stays 100% offline in dataset mode (AC-11).
  const activeSource: WeatherMode = isDemoMode
    ? "dataset"
    : weatherStatusQuery.data?.mode ?? "dataset";

  const cityWeatherSummary = weatherStatusQuery.data?.cities.find(
    (c) => c.city === selectedCity,
  );
  const weatherSourceUsed = isDemoMode
    ? "dataset"
    : cityWeatherSummary?.source ?? "dataset";
  const weatherBadgeText = UI_COPY[lang].weatherSource[weatherSourceUsed];

  const tabs = useMemo<readonly DockItem[]>(() => {
    const labels = UI_COPY[lang].tabs;
    return [
      { id: "ward-risk", label: labels["ward-risk"], testId: "tab-ward-risk" },
      { id: "map", label: labels.map, testId: "tab-map" },
      { id: "lags", label: labels.lags, testId: "tab-lags" },
      { id: "scenario", label: labels.scenario, testId: "tab-scenario" },
      { id: "heatmap", label: labels.heatmap, testId: "tab-heatmap" },
      { id: "priority", label: labels.priority, testId: "tab-priority" },
      { id: "validation", label: labels.validation, testId: "tab-validation" },
      { id: "about", label: labels.about, testId: "tab-about" },
    ];
  }, [lang]);

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

  const showSelectionBar = activeTab !== "validation" && activeTab !== "about";

  // Shell: theme (remembered per browser), search (Ctrl+K), alerts, CSV export, view transitions.
  const [dark, toggleTheme] = useDashboardTheme();
  const [dialog, setDialog] = useState<"search" | "alerts" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const signals = useWorkspaceSignals(allWards, selectedCity, selectedOriginWeek, windowKey, activeSource);
  const meta = VIEW_META[activeTab];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportCsv = useCallback(() => {
    downloadCsv("abhas-forecasts-" + selectedOriginWeek + "-" + windowKey + ".csv", signals.exportRows);
  }, [selectedOriginWeek, windowKey, signals.exportRows]);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        const layer = contentRef.current;
        if (!layer) return;
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .fromTo(
            layer,
            { opacity: 0.72, y: 8 },
            { opacity: 1, y: 0, duration: 0.28, clearProps: "opacity,transform" },
          )
          .from(
            layer.querySelectorAll(":scope > * > *"),
            { y: 10, opacity: 0, duration: 0.34, stagger: 0.035, clearProps: "transform,opacity" },
            0.02,
          );
      });
    },
    { dependencies: [activeTab], scope: contentRef, revertOnUpdate: true },
  );

  return (
    <div
      data-theme={dark ? "dark" : "light"}
      className={clsx("flex min-h-screen flex-col pb-24 pt-3 lg:pb-0", dark ? "bg-ink text-white" : "bg-paper text-ink")}
    >
      <DashboardHeader
        selectedCity={selectedCity}
        isDemoMode={isDemoMode}
        weatherBadgeText={weatherBadgeText}
        lang={lang}
        onChangeLang={setLang}
        dark={dark}
        onToggleTheme={toggleTheme}
        onOpenSearch={() => setDialog("search")}
        alertCount={signals.alerts.length}
        onOpenAlerts={() => setDialog("alerts")}
      />

      <div className="mx-auto flex w-full max-w-[96rem] flex-1 gap-5 px-3 pt-5 sm:px-5">
        <ViewDock items={tabs} active={activeTab} onChange={setActiveTab} lang={lang} dark={dark} />

      {/* Main Clinical Data Workspace — strictly zero Lime anywhere inside [data-view="data"] */}
      <main
        data-view="data"
        className="flex min-w-0 flex-1 flex-col gap-5 pb-8"
      >
        <header className="no-print flex flex-wrap items-end justify-between gap-4 pt-2">
          <div className="max-w-3xl">
            <h1
              lang={lang}
              className={clsx(
                "text-[clamp(1.75rem,3.2vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em]",
                dark ? "text-white" : "text-navy",
                lang === "bn" && "font-bangla",
              )}
            >
              {tabs.find((t) => t.id === activeTab)?.label}
            </h1>
            <p lang={lang} className={clsx("mt-2 text-body", dark ? "text-mist" : "text-slate", lang === "bn" && "font-bangla")}>
              {meta.description[lang]}
            </p>
          </div>
          <button
            type="button"
            data-testid="export-csv"
            onClick={exportCsv}
            disabled={signals.exportRows.length < 2}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[linear-gradient(135deg,#2F5BFF_0%,#1D42E0_100%)] px-5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Export forecasts CSV
          </button>
        </header>

        {meta.showStats && !wardsQuery.isError ? (
          <StatTiles signals={signals} city={selectedCity} lang={lang} />
        ) : null}

        {showSelectionBar ? (
          <SelectionBar
            cities={cities}
            selectedCity={selectedCity}
            cityWards={cityWards}
            selectedWardId={selectedWardId}
            unknownWardId={unknownWardId}
            mondayWeeks={mondayWeeks}
            selectedOriginWeek={selectedOriginWeek}
            windowKey={windowKey}
            lang={lang}
            isLoading={wardsQuery.isPending}
            isError={wardsQuery.isError}
            error={wardsQuery.error}
            onRetryWards={() => {
              void wardsQuery.refetch();
            }}
            onChangeCity={(nextCity) => {
              setDismissedUrlWard(true);
              setCityOverride(nextCity);
              setWardOverride(null);
              if (activeTab === "scenario") setScenarioManualSelection(true);
            }}
            onChangeWard={(nextWard) => {
              setDismissedUrlWard(true);
              setWardOverride(nextWard);
              if (activeTab === "scenario") setScenarioManualSelection(true);
            }}
            onChangeOriginWeek={(nextWeek) => {
              setOriginWeekOverride(nextWeek);
              if (activeTab === "scenario") setScenarioManualSelection(true);
            }}
            onChangeWindow={setWindowKey}
          />
        ) : null}

        <section
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-btn-${activeTab}`}
          className="flex-1"
        >
          <div ref={contentRef} key={activeTab}>
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
                lang={lang}
                onSelectWard={(wid) => {
                  setDismissedUrlWard(true);
                  setWardOverride(wid);
                }}
                onResetUnknownWard={handleResetUnknownWard}
              />
            )
          ) : null}

          {activeTab === "map" && !wardsQuery.isError ? (
            wardsQuery.isPending ? (
              <PanelSkeleton testId="risk-map-loading" label="Loading wards…" />
            ) : (
              <RiskMapView
                wards={allWards}
                selectedCity={selectedCity}
                selectedWardId={selectedWardId}
                originWeek={selectedOriginWeek}
                windowKey={windowKey}
                source={activeSource}
                lang={lang}
                onSelectWard={handleSelectWardFromMatrix}
              />
            )
          ) : null}

          {activeTab === "lags" && !wardsQuery.isError ? (
            <LagsPanel
              wardId={selectedWardId}
              unknownWardId={unknownWardId}
              lang={lang}
              onResetUnknownWard={handleResetUnknownWard}
            />
          ) : null}

          {activeTab === "scenario" && !wardsQuery.isError ? (
            <ScenarioPanel
              wardId={scenarioWardId}
              originWeek={scenarioOriginWeek}
              unknownWardId={unknownWardId}
              onResetUnknownWard={handleResetUnknownWard}
              isDemoBaseline={scenarioUsesDemoBaseline}
              lang={lang}
            />
          ) : null}

          {activeTab === "heatmap" && !wardsQuery.isError ? (
            <HeatmapView
              city={selectedCity}
              originWeek={selectedOriginWeek}
              source={activeSource}
              lang={lang}
              onSelectWard={handleSelectWardFromMatrix}
              onResetCity={() => {
                setCityOverride(DEMO_CONFIG.city);
                setWardOverride(null);
              }}
            />
          ) : null}

          {activeTab === "priority" && !wardsQuery.isError ? (
            <PriorityListView
              city={selectedCity}
              cityWards={cityWards}
              selectedWardId={selectedWardId}
              originWeek={selectedOriginWeek}
              windowKey={windowKey}
              source={activeSource}
              lang={lang}
              onSelectWard={handleSelectWardFromMatrix}
              onResetCity={() => {
                setCityOverride(DEMO_CONFIG.city);
                setWardOverride(null);
              }}
            />
          ) : null}

          {activeTab === "validation" ? <ValidationView lang={lang} /> : null}

          {activeTab === "about" ? <AboutCostView lang={lang} /> : null}
          </div>
        </section>
      </main>
      </div>

      {dialog === "search" ? (
        <CommandSearch
          views={tabs}
          wards={allWards}
          lang={lang}
          onSelectView={setActiveTab}
          onSelectWard={handleSelectWardFromMatrix}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "alerts" ? (
        <AlertsDialog
          signals={signals}
          originWeek={selectedOriginWeek}
          lang={lang}
          onSelectWard={handleSelectWardFromMatrix}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <footer className={clsx("no-print mb-20 lg:mb-0", dark ? "text-mist" : "text-slate")}>
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs">
          <span>
            Abhas (<span lang="bn" className="font-bangla">আভাস</span>) · Multi-week rainfall lag
            early warning · Weather data by Open-Meteo.com (CC BY 4.0)
          </span>
          <Link href="/brand" className={clsx("font-semibold hover:underline", dark ? "text-white" : "text-royal")}>
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
