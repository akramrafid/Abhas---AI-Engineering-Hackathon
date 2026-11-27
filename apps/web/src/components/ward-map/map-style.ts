import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";
import type { RiskTier } from "@/components/brand/RiskTierBadge";
import { CITY_CENTROIDS } from "./geo";

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

export interface BuildMapStyleOptions {
  /** Render bundled GeoJSON schematic layers with zero remote tile/vector fetches (ADR-0015). */
  offline?: boolean;
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

/** True when NEXT_PUBLIC_ABHAS_OFFLINE forces zero remote tile requests. */
export function isOfflineMapEnv(): boolean {
  return (
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1" ||
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "true"
  );
}

// OpenStreetMap standard tiles + OpenFreeMap vector 3D building footprint tiles (no API key required).
const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
const OPENFREEMAP_VECTOR = "https://tiles.openfreemap.org/planet";

export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const OFFLINE_MAP_ATTRIBUTION = "Abhas offline schematic · bundled city coordinates";

const CITY_SCHEMATIC_RADIUS_DEG: Record<string, number> = {
  "Dhaka North": 0.056,
  "Dhaka South": 0.052,
  Chattogram: 0.068,
  Gazipur: 0.044,
  Narayanganj: 0.038,
};

function circlePolygon(lon: number, lat: number, radiusDeg: number, sides = 24): [number, number][] {
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides;
    ring.push([lon + radiusDeg * Math.cos(angle) * lonScale, lat + radiusDeg * Math.sin(angle)]);
  }
  return ring;
}

function buildOfflineGridGeoJson(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let lon = 90.0; lon <= 92.2001; lon = Number((lon + 0.1).toFixed(2))) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, 22.0],
          [lon, 24.3],
        ],
      },
      properties: { major: Math.abs((lon * 10) % 5) < 0.01 },
    });
  }
  for (let lat = 22.0; lat <= 24.3001; lat = Number((lat + 0.1).toFixed(2))) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [90.0, lat],
          [92.2, lat],
        ],
      },
      properties: { major: Math.abs((lat * 10) % 5) < 0.01 },
    });
  }
  return { type: "FeatureCollection", features };
}

function buildOfflineRegionsGeoJson(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = Object.entries(CITY_CENTROIDS).map(
    ([city, [lon, lat]]) => {
      const r = CITY_SCHEMATIC_RADIUS_DEG[city] ?? 0.045;
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [circlePolygon(lon, lat, r)],
        },
        properties: { city },
      };
    },
  );
  return { type: "FeatureCollection", features };
}

function buildOfflineCorridorsGeoJson(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const g = CITY_CENTROIDS.Gazipur;
  const dn = CITY_CENTROIDS["Dhaka North"];
  const ds = CITY_CENTROIDS["Dhaka South"];
  const n = CITY_CENTROIDS.Narayanganj;
  const c = CITY_CENTROIDS.Chattogram;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [g[0], g[1]],
            [dn[0], dn[1]],
            [ds[0], ds[1]],
            [n[0], n[1]],
          ],
        },
        properties: { name: "Dhaka-Gazipur-Narayanganj metro axis" },
      },
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [n[0], n[1]],
            [90.85, 23.46],
            [91.32, 23.01],
            [c[0], c[1]],
          ],
        },
        properties: { name: "Dhaka-Chattogram N1 highway corridor" },
      },
    ],
  };
}

const OFFLINE_GRID_DATA = buildOfflineGridGeoJson();
const OFFLINE_REGIONS_DATA = buildOfflineRegionsGeoJson();
const OFFLINE_CORRIDORS_DATA = buildOfflineCorridorsGeoJson();

/**
 * 3D-capable MapLibre style: OSM base raster + OpenFreeMap 3D extruded building masses +
 * 3D extruded hexagonal ward risk towers + OSRM road route lines + hospital/clinic layers.
 * When `options.offline` is true (kill switch or after tile failure), replaces external tiles
 * with a bundled GeoJSON schematic basemap so zero external network calls are made (ADR-0015).
 */
export function buildMapStyle(
  palette: MapPalette,
  theme: MapTheme = "night",
  options: BuildMapStyleOptions = {},
): StyleSpecification {
  const isNight = theme === "night";
  const offline = Boolean(options.offline);

  const sources: Record<string, SourceSpecification> = {
    ...(offline
      ? {
          "offline-grid": {
            type: "geojson",
            data: OFFLINE_GRID_DATA,
            attribution: OFFLINE_MAP_ATTRIBUTION,
          },
          "offline-regions": {
            type: "geojson",
            data: OFFLINE_REGIONS_DATA,
          },
          "offline-corridors": {
            type: "geojson",
            data: OFFLINE_CORRIDORS_DATA,
          },
        }
      : {
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
        }),
    ripples: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    "ward-columns": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    wards: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    routes: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    facilities: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    "start-point": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  };

  const baseLayers: LayerSpecification[] = offline
    ? [
        {
          id: "ground",
          type: "background",
          paint: { "background-color": isNight ? palette.ink : "#eef2f7" },
        },
        {
          id: "offline-grid-lines",
          type: "line",
          source: "offline-grid",
          paint: {
            "line-color": isNight ? "#1b2a52" : "#cbd5e1",
            "line-width": ["case", ["==", ["get", "major"], true], 1.1, 0.55],
            "line-opacity": isNight ? 0.55 : 0.7,
          },
        },
        {
          id: "offline-corridors-line",
          type: "line",
          source: "offline-corridors",
          paint: {
            "line-color": isNight ? "#334d94" : "#94a3b8",
            "line-width": 2,
            "line-dasharray": [4, 3],
            "line-opacity": 0.75,
          },
        },
        {
          id: "offline-regions-fill",
          type: "fill",
          source: "offline-regions",
          paint: {
            "fill-color": isNight ? palette.navy : "#dbe4f3",
            "fill-opacity": isNight ? 0.48 : 0.65,
          },
        },
        {
          id: "offline-regions-outline",
          type: "line",
          source: "offline-regions",
          paint: {
            "line-color": isNight ? palette.royal : "#475569",
            "line-width": 1.4,
            "line-opacity": isNight ? 0.6 : 0.55,
          },
        },
      ]
    : [
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
      ];

  return {
    version: 8,
    light: {
      anchor: "viewport",
      color: "#ffffff",
      intensity: isNight ? 0.42 : 0.35,
      position: [1.4, 210, 42],
    },
    sources,
    layers: [
      ...baseLayers,
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
          "circle-color": [
            "match",
            ["get", "ftype"],
            "hospital",
            palette.royal,
            "clinic",
            "#0D9488",
            palette.royal,
          ],
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
