"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { clsx } from "clsx";
import type { RiskTier } from "@/components/brand/RiskTierBadge";
import type { Lang } from "@/lib/i18n";
import { CITY_CENTROIDS, MAP_VIEWS, cityDisplayName, wardLabel, type LonLat, type MapView } from "./geo";
import { buildMapStyle, mixColor, readMapPalette, type MapPalette } from "./map-style";
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

export interface WardRiskMapProps {
  wards: readonly MapWard[];
  view: MapView;
  mode: MapMode;
  /** Accessible summary of what the map currently shows. */
  label: string;
  highlightWardId?: string | null;
  onSelectWard?: (wardId: string) => void;
  /** Pan and zoom with two fingers / ctrl+scroll (dashboard); the landing map stays still. */
  interactive?: boolean;
  /** Keep wards clear of copy laid over the map (landing): left column on desktop, bottom on phones. */
  reserveForCopy?: boolean;
  /** Anchor a live data card & city callouts directly onto geographic map locations. */
  showPinnedData?: boolean;
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
  if (!reserveForCopy) return { top: 48, right: 40, bottom: 40, left: 40 };
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

interface ProjectedAnchor {
  ward: MapWard;
  x: number;
  y: number;
}

interface ProjectedCityPin {
  city: string;
  x: number;
  y: number;
  wardCount: number;
  peakCases: number;
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
  lang = "en",
  testId = "ward-risk-map",
  className,
}: WardRiskMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const paletteRef = useRef<MapPalette | null>(null);
  const shownRef = useRef(new Map<string, { color: string; radius: number }>());
  const selectRef = useRef(onSelectWard);
  const highlightRef = useRef(highlightWardId);
  const showPinnedRef = useRef(showPinnedData);
  const [shouldLoad, setShouldLoad] = useState(interactive);
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [hover, setHover] = useState<ProjectedAnchor | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<ProjectedAnchor | null>(null);
  const [cityPins, setCityPins] = useState<ProjectedCityPin[]>([]);
  const wardsRef = useRef(wards);
  const hoverWardIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectRef.current = onSelectWard;
    wardsRef.current = wards;
    highlightRef.current = highlightWardId;
    showPinnedRef.current = showPinnedData;
  });

  /** Project the highlighted ward, active hover ward, & city centroids to exact viewport pixels. */
  const syncProjectedOverlays = useCallback(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const currentWards = wardsRef.current;

    // Keep any hovered ward callout locked onto its dot during pan/zoom.
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

    if (!showPinnedRef.current) {
      setPinnedAnchor(null);
      setCityPins([]);
      return;
    }

    const focusId = highlightRef.current;

    if (focusId) {
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

    // Compute city-level location badges anchored strictly to each city's geographic centroid.
    const byCity = new Map<string, { count: number; peak: number }>();
    for (const w of currentWards) {
      const entry = byCity.get(w.city) ?? { count: 0, peak: 0 };
      entry.count += 1;
      if (w.expected_cases !== null && w.expected_cases > entry.peak) {
        entry.peak = w.expected_cases;
      }
      byCity.set(w.city, entry);
    }

    const pins: ProjectedCityPin[] = [];
    for (const [city, coord] of Object.entries(CITY_CENTROIDS)) {
      const stats = byCity.get(city);
      if (!stats) continue;
      const pt = map.project([coord[0], coord[1]]);
      if (pt.x >= 32 && pt.x <= width - 32 && pt.y >= 24 && pt.y <= height - 24) {
        pins.push({
          city,
          x: pt.x,
          y: pt.y,
          wardCount: stats.count,
          peakCases: stats.peak,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const created = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(palette),
          bounds: MAP_VIEWS[view] as unknown as [number, number, number, number],
          fitBoundsOptions: { padding: cameraPadding(containerRef.current, reserveForCopy) },
          interactive,
          cooperativeGestures: interactive,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map = created;
        if (interactive) created.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        created.on("load", () => {
          if (cancelled) return;
          setIsReady(true);
        });
        created.on("move", () => {
          if (!cancelled) syncProjectedOverlays();
        });
        created.on("resize", () => {
          if (!cancelled) syncProjectedOverlays();
        });
        created.on("mousemove", "wards", (event) => {
          const id = event.features?.[0]?.properties?.ward_id as string | undefined;
          const ward = wardsRef.current.find((w) => w.ward_id === id);
          if (!ward) return;
          hoverWardIdRef.current = ward.ward_id;
          created.getCanvas().style.cursor = selectRef.current ? "pointer" : "default";
          // Snap tooltip strictly to the ward's exact projected coordinate rather than raw mouse offset.
          const pt = created.project([ward.position[0], ward.position[1]]);
          setHover({ ward, x: pt.x, y: pt.y });
        });
        created.on("mouseleave", "wards", () => {
          hoverWardIdRef.current = null;
          created.getCanvas().style.cursor = "";
          setHover(null);
        });
        created.on("click", "wards", (event) => {
          const id = event.features?.[0]?.properties?.ward_id as string | undefined;
          if (id) selectRef.current?.(id);
        });
        mapRef.current = created;
      })
      .catch(() => !cancelled && setHasFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map instance is created once when visible; view/interactive changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad]);

  // Re-project pinned ward & city overlays whenever wards, highlight, view, or readiness changes.
  useEffect(() => {
    if (!isReady) return;
    syncProjectedOverlays();
  }, [isReady, wards, highlightWardId, showPinnedData, view, syncProjectedOverlays]);

  // Camera follows the requested view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    map.fitBounds(MAP_VIEWS[view] as unknown as [number, number, number, number], {
      padding: cameraPadding(containerRef.current, reserveForCopy),
      duration: prefersReducedMotion() ? 0 : 1200,
      essential: false,
    });
  }, [view, isReady, reserveForCopy]);

  // Ward colours and sizes cross-fade between steps.
  useEffect(() => {
    const map = mapRef.current;
    const palette = paletteRef.current;
    if (!map || !isReady || !palette) return;
    const source = map.getSource("wards") as GeoJSONSource | undefined;
    if (!source) return;
    const shown = shownRef.current;
    const range = caseRange(wards);
    const targets = wards.map((ward) => ({
      ward,
      color: targetColor(ward, mode, palette),
      radius: targetRadius(ward, mode, range),
      from: shown.get(ward.ward_id),
    }));

    const draw = (t: number) => {
      source.setData({
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
  }, [wards, mode, highlightWardId, isReady]);

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
  }, [mode, wards, isReady]);

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
      data-map-ready={isReady ? "true" : "false"}
    >
      <div ref={containerRef} className="h-full w-full" />
      <p className="sr-only" aria-live="polite">
        {label}
      </p>

      {/* Geographically anchored city data badges (auto-hidden where they would collide with the active ward card) */}
      {showPinnedData
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
                  "pointer-events-none absolute z-10 -translate-x-1/2 translate-y-4 rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-md whitespace-nowrap tnum",
                  lang === "bn" && "font-bangla",
                )}
                style={{ left: pin.x, top: pin.y }}
              >
                <span>{cityDisplayName(pin.city, lang)}</span>
                {pin.peakCases > 0 ? (
                  <span className="ml-1.5 text-mist">
                    {lang === "bn" ? "সর্বোচ্চ" : "peak"} {pin.peakCases.toFixed(1)}
                  </span>
                ) : null}
              </div>
            );
          })
        : null}

      {/* Exact coordinate-anchored ward data callout (hovered or pinned selected ward) */}
      {activeCard ? (
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
