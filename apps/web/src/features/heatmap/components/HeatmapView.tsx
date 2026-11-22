"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import type { City, HeatmapCell, RiskTier, WeatherMode } from "@/lib/api/client";
import { TIER_META, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import { getIsoWeekInfo } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";
import { useHeatmapQuery } from "../hooks";
import { HeatmapMatrixTable } from "./HeatmapMatrixTable";
import { HeatmapTileGrid } from "./HeatmapTileGrid";

export interface HeatmapViewProps {
  city: City;
  originWeek: string;
  source: WeatherMode;
  lang?: Lang;
  onSelectWard: (wardId: string) => void;
  onResetCity: () => void;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

export function HeatmapView({
  city,
  originWeek,
  source,
  lang = "en",
  onSelectWard,
  onResetCity,
}: HeatmapViewProps) {
  const heatmapQuery = useHeatmapQuery({
    city,
    originWeek,
    source,
    enabled: Boolean(city) && Boolean(originWeek),
  });

  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const cell of heatmapQuery.data?.cells ?? []) {
      map.set(`${cell.ward_id}:${cell.horizon}`, cell);
    }
    return map;
  }, [heatmapQuery.data?.cells]);

  const horizonDates = useMemo(() => {
    const dates = new Map<number, string>();
    for (const cell of heatmapQuery.data?.cells ?? []) {
      if (!dates.has(cell.horizon)) {
        dates.set(cell.horizon, cell.target_week);
      }
    }
    return dates;
  }, [heatmapQuery.data?.cells]);

  const wardPeakMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const cell of heatmapQuery.data?.cells ?? []) {
      const existing = map.get(cell.ward_id);
      if (
        !existing ||
        TIER_RANK[cell.tier] > TIER_RANK[existing.tier] ||
        (TIER_RANK[cell.tier] === TIER_RANK[existing.tier] &&
          cell.expected_cases > existing.expected_cases)
      ) {
        map.set(cell.ward_id, cell);
      }
    }
    return map;
  }, [heatmapQuery.data?.cells]);

  if (heatmapQuery.isError) {
    return (
      <ErrorBanner
        testId="heatmap-error-banner"
        retryTestId="heatmap-retry"
        title="Could not load city heatmap"
        error={heatmapQuery.error}
        onRetry={() => {
          void heatmapQuery.refetch();
        }}
      />
    );
  }

  if (heatmapQuery.isPending) {
    return (
      <PanelSkeleton
        testId="heatmap-loading"
        label="Loading city risk heatmap…"
      />
    );
  }

  const data = heatmapQuery.data;
  if (!data || data.ward_ids.length === 0 || data.cells.length === 0) {
    return (
      <EmptyState
        testId="heatmap-empty-state"
        title="No heatmap cells returned"
        description="No ward forecasts were returned for this city and origin week."
        actionLabel="Reset to Dhaka South"
        onAction={onResetCity}
      />
    );
  }

  const tierCounts: Record<RiskTier, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };
  for (const wid of data.ward_ids) {
    const peak = wardPeakMap.get(wid);
    if (peak) tierCounts[peak.tier] += 1;
  }

  const originInfo = getIsoWeekInfo(data.origin_week);

  return (
    <div data-testid="heatmap-panel" className="space-y-5">
      <StubDataBanner modelVersion={data.model_version} />

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>City risk heatmap — {data.city}</CardTitle>
            <CardDescription className="font-mono text-xs tnum">
              Origin {originInfo ? `${originInfo.shortLabel} (${data.origin_week})` : data.origin_week} ·{" "}
              {data.ward_ids.length} wards · Model {data.model_version}
            </CardDescription>
          </div>
          <div
            data-testid="heatmap-summary"
            className="flex flex-wrap items-center gap-2 font-mono text-xs tnum"
          >
            {([...TIER_ORDER].reverse() as RiskTier[]).map((tier) => (
              <span
                key={tier}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-semibold",
                  TIER_META[tier].badgeClasses,
                )}
              >
                <span>{tier}</span>
                <span>{tierCounts[tier]}</span>
              </span>
            ))}
          </div>
        </CardHeader>
      </Card>

      <HeatmapMatrixTable
        wardIds={data.ward_ids}
        horizons={data.horizons}
        cellMap={cellMap}
        wardPeakMap={wardPeakMap}
        horizonDates={horizonDates}
        onSelectWard={onSelectWard}
      />

      <HeatmapTileGrid
        wardIds={data.ward_ids}
        horizons={data.horizons}
        cellMap={cellMap}
        wardPeakMap={wardPeakMap}
        lang={lang}
        onSelectWard={onSelectWard}
      />
    </div>
  );
}
