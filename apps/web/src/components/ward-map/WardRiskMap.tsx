"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { clsx } from "clsx";
import type { RiskTier } from "@/components/brand/RiskTierBadge";
import { MAP_VIEWS, wardLabel, type LonLat, type MapView } from "./geo";
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
  if (!reserveForCopy) return { top: 32, right: 32, bottom: 32, left: 32 };
  if (width >= 1024) return { top: 90, right: 300, bottom: 70, left: Math.round(width * 0.42) };
  return { top: 80, right: 20, bottom: Math.round(height * 0.45), left: 20 };
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

export function WardRiskMap({
  wards,
  view,
  mode,
  label,
  highlightWardId = null,
  onSelectWard,
  interactive = false,
  reserveForCopy = false,
  className,
}: WardRiskMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const paletteRef = useRef<MapPalette | null>(null);
  const shownRef = useRef(new Map<string, { color: string; radius: number }>());
  const selectRef = useRef(onSelectWard);
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [hover, setHover] = useState<{ ward: MapWard; x: number; y: number } | null>(null);
  const wardsRef = useRef(wards);

  useEffect(() => {
    selectRef.current = onSelectWard;
    wardsRef.current = wards;
  });

  // Create the map once; maplibre-gl is loaded on demand so it never weighs on first paint.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        // Copied by scripts/copy-maplibre-worker.mjs; bundling breaks MapLibre's own worker lookup.
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
        created.on("load", () => !cancelled && setIsReady(true));
        created.on("mousemove", "wards", (event) => {
          const id = event.features?.[0]?.properties?.ward_id as string | undefined;
          const ward = wardsRef.current.find((w) => w.ward_id === id);
          if (!ward) return;
          created.getCanvas().style.cursor = selectRef.current ? "pointer" : "default";
          setHover({ ward, x: event.point.x, y: event.point.y });
        });
        created.on("mouseleave", "wards", () => {
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
    // The map instance is created once; view/interactive changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera follows the requested view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    map.fitBounds(MAP_VIEWS[view] as unknown as [number, number, number, number], {
      padding: cameraPadding(containerRef.current, reserveForCopy),
      duration: prefersReducedMotion() ? 0 : 1600,
      essential: false,
    });
  }, [view, isReady, reserveForCopy]);

  // Ward colours and sizes cross-fade between steps: the signature motion of the rain clock.
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
      draw(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) frame = requestAnimationFrame(tick);
      else commit();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      commit();
    };
  }, [wards, mode, highlightWardId, isReady]);

  // Rain mode: staggered ripples, one per ward, like drops landing.
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
        className={className}
      />
    );
  }

  return (
    <div
      className={clsx("relative overflow-hidden bg-ink", className)}
      data-testid="ward-risk-map"
      data-map-mode={mode}
      data-map-ready={isReady ? "true" : "false"}
    >
      <div ref={containerRef} className="h-full w-full" />
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
      {hover ? (
        <WardMapTooltip
          x={hover.x}
          y={hover.y}
          title={`${wardLabel(hover.ward.ward_id)} · ${hover.ward.city}`}
          ward={hover.ward}
          mode={mode}
        />
      ) : null}
    </div>
  );
}
