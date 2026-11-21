import type { StyleSpecification } from "maplibre-gl";
import type { RiskTier } from "@/components/brand/RiskTierBadge";

/** Brand colours resolved from the CSS tokens at runtime (WebGL paint needs concrete colours). */
export interface MapPalette {
  ink: string;
  navy: string;
  royal: string;
  white: string;
  mist: string;
  tier: Record<RiskTier, string>;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readMapPalette(): MapPalette {
  return {
    ink: cssVar("--color-ink"),
    navy: cssVar("--color-navy"),
    royal: cssVar("--color-royal"),
    white: cssVar("--color-white"),
    mist: cssVar("--color-mist"),
    tier: {
      Low: cssVar("--color-risk-low"),
      Medium: cssVar("--color-risk-medium"),
      High: cssVar("--color-risk-high"),
      Critical: cssVar("--color-risk-critical"),
    },
  };
}

// OpenStreetMap's standard tiles need no key (tile usage policy: attribution, light use, no bulk download).
const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Raster-only style: no glyph or sprite downloads, so the map still draws (Ink ground + wards)
 * when the tile CDN is unreachable.
 */
export function buildMapStyle(palette: MapPalette): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: OSM_TILES, tileSize: 256, attribution: MAP_ATTRIBUTION, maxzoom: 19 },
      ripples: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      wards: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": palette.ink } },
      {
        // Light OSM tiles turned into an Ink night map: brightness inverted, hue turned back, colour drained,
        // then laid over the Ink ground at partial opacity so the brand ground tints it.
        id: "base",
        type: "raster",
        source: "base",
        paint: {
          "raster-brightness-min": 1,
          "raster-brightness-max": 0,
          "raster-hue-rotate": 180,
          "raster-saturation": -0.75,
          "raster-contrast": 0.15,
          "raster-opacity": 0.5,
        },
      },
      {
        id: "ripples",
        type: "circle",
        source: "ripples",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": palette.royal,
          "circle-stroke-opacity": ["get", "opacity"],
        },
      },
      {
        id: "ward-glow",
        type: "circle",
        source: "wards",
        paint: {
          "circle-radius": ["*", ["get", "radius"], 2.1],
          "circle-color": ["get", "color"],
          "circle-opacity": ["*", ["get", "glow"], 0.22],
          "circle-blur": 1,
        },
      },
      {
        id: "wards",
        type: "circle",
        source: "wards",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          // A faint light rim keeps dark tiers (Critical) legible on the night map.
          "circle-stroke-color": palette.white,
          "circle-stroke-opacity": 0.45,
          "circle-stroke-width": 1,
        },
      },
      {
        id: "ward-focus",
        type: "circle",
        source: "wards",
        filter: ["==", ["get", "highlight"], true],
        paint: {
          "circle-radius": ["+", ["get", "radius"], 7],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2,
          "circle-stroke-color": palette.white,
        },
      },
    ],
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear RGB blend for tier cross-fades; returns rgb() so MapLibre parses it directly. */
export function mixColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
