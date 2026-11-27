import type { LonLat } from "./geo";
import { haversineKm, rankFacilitiesByAirDistance, type FacilityType, type HealthFacility } from "./facilities";

const OSRM_BASE = "https://router.project-osrm.org";
const ROUTE_TIMEOUT_MS = 6500;
const TABLE_TIMEOUT_MS = 5500;

/** Conservative Dhaka/Chattogram urban tortuosity and average free-flow fallback speed. */
const ROAD_TORTUOSITY_FACTOR = 1.34;
const FREE_FLOW_URBAN_KMH = 24;

function isRoutingOffline(): boolean {
  if (
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1" ||
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "true"
  ) {
    return true;
  }
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface RouteVariant {
  id: "fastest" | "shortest";
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
  summary: string;
  stepsCount: number;
}

export interface RouteResult {
  origin: LonLat;
  destination: HealthFacility;
  fastest: RouteVariant;
  shortest: RouteVariant | null;
  engine: "osrm" | "offline-fallback";
  computeMs: number;
}

export interface NearestHospitalResult {
  facility: HealthFacility;
  distanceKm: number;
  durationMin: number;
  engine: "osrm" | "offline-fallback";
}

interface OsrmRouteItem {
  distance: number;
  duration: number;
  geometry?: { type: "LineString"; coordinates: [number, number][] };
  legs?: Array<{ summary?: string; steps?: unknown[] }>;
}

interface OsrmRouteResponse {
  code?: string;
  routes?: OsrmRouteItem[];
}

interface OsrmTableResponse {
  code?: string;
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
}

function buildFallbackVariant(origin: LonLat, dest: LonLat): RouteVariant {
  const airKm = haversineKm(origin, dest);
  const distanceKm = Math.max(0.2, Number((airKm * ROAD_TORTUOSITY_FACTOR).toFixed(2)));
  const durationMin = Math.max(1, Math.round((distanceKm / FREE_FLOW_URBAN_KMH) * 60));
  const midLon = (origin[0] + dest[0]) / 2 + (dest[1] - origin[1]) * 0.08;
  const midLat = (origin[1] + dest[1]) / 2 - (dest[0] - origin[0]) * 0.08;
  return {
    id: "fastest",
    coordinates: [
      [origin[0], origin[1]],
      [midLon, midLat],
      [dest[0], dest[1]],
    ],
    distanceKm,
    durationMin,
    summary: "Estimated urban road corridor",
    stepsCount: 2,
  };
}

function composeSignal(external?: AbortSignal, timeoutMs = ROUTE_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  external?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Computes directed driving route(s) from origin to destination via OSRM public road graph,
 * returning both the fastest route and any genuinely shorter alternative path.
 * Falls back cleanly to deterministic urban distance estimates if OSRM is offline.
 */
export async function fetchRoadRoute(
  origin: LonLat,
  destination: HealthFacility,
  externalSignal?: AbortSignal,
): Promise<RouteResult> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (isRoutingOffline()) {
    const computeMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    return {
      origin,
      destination,
      fastest: buildFallbackVariant(origin, destination.position),
      shortest: null,
      engine: "offline-fallback",
      computeMs,
    };
  }
  const { signal, cleanup } = composeSignal(externalSignal, ROUTE_TIMEOUT_MS);

  try {
    const url =
      `${OSRM_BASE}/route/v1/driving/` +
      `${origin[0].toFixed(6)},${origin[1].toFixed(6)};${destination.position[0].toFixed(6)},${destination.position[1].toFixed(6)}` +
      `?overview=full&geometries=geojson&alternatives=true&steps=true`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("No OSRM route");
    }

    const parsed: RouteVariant[] = data.routes
      .filter((r) => Boolean(r.geometry?.coordinates?.length))
      .map((r, idx) => ({
        id: idx === 0 ? "fastest" : "shortest",
        coordinates: r.geometry!.coordinates,
        distanceKm: Number((r.distance / 1000).toFixed(2)),
        durationMin: Math.max(1, Math.round(r.duration / 60)),
        summary: r.legs?.[0]?.summary?.trim() || "OpenStreetMap road network",
        stepsCount: r.legs?.[0]?.steps?.length ?? 0,
      }));

    if (!parsed.length) throw new Error("Empty route geometry");

    const byTime = [...parsed].sort((a, b) => a.durationMin - b.durationMin);
    const fastest: RouteVariant = { ...byTime[0], id: "fastest" };
    const shortestCandidate = [...parsed]
      .filter((r) => r.distanceKm < fastest.distanceKm - 0.15)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    const computeMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    return {
      origin,
      destination,
      fastest,
      shortest: shortestCandidate ? { ...shortestCandidate, id: "shortest" } : null,
      engine: "osrm",
      computeMs,
    };
  } catch (err) {
    if (externalSignal?.aborted) throw err;
    const computeMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    return {
      origin,
      destination,
      fastest: buildFallbackVariant(origin, destination.position),
      shortest: null,
      engine: "offline-fallback",
      computeMs,
    };
  } finally {
    cleanup();
  }
}

