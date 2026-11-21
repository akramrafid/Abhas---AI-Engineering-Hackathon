import type { City, Ward } from "@/lib/api/client";

export type LonLat = readonly [number, number];

/**
 * City corporation centroids, copied from apps/api/config/city_centroids.json
 * (the same points the Open-Meteo adapter queries).
 */
export const CITY_CENTROIDS: Record<City, LonLat> = {
  "Dhaka North": [90.4125, 23.8103],
  "Dhaka South": [90.4086, 23.7231],
  Chattogram: [91.7832, 22.3569],
  Gazipur: [90.4203, 23.9999],
  Narayanganj: [90.5, 23.6238],
};

/** Spread radius in degrees of latitude; sized so neighbouring corporations never overlap. */
const CITY_RADIUS_DEG: Record<City, number> = {
  "Dhaka North": 0.042,
  "Dhaka South": 0.04,
  Chattogram: 0.05,
  Gazipur: 0.03,
  Narayanganj: 0.026,
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The dataset has no ward geometry. Each ward is placed on a sunflower spiral around its
 * city's real centroid, ordered by ward number, so positions are stable and never overlap.
 * shortcut: approximate positions; swap in ward polygons when a boundary file is available.
 */
export function approximateWardPosition(city: City, index: number, count: number): LonLat {
  const [lon, lat] = CITY_CENTROIDS[city];
  const radius = CITY_RADIUS_DEG[city] * Math.sqrt((index + 0.5) / Math.max(count, 1));
  const angle = index * GOLDEN_ANGLE;
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  return [lon + radius * Math.cos(angle) * lonScale, lat + radius * Math.sin(angle)];
}

export function wardNumber(wardId: string): number {
  const match = /(\d+)$/.exec(wardId);
  return match ? Number(match[1]) : 0;
}

export function wardLabel(wardId: string): string {
  return `Ward ${wardNumber(wardId)}`;
}

export interface PlacedWard {
  ward_id: string;
  city: City;
  position: LonLat;
}

export function placeWards(wards: readonly Ward[]): PlacedWard[] {
  const byCity = new Map<City, Ward[]>();
  for (const ward of wards) {
    byCity.set(ward.city, [...(byCity.get(ward.city) ?? []), ward]);
  }
  const placed: PlacedWard[] = [];
  for (const [city, cityWards] of byCity) {
    const sorted = [...cityWards].sort((a, b) => wardNumber(a.ward_id) - wardNumber(b.ward_id));
    sorted.forEach((ward, index) => {
      placed.push({
        ward_id: ward.ward_id,
        city,
        position: approximateWardPosition(city, index, sorted.length),
      });
    });
  }
  return placed;
}

/** Camera targets: [west, south, east, north]. */
export const MAP_VIEWS = {
  dhaka: [90.3, 23.55, 90.62, 24.06],
  chattogram: [91.68, 22.27, 91.89, 22.45],
  all: [90.2, 22.2, 91.95, 24.12],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type MapView = keyof typeof MAP_VIEWS;
