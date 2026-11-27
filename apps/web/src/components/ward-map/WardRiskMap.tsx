"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { clsx } from "clsx";
import type { RiskTier } from "@/components/brand/RiskTierBadge";
import type { Lang } from "@/lib/i18n";
import { createHexagonPolygon, type HealthFacility } from "./facilities";
import { CITY_CENTROIDS, MAP_VIEWS, cityDisplayName, wardLabel, type LonLat, type MapView } from "./geo";
import { buildMapStyle, mixColor, readMapPalette, type MapPalette, type MapTheme } from "./map-style";
import type { RouteResult } from "./routing";
import { WardMapFallback } from "./WardMapFallback";
import { WardMapTooltip } from "./WardMapTooltip";

export interface MapWard {
  ward_id: string;
  city: string;
  position: LonLat;
  tier: RiskTier | null;
  expected_cases: number | null;
  target_week: string | null;
}

export type MapMode = "rain" | "risk";

export interface WeatherBadgeOverlay {
  city: string;
  label: string;
  detail: string;
}

export interface FlyToTarget {
  center: LonLat;
  zoom: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
}

export interface WardRiskMapProps {
  wards: readonly MapWard[];
  view: MapView;
  mode: MapMode;
  /** Accessible summary of what the map currently shows. */
  label: string;
  highlightWardId?: string | null;
  onSelectWard?: (wardId: string) => void;
  /** Pan, zoom, and rotate with two fingers / ctrl+scroll (dashboard); the landing map stays still. */
  interactive?: boolean;
  /** Keep wards clear of copy laid over the map (landing): left column on desktop, bottom on phones. */
  reserveForCopy?: boolean;
  /** Anchor a live data card & city callouts directly onto geographic map locations. */
  showPinnedData?: boolean;
  /** Enable 3D perspective camera (pitch + bearing) and interactive orbit controls. */
  enable3D?: boolean;
  /** Visual map theme: Abhas Ink/Navy night map vs daylight OpenStreetMap street canvas. */
  theme?: MapTheme;
  /** Render extruded OpenStreetMap 3D buildings from OpenFreeMap when zoomed in (zoom >= 13). */
  show3DBuildings?: boolean;
  /** Render 3D hexagonal risk towers extruded proportionally to expected dengue cases. */
  showWardTowers?: boolean;
  /** Toggle ward risk markers/glow visibility cleanly without tearing down source state. */
  showWards?: boolean;
  /** Community-mapped hospitals & clinics rendered as interactive markers. */
  facilities?: readonly HealthFacility[];
  selectedFacilityId?: string | null;
  onSelectFacility?: (facility: HealthFacility) => void;
  /** Active fastest & shortest road route paths to draw over the road network. */
  routeResult?: RouteResult | null;
  /** Origin point pin for routing / geolocation. */
  startPoint?: LonLat | null;
  /** Invoked when user clicks empty map canvas (for moving routing start pin). */
  onMapClick?: (coord: LonLat) => void;
  /** Optional city weather overlays projected onto geographic city centroids. */
  weatherBadges?: readonly WeatherBadgeOverlay[];
  /** Imperative camera flight command triggered by search, city pills, or facility table clicks. */
  flyToTarget?: FlyToTarget | null;
  /** Increment to ease back to the active overview bounds. */
  resetViewNonce?: number;
  lang?: Lang;
  testId?: string;
  className?: string;
}

const TWEEN_MS = 700;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Padding = { top: number; right: number; bottom: number; left: number };

function cameraPadding(el: HTMLElement | null, reserveForCopy: boolean): Padding {
  const width = el?.clientWidth ?? 0;
  const height = el?.clientHeight ?? 0;
  if (!reserveForCopy) return { top: 64, right: 48, bottom: 48, left: 48 };
  if (width >= 1024) return { top: 90, right: 300, bottom: 70, left: Math.round(width * 0.42) };
  return { top: 80, right: 20, bottom: Math.round(height * 0.6), left: 20 };
}

function targetColor(ward: MapWard, mode: MapMode, palette: MapPalette): string {
  if (mode === "rain" || !ward.tier) return palette.royal;
  return palette.tier[ward.tier];
}

interface CaseRange {
  min: number;
  max: number;
}

