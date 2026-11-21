"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  fetchHeatmap,
  type ApiError,
  type City,
  type HeatmapCell,
  type HeatmapResponse,
  type Ward,
  type WeatherMode,
} from "@/lib/api/client";
import { placeWards } from "./geo";
import type { MapWard } from "./WardRiskMap";

export const ALL_CITIES: readonly City[] = [
  "Dhaka North",
  "Dhaka South",
  "Gazipur",
  "Narayanganj",
  "Chattogram",
];

export interface AllCityHeatmaps {
  /** ward_id → cells for horizons 1..4 */
  cellsByWard: Map<string, HeatmapCell[]>;
  isPending: boolean;
  isError: boolean;
  error: ApiError | null;
  modelVersion: string | null;
  refetch: () => void;
}

/** One heatmap call per city corporation (5 cached requests), merged by ward. */
export function useAllCityHeatmaps(
  originWeek: string,
  source: WeatherMode,
  enabled = true,
): AllCityHeatmaps {
  const results = useQueries({
    queries: ALL_CITIES.map((city) => ({
      queryKey: ["heatmap", city, originWeek, source],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchHeatmap({ city, origin_week: originWeek, source }, signal),
      enabled: enabled && Boolean(originWeek),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Key on the response timestamps so the merged map is rebuilt only when a city's data changes.
  const dataKey = results.map((r) => r.dataUpdatedAt).join("|");
  const cellsByWard = useMemo(() => {
    const map = new Map<string, HeatmapCell[]>();
    for (const r of results) {
      for (const cell of (r.data as HeatmapResponse | undefined)?.cells ?? []) {
        map.set(cell.ward_id, [...(map.get(cell.ward_id) ?? []), cell]);
      }
    }
    return map;
    // `results` is a new array every render; dataKey captures every change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const firstError = results.find((r) => r.isError)?.error as ApiError | undefined;
  return {
    cellsByWard,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    error: firstError ?? null,
    modelVersion: (results.find((r) => r.data)?.data as HeatmapResponse | undefined)?.model_version ?? null,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

/** "peak" = the highest-risk horizon among the given ones. */
export type HorizonPick = number | "peak";

function pickCell(cells: HeatmapCell[] | undefined, pick: HorizonPick, horizons: readonly number[]) {
  const pool = (cells ?? []).filter((c) => horizons.includes(c.horizon));
  if (pick === "peak") {
    return pool.reduce<HeatmapCell | undefined>(
      (best, c) => (!best || c.risk_score > best.risk_score ? c : best),
      undefined,
    );
  }
  return pool.find((c) => c.horizon === pick);
}

export function buildMapWards(
  wards: readonly Ward[],
  cellsByWard: Map<string, HeatmapCell[]>,
  pick: HorizonPick,
  horizons: readonly number[] = [1, 2, 3, 4],
): MapWard[] {
  return placeWards(wards).map((placed) => {
    const cell = pickCell(cellsByWard.get(placed.ward_id), pick, horizons);
    return {
      ...placed,
      tier: cell?.tier ?? null,
      expected_cases: cell?.expected_cases ?? null,
      target_week: cell?.target_week ?? null,
    };
  });
}
