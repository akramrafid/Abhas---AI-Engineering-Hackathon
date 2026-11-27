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

export type MapTheme = "night" | "street";

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

// OpenStreetMap standard tiles + OpenFreeMap vector 3D building footprint tiles (no API key required).
const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
const OPENFREEMAP_VECTOR = "https://tiles.openfreemap.org/planet";

export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * 3D-capable MapLibre style: OSM base raster + OpenFreeMap 3D extruded building masses +
 * 3D extruded hexagonal ward risk towers + OSRM road route lines + hospital/clinic layers.
 * Fault-tolerant: renders cleanly on the brand Ink/Street ground even when external tile CDNs are offline.
 */
export function buildMapStyle(palette: MapPalette, theme: MapTheme = "night"): StyleSpecification {
  const isNight = theme === "night";

  return {
    version: 8,
    light: {
      anchor: "viewport",
      color: "#ffffff",
      intensity: isNight ? 0.42 : 0.35,
      position: [1.4, 210, 42],
    },
    sources: {
      base: {
        type: "raster",
        tiles: OSM_TILES,
        tileSize: 256,
        attribution: MAP_ATTRIBUTION,
        maxzoom: 19,
      },
      openmaptiles: {
        type: "vector",
        url: OPENFREEMAP_VECTOR,
      },
      ripples: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "ward-columns": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      wards: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      routes: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      facilities: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "start-point": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      {
        id: "ground",
        type: "background",
        paint: { "background-color": isNight ? palette.ink : "#eef2f7" },
      },
      {
        id: "base",
        type: "raster",
        source: "base",
        paint: isNight
          ? {
              "raster-brightness-min": 1,
              "raster-brightness-max": 0,
              "raster-hue-rotate": 180,
              "raster-saturation": -0.75,
              "raster-contrast": 0.15,
              "raster-opacity": 0.55,
            }
          : {
              "raster-brightness-min": 0.02,
              "raster-brightness-max": 1,
              "raster-saturation": -0.12,
              "raster-contrast": 0.04,
              "raster-opacity": 0.96,
            },
      },
      {
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        filter: ["!", ["has", "hide_3d"]],
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
          "fill-extrusion-color": isNight
            ? [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 12],
                0,
                "#131e3d",
                25,
                "#1d2f66",
                65,
                "#294596",
              ]
            : [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 12],
                0,
                "#dce2ed",
                25,
                "#c5d0e3",
                65,
                "#aebcd4",
              ],
          "fill-extrusion-opacity": isNight ? 0.82 : 0.78,
          "fill-extrusion-vertical-gradient": true,
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
        id: "ward-columns-3d",
        type: "fill-extrusion",
        source: "ward-columns",
        maxzoom: 14.3,
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-extrusion-base": 0,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-opacity": 0.76,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "wards",
        type: "circle",
        source: "wards",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-stroke-color": palette.white,
          "circle-stroke-opacity": isNight ? 0.45 : 0.85,
          "circle-stroke-width": isNight ? 1 : 1.5,
        },
      },
      {
        id: "ward-focus-halo",
        type: "circle",
        source: "wards",
        filter: ["==", ["get", "highlight"], true],
        paint: {
          "circle-radius": ["+", ["get", "radius"], 10],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": palette.royal,
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
          "circle-stroke-color": isNight ? palette.white : palette.ink,
        },
      },
      {
        id: "route-shortest",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "variant"], "shortest"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": isNight ? "#94a3b8" : "#334155",
          "line-width": 4,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.9,
        },
      },
      {
        id: "route-fastest-casing",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "variant"], "fastest"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": palette.white,
          "line-width": 8.5,
          "line-opacity": 0.92,
        },
      },
      {
        id: "route-fastest",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "variant"], "fastest"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": palette.royal,
          "line-width": 4.5,
          "line-opacity": 1,
        },
      },
      {
        id: "facilities-halo",
        type: "circle",
        source: "facilities",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": 14,
          "circle-color": palette.royal,
          "circle-opacity": 0.25,
          "circle-stroke-width": 2,
          "circle-stroke-color": palette.royal,
        },
      },
      {
        id: "facilities",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], true], 8, 5.5],
          "circle-color": ["match", ["get", "ftype"], "hospital", palette.royal, "clinic", "#0D9488", palette.royal],
          "circle-stroke-width": 2,
          "circle-stroke-color": palette.white,
        },
      },
      {
        id: "start-point-pulse",
        type: "circle",
        source: "start-point",
        paint: {
          "circle-radius": 13,
          "circle-color": "#059669",
          "circle-opacity": 0.26,
        },
      },
      {
        id: "start-point",
        type: "circle",
        source: "start-point",
        paint: {
          "circle-radius": 6.5,
          "circle-color": "#059669",
          "circle-stroke-width": 2.5,
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