function caseRange(wards: readonly MapWard[]): CaseRange {
  const values = wards.map((w) => w.expected_cases).filter((v): v is number => v !== null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
}

/** Dot area follows expected cases relative to the wards on screen, so size stays readable when all are Critical. */
function targetRadius(ward: MapWard, mode: MapMode, range: CaseRange): number {
  if (mode === "rain" || ward.expected_cases === null) return 5;
  const span = range.max - range.min;
  if (span < 0.5) return 7;
  return 3.5 + 8 * Math.sqrt((ward.expected_cases - range.min) / span);
}

/** Height in meters for 3D extruded hexagonal risk columns (sleek architectural scale). */
function targetColumnHeight(ward: MapWard, mode: MapMode, view: MapView, range: CaseRange): number {
  if (mode === "rain" || ward.expected_cases === null) return view === "all" ? 520 : 140;
  const span = Math.max(range.max - range.min, 1);
  const ratio = Math.max(0, Math.min(1, (ward.expected_cases - range.min) / span));
  const minH = view === "all" ? 650 : 120;
  const maxH = view === "all" ? 3400 : 860;
  return Math.round(minH + ratio * (maxH - minH));
}

interface ProjectedAnchor {
  ward: MapWard;
  x: number;
  y: number;
}

interface ProjectedFacilityHover {
  facility: HealthFacility;
  x: number;
  y: number;
}

interface ProjectedCityPin {
  city: string;
  x: number;
  y: number;
  wardCount: number;
  peakCases: number;
  weatherLabel?: string;
  weatherDetail?: string;
}

const EMPTY_FACILITIES: readonly HealthFacility[] = [];
const EMPTY_WEATHER_BADGES: readonly WeatherBadgeOverlay[] = [];

function setLayerVisible(map: MapLibreMap, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export function WardRiskMap({
  wards,
  view,
  mode,
  label,
  highlightWardId = null,
  onSelectWard,
  interactive = false,
  reserveForCopy = false,
  showPinnedData = false,
  enable3D = false,
  theme = "night",
  show3DBuildings = enable3D,
  showWardTowers = enable3D,
  showWards = true,
  facilities = EMPTY_FACILITIES,
  selectedFacilityId = null,
  onSelectFacility,
  routeResult = null,
  startPoint = null,
  onMapClick,
  weatherBadges = EMPTY_WEATHER_BADGES,
  flyToTarget = null,
  resetViewNonce = 0,
  lang = "en",
  testId = "ward-risk-map",
  className,
}: WardRiskMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const paletteRef = useRef<MapPalette | null>(null);
  const shownRef = useRef(new Map<string, { color: string; radius: number }>());

  const selectRef = useRef(onSelectWard);
  const selectFacilityRef = useRef(onSelectFacility);
  const mapClickRef = useRef(onMapClick);
  const highlightRef = useRef(highlightWardId);
  const showPinnedRef = useRef(showPinnedData);
  const wardsRef = useRef(wards);
  const facilitiesRef = useRef(facilities);
  const weatherBadgesRef = useRef(weatherBadges);
  const hoverWardIdRef = useRef<string | null>(null);
  const hoverFacilityIdRef = useRef<string | null>(null);
  const appliedThemeRef = useRef<MapTheme>(theme);
  const lastFlyNonceRef = useRef<number>(0);

  const [shouldLoad, setShouldLoad] = useState(interactive);
  const [isReady, setIsReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const [hover, setHover] = useState<ProjectedAnchor | null>(null);
  const [hoverFacility, setHoverFacility] = useState<ProjectedFacilityHover | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<ProjectedAnchor | null>(null);
  const [cityPins, setCityPins] = useState<ProjectedCityPin[]>([]);

  useEffect(() => {
    selectRef.current = onSelectWard;
    selectFacilityRef.current = onSelectFacility;
    mapClickRef.current = onMapClick;
    wardsRef.current = wards;
    facilitiesRef.current = facilities;
    weatherBadgesRef.current = weatherBadges;
    highlightRef.current = highlightWardId;
    showPinnedRef.current = showPinnedData;
  });

  /** Project the highlighted ward, active hover ward/facility, & city centroids to exact viewport pixels. */
  const syncProjectedOverlays = useCallback(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const currentWards = wardsRef.current;

    if (hoverWardIdRef.current) {
      const hovered = currentWards.find((w) => w.ward_id === hoverWardIdRef.current);
      if (hovered) {
        const pt = map.project([hovered.position[0], hovered.position[1]]);
        if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
          setHover({ ward: hovered, x: pt.x, y: pt.y });
        } else {
          setHover(null);
        }
      }
    }

    if (hoverFacilityIdRef.current) {
      const hoveredFac = facilitiesRef.current.find((f) => f.id === hoverFacilityIdRef.current);
      if (hoveredFac) {
        const pt = map.project([hoveredFac.position[0], hoveredFac.position[1]]);
        if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
          setHoverFacility({ facility: hoveredFac, x: pt.x, y: pt.y });
        } else {
          setHoverFacility(null);
        }
      }
    }

    if (!showPinnedRef.current && weatherBadgesRef.current.length === 0) {
      setPinnedAnchor((prev) => (prev === null ? prev : null));
      setCityPins((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const focusId = highlightRef.current;
    if (showPinnedRef.current && focusId) {
      const target = currentWards.find((w) => w.ward_id === focusId);
      if (target) {
        const pt = map.project([target.position[0], target.position[1]]);
        if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
          setPinnedAnchor({ ward: target, x: pt.x, y: pt.y });
        } else {
          setPinnedAnchor(null);
        }
      } else {
        setPinnedAnchor(null);
      }
    } else {
      setPinnedAnchor(null);
    }

    const byCity = new Map<string, { count: number; peak: number }>();
    for (const w of currentWards) {
      const entry = byCity.get(w.city) ?? { count: 0, peak: 0 };
      entry.count += 1;
      if (w.expected_cases !== null && w.expected_cases > entry.peak) {
        entry.peak = w.expected_cases;
      }
      byCity.set(w.city, entry);
    }

    const weatherByCity = new Map(weatherBadgesRef.current.map((w) => [w.city, w]));

    const pins: ProjectedCityPin[] = [];
    for (const [city, coord] of Object.entries(CITY_CENTROIDS)) {
      const stats = byCity.get(city);
      const weather = weatherByCity.get(city);
      if (!stats && !weather) continue;
      const pt = map.project([coord[0], coord[1]]);
      if (pt.x >= 32 && pt.x <= width - 32 && pt.y >= 24 && pt.y <= height - 24) {
        pins.push({
          city,
          x: pt.x,
          y: pt.y,
          wardCount: stats?.count ?? 0,
          peakCases: stats?.peak ?? 0,
          weatherLabel: weather?.label,
          weatherDetail: weather?.detail,
        });
      }
    }
    setCityPins(pins);
  }, []);

  // Defer ~1.6 MB MapLibre + Web Worker download for below-the-fold non-interactive maps until near viewport.
  useEffect(() => {
    if (shouldLoad) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shouldLoad]);

  // Create the map once; maplibre-gl is loaded on demand so it never weighs on first paint.
  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const palette = readMapPalette();
        paletteRef.current = palette;
        appliedThemeRef.current = theme;

        const created = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(palette, theme),
          bounds: MAP_VIEWS[view] as unknown as [number, number, number, number],
          fitBoundsOptions: {
            padding: cameraPadding(containerRef.current, reserveForCopy),
            pitch: enable3D ? 50 : 0,
            bearing: enable3D ? -14 : 0,
          },
          interactive,
          cooperativeGestures: interactive,
          attributionControl: { compact: true },
          dragRotate: interactive,
          pitchWithRotate: interactive,
          maxPitch: 75,
        });
        map = created;

        if (interactive) {
          created.addControl(
            new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
            "top-right",
          );
        }

        created.on("load", () => {
          if (cancelled) return;
          setIsReady(true);
          setStyleVersion((v) => v + 1);
        });

        created.on("style.load", () => {
          if (!cancelled) setStyleVersion((v) => v + 1);
        });

        created.on("move", () => {
          if (!cancelled) syncProjectedOverlays();
        });
        created.on("resize", () => {
          if (!cancelled) syncProjectedOverlays();
        });

        const handleWardHover = (id?: string) => {
          const ward = wardsRef.current.find((w) => w.ward_id === id);
          if (!ward) return;
          hoverFacilityIdRef.current = null;
          setHoverFacility(null);
          hoverWardIdRef.current = ward.ward_id;
          created.getCanvas().style.cursor = selectRef.current ? "pointer" : "default";
          const pt = created.project([ward.position[0], ward.position[1]]);
          setHover({ ward, x: pt.x, y: pt.y });
        };

        const clearWardHover = () => {
          hoverWardIdRef.current = null;
          created.getCanvas().style.cursor = "";
          setHover(null);
        };

        created.on("mousemove", "wards", (event) => {
          handleWardHover(event.features?.[0]?.properties?.ward_id as string | undefined);
        });
        created.on("mouseleave", "wards", clearWardHover);

        created.on("mousemove", "ward-columns-3d", (event) => {
          handleWardHover(event.features?.[0]?.properties?.ward_id as string | undefined);
        });
        created.on("mouseleave", "ward-columns-3d", clearWardHover);

        created.on("mousemove", "facilities", (event) => {
          const fid = event.features?.[0]?.properties?.id as string | undefined;
          const fac = facilitiesRef.current.find((f) => f.id === fid);
          if (!fac) return;
          hoverWardIdRef.current = null;
          setHover(null);
          hoverFacilityIdRef.current = fac.id;
          created.getCanvas().style.cursor = "pointer";
          const pt = created.project([fac.position[0], fac.position[1]]);
          setHoverFacility({ facility: fac, x: pt.x, y: pt.y });
        });
        created.on("mouseleave", "facilities", () => {
          hoverFacilityIdRef.current = null;
          created.getCanvas().style.cursor = "";
          setHoverFacility(null);
        });

        created.on("click", (event) => {
          const facilityHits = created.queryRenderedFeatures(event.point, {
            layers: ["facilities"].filter((l) => Boolean(created.getLayer(l))),
          });
          if (facilityHits.length > 0) {
            const fid = facilityHits[0]?.properties?.id as string | undefined;
            const fac = facilitiesRef.current.find((f) => f.id === fid);
            if (fac) selectFacilityRef.current?.(fac);
            return;
          }

          const wardHits = created.queryRenderedFeatures(event.point, {
            layers: ["wards", "ward-columns-3d"].filter((l) => Boolean(created.getLayer(l))),
          });
          if (wardHits.length > 0) {
            const wid = wardHits[0]?.properties?.ward_id as string | undefined;
            if (wid) selectRef.current?.(wid);
            return;
          }

          mapClickRef.current?.([event.lngLat.lng, event.lngLat.lat]);
        });

        mapRef.current = created;
      })
      .catch(() => !cancelled && setHasFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map instance is created once when visible; theme/view/3D transitions are applied incrementally below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad]);

  // Swap visual map style cleanly when theme switches between night and street.
  useEffect(() => {
    const map = mapRef.current;
    const palette = paletteRef.current;
    if (!map || !isReady || !palette || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    shownRef.current.clear();
    map.setStyle(buildMapStyle(palette, theme));
  }, [theme, isReady]);

  // Toggle layer visibility on demand without tearing down data sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    setLayerVisible(map, "buildings-3d", Boolean(show3DBuildings));
    setLayerVisible(map, "ward-columns-3d", Boolean(showWardTowers));
    setLayerVisible(map, "wards", Boolean(showWards));
    setLayerVisible(map, "ward-glow", Boolean(showWards));
    setLayerVisible(map, "ward-focus-halo", Boolean(showWards));
    setLayerVisible(map, "ward-focus", Boolean(showWards));
  }, [show3DBuildings, showWardTowers, showWards, isReady, styleVersion]);

  // Smoothly pitch/unpitch camera when switching between 3D and 2D perspective.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !interactive) return;
    map.easeTo({
      pitch: enable3D ? 50 : 0,
      bearing: enable3D ? -14 : 0,
      duration: prefersReducedMotion() ? 0 : 750,
      essential: false,
    });
  }, [enable3D, isReady, interactive]);

  // Re-project pinned ward, weather, & city overlays whenever data or readiness changes.
  useEffect(() => {
    if (!isReady) return;
    syncProjectedOverlays();
  }, [isReady, styleVersion, wards, highlightWardId, showPinnedData, weatherBadges, view, syncProjectedOverlays]);

  // Camera follows the requested region view or manual reset trigger.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    map.fitBounds(MAP_VIEWS[view] as unknown as [number, number, number, number], {
      padding: cameraPadding(containerRef.current, reserveForCopy),
      pitch: enable3D ? 50 : 0,
      bearing: enable3D ? -14 : 0,
      duration: prefersReducedMotion() ? 0 : 1100,
      essential: false,
    });
  }, [view, resetViewNonce, isReady, reserveForCopy, enable3D]);

  // Imperative camera flight when clicking search items, facilities, or "Use my location".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !flyToTarget || flyToTarget.nonce === lastFlyNonceRef.current) return;
    lastFlyNonceRef.current = flyToTarget.nonce;
    map.flyTo({
      center: [...flyToTarget.center],
      zoom: flyToTarget.zoom,
      pitch: flyToTarget.pitch ?? (enable3D ? 56 : 0),
      bearing: flyToTarget.bearing ?? (enable3D ? -16 : 0),
      duration: prefersReducedMotion() ? 0 : 950,
      essential: true,
    });
  }, [flyToTarget, isReady, enable3D]);

  // Sync 2D ward dots & 3D hexagonal risk towers whenever wards, mode, view, or style refreshes.
  useEffect(() => {
    const map = mapRef.current;
    const palette = paletteRef.current;
    if (!map || !isReady || !palette) return;
    const wardSource = map.getSource("wards") as GeoJSONSource | undefined;
    const columnSource = map.getSource("ward-columns") as GeoJSONSource | undefined;
    if (!wardSource) return;

    const shown = shownRef.current;
    const range = caseRange(wards);
    const hexRadiusMeters = view === "all" ? 680 : 185;
    const targets = wards.map((ward) => ({
      ward,
      color: targetColor(ward, mode, palette),
      radius: targetRadius(ward, mode, range),
      height: targetColumnHeight(ward, mode, view, range),
      from: shown.get(ward.ward_id),
    }));

    if (columnSource) {
      columnSource.setData({
        type: "FeatureCollection",
        features: targets.map(({ ward, color, height }) => ({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [createHexagonPolygon(ward.position, hexRadiusMeters)],
          },
          properties: {
            ward_id: ward.ward_id,
            color,
            height,
            highlight: ward.ward_id === highlightWardId,
          },
        })),
      });
    }

    const draw = (t: number) => {
      wardSource.setData({
        type: "FeatureCollection",
        features: targets.map(({ ward, color, radius, from }) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [...ward.position] },
          properties: {
            ward_id: ward.ward_id,
            color: from && t < 1 ? mixColor(from.color, color, t) : color,
            radius: from && t < 1 ? from.radius + (radius - from.radius) * t : radius,
            glow: mode === "risk" && ward.tier === "Critical" ? 1 : 0.5,
            highlight: ward.ward_id === highlightWardId,
          },
        })),
      });
    };

    const commit = () => {
      for (const { ward, color, radius } of targets) shown.set(ward.ward_id, { color, radius });
    };

    if (prefersReducedMotion() || shown.size === 0) {
      draw(1);
      commit();
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / TWEEN_MS, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(tick);
      else commit();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      commit();
    };
  }, [wards, mode, view, highlightWardId, isReady, styleVersion]);

  // Sync hospitals & clinics GeoJSON layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource("facilities") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: facilities.map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [...f.position] },
        properties: {
          id: f.id,
          name: f.name,
          ftype: f.type,
          selected: f.id === selectedFacilityId,
        },
      })),
    });
  }, [facilities, selectedFacilityId, isReady, styleVersion]);

  // Sync routing origin start pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource("start-point") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: startPoint
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: [...startPoint] }, properties: {} }]
        : [],
    });
  }, [startPoint, isReady, styleVersion]);

  // Sync fastest/shortest OSRM routes and smoothly frame the active route in 3D.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource("routes") as GeoJSONSource | undefined;
    if (!source) return;

    if (!routeResult) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: routeResult.fastest.coordinates },
        properties: { variant: "fastest" },
      },
    ];
    if (routeResult.shortest) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: routeResult.shortest.coordinates },
        properties: { variant: "shortest" },
      });
    }
    source.setData({ type: "FeatureCollection", features });

    const allCoords = features.flatMap((f) => f.geometry.coordinates);
    if (allCoords.length >= 2) {
      let minLon = allCoords[0][0];
      let maxLon = allCoords[0][0];
      let minLat = allCoords[0][1];
      let maxLat = allCoords[0][1];
      for (const [lon, lat] of allCoords) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        {
          padding: { top: 88, right: 64, bottom: 88, left: 64 },
          pitch: enable3D ? 52 : 0,
          duration: prefersReducedMotion() ? 0 : 950,
          maxZoom: 15.5,
        },
      );
    }
  }, [routeResult, isReady, styleVersion, enable3D]);

  // Rain mode: staggered ripples, one per ward.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource("ripples") as GeoJSONSource | undefined;
    if (!source) return;
    const clear = () => source.setData({ type: "FeatureCollection", features: [] });
    if (mode !== "rain" || prefersReducedMotion()) {
      clear();
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      source.setData({
        type: "FeatureCollection",
        features: wards.map((ward, i) => {
          const phase = (((now / 2200 + i * 0.137) % 1) + 1) % 1;
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [...ward.position] },
            properties: { radius: 5 + phase * 16, opacity: 0.85 * (1 - phase) },
          };
        }),
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clear();
    };
  }, [mode, wards, isReady, styleVersion]);

  if (hasFailed) {
    return (
      <WardMapFallback
        wards={wards}
        view={view}
        mode={mode}
        label={label}
        highlightWardId={highlightWardId}
        onSelectWard={onSelectWard}
        testId={testId}
        className={className}
      />
    );
  }

  const activeCard = hover ?? (showPinnedData ? pinnedAnchor : null);
  const activeCardBelow = activeCard ? activeCard.y < 165 : false;
  const activeCardCenterY = activeCard ? activeCard.y + (activeCardBelow ? 80 : -80) : 0;

  return (
    <div
      className={clsx("relative overflow-hidden bg-ink", className)}
      data-testid={testId}
      data-map-mode={mode}
      data-map-3d={enable3D ? "true" : "false"}
      data-map-ready={isReady ? "true" : "false"}
    >
      <div ref={containerRef} className="h-full w-full" />
      <p className="sr-only" aria-live="polite">
        {label}
      </p>

      {/* Geographically anchored city data & optional live weather badges */}
      {showPinnedData || weatherBadges.length > 0
        ? cityPins.map((pin) => {
            const overlapsCard =
              activeCard !== null &&
              Math.abs(pin.x - activeCard.x) < 130 &&
              Math.abs(pin.y + 18 - activeCardCenterY) < 85;
            if (overlapsCard) return null;
            return (
              <div
                key={pin.city}
                aria-hidden="true"
                className={clsx(
                  "pointer-events-none absolute z-10 -translate-x-1/2 translate-y-4 rounded-full bg-ink/88 px-2.5 py-1 text-[10px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-md whitespace-nowrap tnum",
                  lang === "bn" && "font-bangla",
                )}
                style={{ left: pin.x, top: pin.y }}
              >
                <span>{cityDisplayName(pin.city, lang)}</span>
                {pin.weatherLabel ? (
                  <span className="ml-1.5 text-mist">· {pin.weatherLabel}</span>
                ) : pin.peakCases > 0 ? (
                  <span className="ml-1.5 text-mist">
                    {lang === "bn" ? "সর্বোচ্চ" : "peak"} {pin.peakCases.toFixed(1)}
                  </span>
                ) : null}
              </div>
            );
          })
        : null}

      {/* Floating facility hover preview pill */}
      {hoverFacility ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl bg-white/95 p-2.5 text-ink shadow-xl shadow-ink/40 ring-1 ring-mist"
          style={{ left: `clamp(7rem, ${hoverFacility.x}px, calc(100% - 7rem))`, top: hoverFacility.y }}
        >
          <p className="text-xs font-bold leading-snug text-navy">
            {lang === "bn" ? hoverFacility.facility.nameBn : hoverFacility.facility.name}
          </p>
          <p className="mt-0.5 text-[10px] text-slate">
            {hoverFacility.facility.type === "hospital"
              ? lang === "bn"
                ? "হাসপাতাল · রুট দেখতে ক্লিক করুন"
                : "Hospital · Click for road route"
              : lang === "bn"
                ? "ক্লিনিক · বিস্তারিত দেখতে ক্লিক করুন"
                : "Clinic · Click for details"}
          </p>
        </div>
      ) : null}

      {/* Exact coordinate-anchored ward data callout (hovered or pinned selected ward) */}
      {activeCard && !hoverFacility ? (
        <WardMapTooltip
          x={activeCard.x}
          y={activeCard.y}
          title={`${wardLabel(activeCard.ward.ward_id, lang)} · ${cityDisplayName(activeCard.ward.city, lang)}`}
          ward={activeCard.ward}
          mode={mode}
          pinned={!hover && Boolean(pinnedAnchor)}
          lang={lang}
        />
      ) : null}
    </div>
  );
}