/**
 * Finds the nearest hospitals/clinics by real directed road travel time using OSRM Table API
 * across the top 12 air-closest candidates in a single network call.
 */
export async function fetchNearestHospitalsByRoad(
  origin: LonLat,
  facilities: readonly HealthFacility[],
  filter: "all" | FacilityType = "all",
  limit = 8,
  externalSignal?: AbortSignal,
): Promise<{ items: NearestHospitalResult[]; engine: "osrm" | "offline-fallback"; computeMs: number }> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const candidates = rankFacilitiesByAirDistance(origin, facilities, filter).slice(0, 12);

  if (candidates.length === 0) {
    return { items: [], engine: isRoutingOffline() ? "offline-fallback" : "osrm", computeMs: 0 };
  }

  if (isRoutingOffline()) {
    const items: NearestHospitalResult[] = candidates
      .map((facility) => {
        const roadKm = Math.max(0.2, Number((facility.airKm * ROAD_TORTUOSITY_FACTOR).toFixed(2)));
        return {
          facility,
          distanceKm: roadKm,
          durationMin: Math.max(1, Math.round((roadKm / FREE_FLOW_URBAN_KMH) * 60)),
          engine: "offline-fallback" as const,
        };
      })
      .slice(0, limit);
    const computeMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    return { items, engine: "offline-fallback", computeMs };
  }

  const { signal, cleanup } = composeSignal(externalSignal, TABLE_TIMEOUT_MS);
  try {
    const coords = [origin, ...candidates.map((c) => c.position)]
      .map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`)
      .join(";");
    const destIndices = candidates.map((_, idx) => idx + 1).join(";");
    const url = `${OSRM_BASE}/table/v1/driving/${coords}?sources=0&destinations=${destIndices}&annotations=distance,duration`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OsrmTableResponse;
    const distances = data.distances?.[0];
    const durations = data.durations?.[0];
    if (data.code !== "Ok" || !distances || !durations) {
      throw new Error("Invalid OSRM table response");
    }

    const items: NearestHospitalResult[] = candidates
      .map((facility, idx) => {
        const distM = distances[idx];
        const durS = durations[idx];
        if (typeof distM === "number" && typeof durS === "number") {
          return {
            facility,
            distanceKm: Number((distM / 1000).toFixed(2)),
            durationMin: Math.max(1, Math.round(durS / 60)),
            engine: "osrm" as const,
          };
        }
        const roadKm = Math.max(0.2, Number((facility.airKm * ROAD_TORTUOSITY_FACTOR).toFixed(2)));
        return {
          facility,
          distanceKm: roadKm,
          durationMin: Math.max(1, Math.round((roadKm / FREE_FLOW_URBAN_KMH) * 60)),
          engine: "offline-fallback" as const,
        };
      })
      .sort((a, b) => a.durationMin - b.durationMin || a.distanceKm - b.distanceKm)
      .slice(0, limit);

    const computeMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    return { items, engine: "osrm", computeMs };
  } catch (err) {
    if (externalSignal?.aborted) throw err;
    const items: NearestHospitalResult[] = candidates
      .map((facility) => {
        const roadKm = Math.max(0.2, Number((facility.airKm * ROAD_TORTUOSITY_FACTOR).toFixed(2)));
        return {
          facility,
          distanceKm: roadKm,
          durationMin: Math.max(1, Math.round((roadKm / FREE_FLOW_URBAN_KMH) * 60)),
          engine: "offline-fallback" as const,
        };
      })
      .slice(0, limit);
    const computeMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    return { items, engine: "offline-fallback", computeMs };
  } finally {
    cleanup();
  }
}
