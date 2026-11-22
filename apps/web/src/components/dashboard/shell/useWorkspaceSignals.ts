"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import type { MapWard } from "@/components/ward-map/WardRiskMap";
import { fetchValidation, type City, type Ward, type WeatherMode } from "@/lib/api/client";
import { WINDOW_HORIZONS, type HorizonWindow } from "@/lib/demo-config";

export interface WorkspaceSignals {
  /** Every ward at its peak horizon inside the window. */
  peaks: MapWard[];
  /** High or Critical wards, highest expected cases first. */
  alerts: MapWard[];
  criticalCount: number;
  cityAlertCount: number;
  topWard: MapWard | null;
  holdoutMae: number | null;
  isPending: boolean;
  isError: boolean;
  exportRows: (string | number)[][];
}

const ALERT_TIERS = new Set(["High", "Critical"]);

/** One source for the alerts bell, the stat tiles and the CSV export: the five cached city heatmaps. */
export function useWorkspaceSignals(
  wards: readonly Ward[],
  city: City,
  originWeek: string,
  windowKey: HorizonWindow,
  source: WeatherMode,
): WorkspaceSignals {
  const horizons = WINDOW_HORIZONS[windowKey];
  const heatmaps = useAllCityHeatmaps(originWeek, source, wards.length > 0);
  const validation = useQuery({
    queryKey: ["validation"],
    queryFn: ({ signal }) => fetchValidation(signal),
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const peaks = buildMapWards(wards, heatmaps.cellsByWard, "peak", horizons);
    const alerts = peaks
      .filter((w) => w.tier && ALERT_TIERS.has(w.tier))
      .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0));
    const exportRows: (string | number)[][] = [
      ["ward_id", "city", "horizon_weeks", "target_week", "expected_cases", "tier", "origin_week", "source"],
    ];
    for (const ward of wards) {
      for (const cellData of heatmaps.cellsByWard.get(ward.ward_id) ?? []) {
        if (!horizons.includes(cellData.horizon)) continue;
        exportRows.push([
          ward.ward_id,
          ward.city,
          cellData.horizon,
          cellData.target_week,
          cellData.expected_cases.toFixed(2),
          cellData.tier,
          originWeek,
          source,
        ]);
      }
    }
    const mae =
      validation.data?.metrics.find((m) => m.model === "lightgbm" && m.horizon === 3 && m.period.startsWith("holdout"))
        ?.mae ?? null;
    return {
      peaks,
      alerts,
      criticalCount: peaks.filter((w) => w.tier === "Critical").length,
      cityAlertCount: alerts.filter((w) => w.city === city).length,
      topWard: alerts[0] ?? null,
      holdoutMae: mae,
      isPending: heatmaps.isPending,
      isError: heatmaps.isError,
      exportRows,
    };
  }, [wards, heatmaps.cellsByWard, heatmaps.isPending, heatmaps.isError, horizons, city, originWeek, source, validation.data]);
}
