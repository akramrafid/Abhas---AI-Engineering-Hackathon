/**
 * Client-side Haversine distance, straight-line ETA estimate, tel: sanitisation,
 * and 3-tier Nearest Bed ranking (ADR-0018).
 *
 * Privacy guarantee: user coordinates stay strictly in browser memory and are
 * NEVER sent to any API endpoint or logged.
 */

import type { City } from "@/lib/api/client";

export const EARTH_RADIUS_KM = 6371.0;
export const ESTIMATED_URBAN_SPEED_KMH = 18.0;
export const DISPATCH_BUFFER_MIN = 5.0;
export const STALE_AFTER_HOURS = 6.0;

/** Representative city-corporation reference centroids for geolocation fallback. */
export const CITY_FALLBACK_COORDS: Record<City, { lat: number; lon: number }> = {
  "Dhaka North": { lat: 23.8103, lon: 90.4125 },
  "Dhaka South": { lat: 23.734, lon: 90.398 },
  Chattogram: { lat: 22.3569, lon: 91.7832 },
  Gazipur: { lat: 23.9999, lon: 90.4203 },
  Narayanganj: { lat: 23.6238, lon: 90.5 },
};

export interface RankableHospital {
  id: string;
  city: City;
  lat: number;
  lon: number;
  free_beds: number;
  age_hours: number;
}

export interface RankedHospitalItem<T extends RankableHospital> {
  hospital: T;
  distanceKm: number;
  etaMinutes: number;
  rankTier: 1 | 2 | 3;
  isStale: boolean;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
}

export function straightLineEtaMinutes(distanceKm: number): number {
  const km = Math.max(0, distanceKm);
  return Math.ceil((km / ESTIMATED_URBAN_SPEED_KMH) * 60 + DISPATCH_BUFFER_MIN);
}

const STRICT_TEL_HREF_RE = /^tel:\+?[0-9]{3,15}$/;

export function safeTelHref(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return STRICT_TEL_HREF_RE.test(trimmed) ? trimmed : null;
}

export function rankHospitalsClient<T extends RankableHospital>(
  hospitals: readonly T[],
  options: {
    userLat: number;
    userLon: number;
    userCity?: City | null;
    staleAfterHours?: number;
  },
): RankedHospitalItem<T>[] {
  const staleLimit = options.staleAfterHours ?? STALE_AFTER_HOURS;
  const userCity = options.userCity ?? null;

  const enriched = hospitals.map((hospital) => {
    const dist = haversineKm(
      options.userLat,
      options.userLon,
      hospital.lat,
      hospital.lon,
    );
    const isStale = hospital.age_hours > staleLimit;
    let rankTier: 1 | 2 | 3;
    let sameCityPen = 0;
    if (hospital.free_beds >= 1 && !isStale) {
      rankTier = 1;
    } else if (hospital.free_beds >= 1) {
      rankTier = 2;
    } else {
      rankTier = 3;
      sameCityPen = userCity === null || hospital.city === userCity ? 0 : 1;
    }
    return {
      hospital,
      distanceKm: Math.round(dist * 1000) / 1000,
      etaMinutes: straightLineEtaMinutes(dist),
      rankTier,
      isStale,
      sameCityPen,
      distKey: Math.round(dist * 1_000_000) / 1_000_000,
    };
  });

  enriched.sort((a, b) => {
    if (a.rankTier !== b.rankTier) return a.rankTier - b.rankTier;
    if (a.sameCityPen !== b.sameCityPen) return a.sameCityPen - b.sameCityPen;
    if (a.distKey !== b.distKey) return a.distKey - b.distKey;
    if (a.hospital.free_beds !== b.hospital.free_beds) {
      return b.hospital.free_beds - a.hospital.free_beds;
    }
    return a.hospital.id.localeCompare(b.hospital.id);
  });

  return enriched.map(({ hospital, distanceKm, etaMinutes, rankTier, isStale }) => ({
    hospital,
    distanceKm,
    etaMinutes,
    rankTier,
    isStale,
  }));
}

export function inferNearestCity(lat: number, lon: number): City {
  let best: City = "Dhaka South";
  let bestDist = Number.POSITIVE_INFINITY;
  (Object.keys(CITY_FALLBACK_COORDS) as City[]).forEach((city) => {
    const c = CITY_FALLBACK_COORDS[city];
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  });
  return best;
}
