"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import {
  AlertTriangle,
  CloudRain,
  Map as MapIcon,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
} from "@/components/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import {
  BANGLADESH_FACILITIES,
  type FacilityType,
  type HealthFacility,
} from "@/components/ward-map/facilities";
import {
  CITY_CENTROIDS,
  cityDisplayName,
  wardLabel,
  type LonLat,
  type MapView,
} from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps, type HorizonPick } from "@/components/ward-map/hooks";
import type { MapTheme } from "@/components/ward-map/map-style";
import {
  fetchNearestHospitalsByRoad,
  fetchRoadRoute,
  type NearestHospitalResult,
  type RouteResult,
} from "@/components/ward-map/routing";
import {
  WardRiskMap,
  type FlyToTarget,
  type MapWard,
  type WeatherBadgeOverlay,
} from "@/components/ward-map/WardRiskMap";
import {
  useReadyzQuery,
  useWeatherStatusQuery,
  type City,
  type Ward,
  type WeatherMode,
} from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { WINDOW_HORIZONS, type HorizonWindow } from "@/lib/demo-config";
import type { Lang } from "@/lib/i18n";
import { useConnectivity } from "@/lib/useConnectivity";
import { FacilityDirectory } from "./FacilityDirectory";
import { RoutingDrawer, type InspectorTab } from "./RoutingDrawer";
import { WardRiskMatrix } from "./WardRiskMatrix";

const COPY = {
  en: {
    title: "3D Geospatial Command & Emergency Routing",
    description: (origin: string) =>
      `All 60 wards in 3D (${origin} origin), OpenStreetMap hospitals & clinics, 3D building extrusions, and live road routing.`,
    disclaimer:
      "Not live hospital information. Community-mapped OpenStreetMap reference directory (not verified by DGHS). Phone numbers and bed tags may be outdated; no live bed or doctor availability exists here. Call ahead; in an emergency call 999.",
    approx: "Ward risk towers sit on approximate city-centroid spirals: the dataset has no ward polygons.",
    peak: "Peak in window",
    views: { dhaka: "Dhaka region", chattogram: "Chattogram", all: "All five" },
    loading: "Loading forecasts for all five city corporations…",
    error: "The ward forecasts could not be loaded",
    empty: "No forecasts for this week.",
  },
  bn: {
    title: "৩ডি জিওস্পেশাল কমান্ড ও জরুরি রুট",
    description: (origin: string) =>
      `৬০টি ওয়ার্ড (পূর্বাভাস ${origin}), হাসপাতাল ও ক্লিনিক, ৩ডি ভবন ও সড়ক রুট বিশ্লেষণ।`,
    disclaimer:
      "লাইভ হাসপাতালের তথ্য নয়। এটি OpenStreetMap কমিউনিটি ডেটা (ডিজিএইচএস যাচাইকৃত নয়)। ফোন বা শয্যা সংখ্যা পরিবর্তিত হতে পারে; লাইভ শয্যা বা চিকিৎসক উপস্থিতি এখানে নেই। রওনার আগে ফোন করুন; জরুরি প্রয়োজনে ৯৯৯-এ কল করুন।",
    approx: "মানচিত্রে ওয়ার্ডের অবস্থান আনুমানিক কেন্দ্র-সর্পিলে বসানো: ডেটাসেটে ওয়ার্ড সীমানা নেই।",
    peak: "সর্বোচ্চ",
    views: { dhaka: "ঢাকা অঞ্চল", chattogram: "চট্টগ্রাম", all: "পাঁচটি নগর" },
    loading: "পাঁচটি নগরের পূর্বাভাস লোড হচ্ছে…",
    error: "ওয়ার্ডের পূর্বাভাস লোড করা যায়নি",
    empty: "এই সপ্তাহের পূর্বাভাস নেই।",
  },
} as const;

const CITY_ORDER: readonly City[] = [
  "Dhaka North",
  "Dhaka South",
  "Gazipur",
  "Narayanganj",
  "Chattogram",
];

const EMPTY_FACILITIES: readonly HealthFacility[] = [];
const EMPTY_WEATHER_OVERLAYS: readonly WeatherBadgeOverlay[] = [];

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
  const bn = lang === "bn";
  const horizons = WINDOW_HORIZONS[windowKey];

  // Existing overview + horizon state
  const [pick, setPick] = useState<HorizonPick>(() => WINDOW_HORIZONS[windowKey][0] ?? "peak");
  const [viewOverride, setViewOverride] = useState<{ city: City; view: MapView } | null>(null);
  const [hoveredWardId, setHoveredWardId] = useState<string | null>(null);
  const view: MapView =
    viewOverride && viewOverride.city === selectedCity
      ? viewOverride.view
      : selectedCity === "Chattogram"
        ? "chattogram"
        : "dhaka";

  // Advanced 3D & Layer states
  const [enable3D, setEnable3D] = useState(true);
  const [mapTheme, setMapTheme] = useState<MapTheme>("night");
  const [layerBuildings, setLayerBuildings] = useState(true);
  const [layerTowers, setLayerTowers] = useState(true);
  const [layerWards, setLayerWards] = useState(true);
  const [layerFacilities, setLayerFacilities] = useState(true);
  const [layerWeather, setLayerWeather] = useState(false);
  const [layersOpenMobile, setLayersOpenMobile] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState<"all" | FacilityType>("all");

  // Search, Geospatial Inspector & OSRM Routing states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("wards");
  const [directoryCityFilter, setDirectoryCityFilter] = useState<City | "all">("all");
  const [startPoint, setStartPoint] = useState<LonLat>(() => CITY_CENTROIDS[selectedCity]);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<HealthFacility | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routePending, setRoutePending] = useState(false);
  const [nearestResults, setNearestResults] = useState<NearestHospitalResult[]>([]);
  const [nearestEngine, setNearestEngine] = useState<"osrm" | "offline-fallback" | null>(null);
  const [nearestPending, setNearestPending] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [resetViewNonce, setResetViewNonce] = useState(0);
  const nonceCounterRef = useRef(0);
  const routeAbortRef = useRef<AbortController | null>(null);

  const heatmaps = useAllCityHeatmaps(originWeek, source);
  const weatherStatus = useWeatherStatusQuery();
  const readyzQuery = useReadyzQuery();
  const connectivity = useConnectivity(readyzQuery.data?.offline);

  // Weather layer reads strictly from the local API weather status + offline state (never calls third-party hosts from browser; M2).
  const weatherOverlays: readonly WeatherBadgeOverlay[] = useMemo(() => {
    if (!layerWeather) return EMPTY_WEATHER_OVERLAYS;
    if (connectivity.isOffline) {
      const offlineLabel = bn ? "অফলাইন — ডেটাসেট আবহাওয়া" : "Offline — dataset weather";
      return CITY_ORDER.map((city) => ({
        city,
        label: offlineLabel,
        detail: "",
      }));
    }
    const apiCities = weatherStatus.data?.cities ?? [];
    if (apiCities.length > 0) {
      return apiCities.map((c) => ({
        city: c.city,
        label:
          c.source === "live"
            ? bn
              ? "লাইভ ক্যাশ"
              : "Live cache"
            : bn
              ? "ডেটাসেট আবহাওয়া"
              : "Dataset weather",
        detail: "",
      }));
    }
    return CITY_ORDER.map((city) => ({
      city,
      label: bn ? "ডেটাসেট আবহাওয়া" : "Dataset weather",
      detail: "",
    }));
  }, [layerWeather, connectivity.isOffline, weatherStatus.data, bn]);

  const effectivePick: HorizonPick =
    pick !== "peak" && !horizons.includes(pick) ? (horizons[0] ?? "peak") : pick;
  const mapWards = useMemo(
    () => buildMapWards(wards, heatmaps.cellsByWard, effectivePick, horizons),
    [wards, heatmaps.cellsByWard, effectivePick, horizons],
  );

  const VIEW_CITIES_LOOKUP: Record<MapView, readonly City[]> = useMemo(
    () => ({
      dhaka: ["Dhaka North", "Dhaka South", "Gazipur", "Narayanganj"],
      chattogram: ["Chattogram"],
      all: ["Dhaka North", "Dhaka South", "Gazipur", "Narayanganj", "Chattogram"],
    }),
    [],
  );

  const ledger = useMemo(
    () =>
      mapWards
        .filter((w) => VIEW_CITIES_LOOKUP[view].includes(w.city as City) && w.tier)
        .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0))
        .slice(0, 12),
    [mapWards, view, VIEW_CITIES_LOOKUP],
  );

  const filteredFacilities = useMemo(
    () => BANGLADESH_FACILITIES.filter((f) => facilityFilter === "all" || f.type === facilityFilter),
    [facilityFilter],
  );

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { facilities: [] as HealthFacility[], wards: [] as MapWard[] };
    const matchedFacilities = BANGLADESH_FACILITIES.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.nameBn.toLowerCase().includes(q) ||
        f.address.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q),
    ).slice(0, 5);
    const matchedWards = mapWards
      .filter(
        (w) =>
          w.ward_id.toLowerCase().includes(q) ||
          wardLabel(w.ward_id, lang).toLowerCase().includes(q) ||
          w.city.toLowerCase().includes(q),
      )
      .slice(0, 4);
    return { facilities: matchedFacilities, wards: matchedWards };
  }, [searchQuery, mapWards, lang]);

  const citySummaryStats = useMemo(() => {
    return CITY_ORDER.map((city) => {
      const cityFacs = BANGLADESH_FACILITIES.filter((f) => f.city === city);
      const hospCount = cityFacs.filter((f) => f.type === "hospital").length;
      const clinicCount = cityFacs.filter((f) => f.type === "clinic").length;
      const cityWards = mapWards.filter((w) => w.city === city);
      const alertWards = cityWards.filter((w) => w.tier === "High" || w.tier === "Critical").length;
      const peakCases = Math.max(...cityWards.map((w) => w.expected_cases ?? 0), 0);
      return {
        city,
        hospCount,
        clinicCount,
        totalWards: cityWards.length,
        alertWards,
        peakCases,
      };
    });
  }, [mapWards]);

  const tierCounts = TIER_ORDER.map((tier) => ({
    tier,
    n: mapWards.filter((w) => w.tier === tier).length,
  }));
  const label = `${copy.title}: ${tierCounts.map((t) => `${t.n} ${t.tier}`).join(", ")}.`;

  const triggerFlyTo = useCallback((center: LonLat, zoom: number, pitch = 56) => {
    nonceCounterRef.current += 1;
    setFlyToTarget({ center, zoom, pitch, nonce: nonceCounterRef.current });
  }, []);

  const handleSelectFacility = useCallback(
    (facility: HealthFacility) => {
      setSelectedFacility(facility);
      setInspectorTab("facility");
      setLayerFacilities(true);
      setSearchFocused(false);
      triggerFlyTo(facility.position, 15.2, enable3D ? 58 : 0);
    },
    [triggerFlyTo, enable3D],
  );

  const handleInspectWardOnMap = useCallback(
    (ward: MapWard) => {
      setHoveredWardId(ward.ward_id);
      triggerFlyTo(ward.position, 13.6, enable3D ? 54 : 0);
    },
    [triggerFlyTo, enable3D],
  );

  const handleRouteToFacility = useCallback(
    async (facility: HealthFacility) => {
      routeAbortRef.current?.abort();
      const ctrl = new AbortController();
      routeAbortRef.current = ctrl;
      setSelectedFacility(facility);
      setRoutePending(true);
      setInspectorTab("route");
      setLayerFacilities(true);
      try {
        const result = await fetchRoadRoute(startPoint, facility, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setRouteResult(result);
        }
      } catch {
        // Ignore aborts
      } finally {
        if (!ctrl.signal.aborted) setRoutePending(false);
      }
    },
    [startPoint],
  );

  const handleFindNearest = useCallback(async () => {
    routeAbortRef.current?.abort();
    const ctrl = new AbortController();
    routeAbortRef.current = ctrl;
    setNearestPending(true);
    setInspectorTab("route");
    setLayerFacilities(true);
    try {
      const res = await fetchNearestHospitalsByRoad(
        startPoint,
        BANGLADESH_FACILITIES,
        facilityFilter === "clinic" ? "all" : facilityFilter,
        8,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setNearestResults(res.items);
      setNearestEngine(res.engine);
      if (res.items[0]) {
        const firstDest = res.items[0].facility;
        setSelectedFacility(firstDest);
        setRoutePending(true);
        const r = await fetchRoadRoute(startPoint, firstDest, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setRouteResult(r);
          setRoutePending(false);
        }
      }
    } catch {
      // Ignore abort
    } finally {
      if (!ctrl.signal.aborted) {
        setNearestPending(false);
        setRoutePending(false);
      }
    }
  }, [startPoint, facilityFilter]);

  const handleUseMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus(
        bn
          ? "ব্রাউজারে জিওলোকেশন পাওয়া যায়নি; শুরুর পিন সরাতে মানচিত্রে ক্লিক করুন।"
          : "Geolocation unavailable; click anywhere on the map to set your start point.",
      );
      return;
    }
    setGeoStatus(bn ? "আপনার অবস্থান নেওয়া হচ্ছে…" : "Locating GPS coordinates…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord: LonLat = [pos.coords.longitude, pos.coords.latitude];
        setStartPoint(coord);
        setGeoStatus(null);
        triggerFlyTo(coord, 14.5, enable3D ? 55 : 0);
      },
      () => {
        setGeoStatus(
          bn
            ? "অবস্থান অনুমতি মেলেনি। শুরুর বিন্দু সরাতে মানচিত্রের যেকোনো জায়গায় ক্লিক করুন।"
            : "Location permission denied. Click any point on the map to move your start pin.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [bn, triggerFlyTo, enable3D]);

  const handleCityJump = useCallback(
    (city: City) => {
      const coord = CITY_CENTROIDS[city];
      setStartPoint(coord);
      setDirectoryCityFilter(city);
      if (city === "Chattogram") setViewOverride({ city: selectedCity, view: "chattogram" });
      else if (view === "chattogram") setViewOverride({ city: selectedCity, view: "dhaka" });
      triggerFlyTo(coord, 13.0, enable3D ? 52 : 0);
    },
    [selectedCity, view, triggerFlyTo, enable3D],
  );

  const handleMapClick = useCallback((coord: LonLat) => {
    setStartPoint(coord);
    setGeoStatus(null);
  }, []);

  const handleResetView = useCallback(() => {
    setRouteResult(null);
    setResetViewNonce((n) => n + 1);
  }, []);

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

        {/* Right Controls: View + Horizon + 3D / Theme / Reset toolbar */}
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented
              label="Map area"
              testIdPrefix="risk-map-view"
              options={(["dhaka", "chattogram", "all"] as const).map((v) => ({ id: v, text: copy.views[v] }))}
              value={view}
              onChange={(nextView) => setViewOverride({ city: selectedCity, view: nextView })}
              lang={lang}
              measure={false}
            />
            <button
              type="button"
              onClick={() => setEnable3D((v) => !v)}
              aria-pressed={enable3D}
              data-testid="toggle-3d-mode"
              className={clsx(
                "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold transition-colors",
                enable3D
                  ? "border-navy bg-navy text-white"
                  : "border-mist bg-white text-navy hover:bg-paper",
              )}
            >
              {enable3D ? "3D ON" : "2D"}
            </button>
            <button
              type="button"
              onClick={() => setMapTheme((t) => (t === "night" ? "street" : "night"))}
              aria-pressed={mapTheme === "street"}
              data-testid="toggle-map-theme"
              className="min-h-8 cursor-pointer rounded-md border border-mist bg-white px-2.5 text-xs font-semibold text-navy transition-colors hover:bg-paper"
            >
              {mapTheme === "night" ? (bn ? "রাতের মানচিত্র" : "Night 3D") : bn ? "সড়ক মানচিত্র" : "Street"}
            </button>
            <button
              type="button"
              onClick={handleResetView}
              aria-label={bn ? "মানচিত্র রিসেট করুন" : "Reset camera view"}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-mist bg-white px-2.5 text-xs font-semibold text-slate transition-colors hover:bg-paper hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{bn ? "রিসেট" : "Reset"}</span>
            </button>
          </div>
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

      <CardContent className="space-y-5">
        {/* Explicit Medical Safety Disclaimer (compliant Ink/Paper styling — no Risk colors) */}
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-mist bg-paper px-3.5 py-2.5 text-xs text-ink"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-navy" aria-hidden="true" />
          <p lang={lang} className={clsx("leading-relaxed", bn && "font-bangla")}>
            {copy.disclaimer}
          </p>
        </div>

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
          <>
            {/* MAIN INTERACTIVE 3D MAP + FLOATING COMMAND HUD + RIGHT INSPECTOR DRAWER */}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div>
                <div className="relative overflow-hidden rounded-[14px] ring-1 ring-mist">
                  {/* TOP-LEFT FLOATING SEARCH & EMERGENCY ROUTING HUD (stacked cleanly above map on mobile) */}
                  <div className="pointer-events-auto border-b border-mist bg-white p-3 text-ink md:absolute md:left-3 md:top-3 md:z-10 md:w-[22.5rem] md:rounded-xl md:border-b-0 md:bg-white/95 md:shadow-xl md:shadow-ink/25 md:ring-1 md:ring-mist md:backdrop-blur-md">
                    <div className="relative">
                      <label className="relative block">
                        <span className="sr-only">
                          {bn ? "হাসপাতাল, ক্লিনিক বা ওয়ার্ড খুঁজুন" : "Search hospitals, clinics, or wards"}
                        </span>
                        <Search
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={searchQuery}
                          onFocus={() => setSearchFocused(true)}
                          onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setSearchFocused(true);
                          }}
                          placeholder={
                            bn
                              ? "হাসপাতাল, ক্লিনিক বা ওয়ার্ড খুঁজুন..."
                              : "Search hospitals, clinics or wards…"
                          }
                          className={clsx(
                            "w-full rounded-lg border border-mist bg-paper py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-slate focus:border-royal focus:bg-white focus:outline-none",
                            bn && "font-bangla",
                          )}
                        />
                      </label>

                      {/* Live Search Dropdown */}
                      {searchFocused &&
                      (searchMatches.facilities.length > 0 || searchMatches.wards.length > 0) ? (
                        <div className="abhas-scroll absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-lg border border-mist bg-white p-1.5 shadow-xl">
                          {searchMatches.facilities.map((fac) => (
                            <button
                              key={fac.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectFacility(fac);
                              }}
                              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-paper"
                            >
                              <span className="min-w-0">
                                <span className={clsx("block truncate font-semibold text-navy", bn && "font-bangla")}>
                                  {bn ? fac.nameBn : fac.name}
                                </span>
                                <span className="block truncate text-[10px] text-slate">
                                  {cityDisplayName(fac.city, lang)} · {fac.type}
                                </span>
                              </span>
                              <span className="shrink-0 font-semibold text-royal">
                                {bn ? "দেখুন" : "View"}
                              </span>
                            </button>
                          ))}
                          {searchMatches.wards.map((ward) => (
                            <button
                              key={ward.ward_id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSearchFocused(false);
                                handleInspectWardOnMap(ward);
                              }}
                              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-paper"
                            >
                              <span className="font-semibold text-ink">
                                {wardLabel(ward.ward_id, lang)} · {cityDisplayName(ward.city, lang)}
                              </span>
                              {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" lang={lang} /> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Primary GPS & Emergency Route Action Row */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleUseMyLocation}
                        className={clsx(
                          "inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-800",
                          bn && "font-bangla",
                        )}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{bn ? "আমার অবস্থান" : "Use my location"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFindNearest()}
                        disabled={nearestPending}
                        className={clsx(
                          "inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-royal px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy disabled:opacity-60",
                          bn && "font-bangla",
                        )}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {nearestPending
                            ? bn
                              ? "খোঁজা হচ্ছে…"
                              : "Routing…"
                            : bn
                              ? "নিকটস্থ হাসপাতাল"
                              : "Nearest hospitals"}
                        </span>
                      </button>
                    </div>

                    {/* Quick city centroid jumps */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {CITY_ORDER.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleCityJump(c)}
                          className={clsx(
                            "cursor-pointer rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-navy ring-1 ring-mist/80 transition-colors hover:bg-royal hover:text-white",
                            bn && "font-bangla",
                          )}
                        >
                          {cityDisplayName(c, lang)}
                        </button>
                      ))}
                    </div>

                    <p className="mt-1.5 text-[10px] text-slate tnum">
                      {bn ? "শুরু" : "Start"}: {startPoint[1].toFixed(4)}°, {startPoint[0].toFixed(4)}° ·{" "}
                      {bn ? "সরাতে মানচিত্রে ক্লিক করুন" : "Click map to move pin"}
                    </p>
                    {geoStatus ? (
                      <p role="status" className={clsx("mt-1 text-[11px] font-medium text-navy", bn && "font-bangla")}>
                        {geoStatus}
                      </p>
                    ) : null}
                  </div>

                  <WardRiskMap
                    wards={mapWards}
                    view={view}
                    mode="risk"
                    label={label}
                    highlightWardId={hoveredWardId ?? (selectedWardId || null)}
                    onSelectWard={onSelectWard}
                    interactive
                    showPinnedData
                    enable3D={enable3D}
                    theme={mapTheme}
                    show3DBuildings={enable3D && layerBuildings}
                    showWardTowers={enable3D && layerTowers}
                    showWards={layerWards}
                    facilities={layerFacilities ? filteredFacilities : EMPTY_FACILITIES}
                    selectedFacilityId={selectedFacility?.id ?? null}
                    onSelectFacility={handleSelectFacility}
                    routeResult={routeResult}
                    startPoint={startPoint}
                    onMapClick={handleMapClick}
                    weatherBadges={weatherOverlays}
                    flyToTarget={flyToTarget}
                    resetViewNonce={resetViewNonce}
                    lang={lang}
                    className="h-[clamp(23rem,62vh,42rem)] w-full md:h-[clamp(26rem,68vh,42rem)]"
                  />

                  {/* BOTTOM-LEFT FLOATING LAYER CONTROL PANEL (collapsed pill on phones, expanded on desktop) */}
                  <div className="pointer-events-auto absolute bottom-3 left-3 z-10">
                    <button
                      type="button"
                      onClick={() => setLayersOpenMobile((o) => !o)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-navy shadow-lg ring-1 ring-mist backdrop-blur-md md:hidden"
                    >
                      <MapIcon className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                      <span>{bn ? "লেয়ার" : "Layers"}</span>
                    </button>

                    <div
                      className={clsx(
                        "mt-1.5 w-60 rounded-xl bg-white/95 p-3 text-ink shadow-xl shadow-ink/25 ring-1 ring-mist backdrop-blur-md",
                        layersOpenMobile ? "block" : "hidden md:block",
                      )}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate">
                        {bn ? "৩ডি ও তথ্য লেয়ার" : "3D & map layers"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[
                          {
                            id: "buildings",
                            active: layerBuildings,
                            toggle: () => setLayerBuildings((v) => !v),
                            en: "3D buildings",
                            bn: "৩ডি ভবন",
                          },
                          {
                            id: "towers",
                            active: layerTowers,
                            toggle: () => setLayerTowers((v) => !v),
                            en: "3D risk towers",
                            bn: "৩ডি ঝুঁকি স্তম্ভ",
                          },
                          {
                            id: "facilities",
                            active: layerFacilities,
                            toggle: () => setLayerFacilities((v) => !v),
                            en: "Facilities",
                            bn: "হাসপাতাল",
                          },
                          {
                            id: "wards",
                            active: layerWards,
                            toggle: () => setLayerWards((v) => !v),
                            en: "Ward dots",
                            bn: "ওয়ার্ড বিন্দু",
                          },
                          {
                            id: "weather",
                            active: layerWeather,
                            toggle: () => setLayerWeather((v) => !v),
                            en: "Weather now",
                            bn: "বর্তমান আবহাওয়া",
                          },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`risk-map-layer-${item.id}`}
                            onClick={item.toggle}
                            aria-pressed={item.active}
                            className={clsx(
                              "cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                              bn && "font-bangla",
                              item.active
                                ? "border-navy bg-navy text-white"
                                : "border-mist bg-paper text-slate hover:text-ink",
                            )}
                          >
                            {bn ? item.bn : item.en}
                          </button>
                        ))}
                      </div>

                      {/* Facility type filter */}
                      <div className="mt-2.5 flex items-center gap-1 border-t border-mist pt-2">
                        {(["all", "hospital", "clinic"] as const).map((ftype) => (
                          <button
                            key={ftype}
                            type="button"
                            onClick={() => setFacilityFilter(ftype)}
                            aria-pressed={facilityFilter === ftype}
                            className={clsx(
                              "flex-1 cursor-pointer rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors",
                              bn && "font-bangla",
                              facilityFilter === ftype
                                ? "bg-emerald-700 text-white"
                                : "bg-paper text-slate hover:text-ink",
                            )}
                          >
                            {ftype === "all"
                              ? bn
                                ? "সব"
                                : "All"
                              : ftype === "hospital"
                                ? bn
                                  ? "হাসপাতাল"
                                  : "Hospitals"
                                : bn
                                  ? "ক্লিনিক"
                                  : "Clinics"}
                          </button>
                        ))}
                      </div>

                      {/* Compact Legend */}
                      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-mist pt-2 text-[10px] text-slate">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-royal" aria-hidden="true" />
                          {bn ? "হাসপাতাল" : "Hospital"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
                          {bn ? "ক্লিনিক" : "Clinic"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-3 rounded-full bg-royal" aria-hidden="true" />
                          {bn ? "দ্রুততম রুট" : "Fastest"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-3 border-b-2 border-dashed border-slate-500" aria-hidden="true" />
                          {bn ? "সংক্ষিপ্ত রুট" : "Shortest"}
                        </span>
                      </div>

                      {layerWeather && weatherStatus.isFetching && !connectivity.isOffline ? (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-royal">
                          <CloudRain className="h-3 w-3" aria-hidden="true" />
                          <span>{bn ? "আবহাওয়া তথ্য লোড হচ্ছে…" : "Loading weather status…"}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Risk Tier Count Strip + Centroid Approximation Disclosure */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate">
                  {tierCounts.map(({ tier, n }) => (
                    <span key={tier} className="inline-flex items-center gap-1.5">
                      <RiskTierBadge tier={tier} size="sm" lang={lang} />
                      <span className="font-mono text-ink tnum">{n}</span>
                    </span>
                  ))}
                  <span lang={lang} className={lang === "bn" ? "font-bangla" : undefined}>
                    {copy.approx}
                  </span>
                </div>
              </div>

              {/* RIGHT DRAWER: Wards Ledger (default tab preserves E2E) + Facility Details + Nearest & Road Route */}
              <RoutingDrawer
                activeTab={inspectorTab}
                onChangeTab={setInspectorTab}
                ledgerWards={ledger}
                selectedWardId={selectedWardId}
                onSelectWard={onSelectWard}
                onHoverWard={setHoveredWardId}
                selectedFacility={selectedFacility}
                startPoint={startPoint}
                routeResult={routeResult}
                routePending={routePending}
                nearestResults={nearestResults}
                nearestEngine={nearestEngine}
                nearestPending={nearestPending}
                onRouteToFacility={(fac) => void handleRouteToFacility(fac)}
                onClearRoute={() => setRouteResult(null)}
                onInspectFacilityIn3D={(fac) => {
                  setEnable3D(true);
                  setLayerBuildings(true);
                  triggerFlyTo(fac.position, 16.0, 62);
                }}
                lang={lang}
              />
            </div>

            {/* 5-CITY GEOSPATIAL COMMAND SUMMARY CARDS */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {citySummaryStats.map((stat) => (
                <button
                  key={stat.city}
                  type="button"
                  onClick={() => handleCityJump(stat.city)}
                  className="group cursor-pointer rounded-[12px] border border-mist bg-paper p-3.5 text-left transition-colors hover:border-royal/50 hover:bg-white"
                >
                  <p className={clsx("text-xs font-bold text-navy group-hover:text-royal", bn && "font-bangla")}>
                    {cityDisplayName(stat.city, lang)}
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate">
                        {bn ? "স্বাস্থ্যকেন্দ্র" : "Facilities"}
                      </span>
                      <span className="mt-0.5 block font-mono text-base font-bold text-ink tnum">
                        {stat.hospCount + stat.clinicCount}
                      </span>
                      <span className="block text-[10px] text-slate tnum">
                        {stat.hospCount}H · {stat.clinicCount}C
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate">
                        {bn ? "সতর্ক ওয়ার্ড" : "Alert wards"}
                      </span>
                      <span className="mt-0.5 block font-mono text-base font-bold text-navy tnum">
                        {stat.alertWards}/{stat.totalWards}
                      </span>
                      <span className="block text-[10px] text-slate tnum">
                        {bn ? "সর্বোচ্চ" : "peak"} {stat.peakCases.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* 2-COLUMN COMMAND DECK: FACILITY DIRECTORY + 60-WARD RISK MATRIX */}
            <div className="grid gap-5 xl:grid-cols-2">
              <FacilityDirectory
                selectedCityFilter={directoryCityFilter}
                onChangeCityFilter={setDirectoryCityFilter}
                typeFilter={facilityFilter}
                selectedFacilityId={selectedFacility?.id ?? null}
                onSelectFacility={handleSelectFacility}
                lang={lang}
              />
              <WardRiskMatrix
                wards={mapWards}
                selectedWardId={selectedWardId}
                originWeek={originWeek}
                onSelectWard={onSelectWard}
                onInspectWardOnMap={handleInspectWardOnMap}
                lang={lang}
              />
            </div>

            {/* GEOSPATIAL & ROUTING ENGINE DIAGNOSTICS FOOTER */}
            <div className="rounded-[12px] border border-mist bg-paper p-4 text-xs text-slate">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={clsx("font-bold text-navy", bn && "font-bangla")}>
                  {bn
                    ? "৩ডি জিওস্পেশাল ও সড়ক রুট ইঞ্জিন ডায়াগনস্টিকস"
                    : "3D Geospatial & Road Routing Engine"}
                </p>
                <span className="font-mono text-[11px] text-slate tnum">
                  MapLibre GL 3D · OpenFreeMap Vector Buildings · OSRM Road Graph
                </span>
              </div>
              <p className={clsx("mt-1.5 leading-relaxed", bn && "font-bangla")}>
                {bn
                  ? "৩ডি ভবন ও ঝুঁকি স্তম্ভ WebGL-এ রেন্ডার হয়। সড়কপথে নিকটস্থ হাসপাতাল ও দ্রুততম/সংক্ষিপ্ততম রুট OpenStreetMap রোড গ্রাফ (OSRM) ব্যবহার করে; অফলাইন অবস্থায় গাণিতিক নগর দূরত্ব প্রদর্শিত হয়। লাইভ ট্রাফিক তথ্য এখানে অন্তর্ভুক্ত নয়।"
                  : "3D building extrusions (zoom ≥ 13) and hexagonal dengue risk towers render in WebGL. Road travel times use OpenStreetMap road networks via OSRM free-flow urban speeds (with deterministic offline urban corridor fallback); no live traffic feeds are used."}
              </p>
            </div>
          </>
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

function Segmented<T extends string | number>({
  label,
  testIdPrefix,
  options,
  value,
  onChange,
  lang,
  measure = true,
}: SegmentedProps<T>) {
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
