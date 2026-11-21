"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { City, HeatmapCell, RiskTier, WeatherMode } from "@/lib/api/client";
import { RiskTierBadge, TIER_META, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import { useHeatmapQuery } from "../hooks";

export interface HeatmapViewProps {
  city: City;
  originWeek: string;
  source: WeatherMode;
  onSelectWard: (wardId: string) => void;
  onResetCity: () => void;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

type TileHorizonSelection = "peak" | 1 | 2 | 3 | 4;

export function HeatmapView({
  city,
  originWeek,
  source,
  onSelectWard,
  onResetCity,
}: HeatmapViewProps) {
  const [tileHorizon, setTileHorizon] = useState<TileHorizonSelection>("peak");

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

  return (
    <div data-testid="heatmap-panel" className="space-y-5">
      <StubDataBanner modelVersion={data.model_version} />

      {/* Summary Strip */}
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              City risk heatmap — {data.city}
            </CardTitle>
            <CardDescription className="font-mono text-xs tnum">
              Origin week {data.origin_week} · {data.ward_ids.length} wards · Model {data.model_version}
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

      {/* Ward x Horizon Matrix */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Ward × horizon risk matrix</CardTitle>
          <CardDescription>
            Wards ordered by peak risk. Select any ward row to inspect its full driver breakdown.
          </CardDescription>
        </CardHeader>

        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Ward by horizon risk matrix"
        >
          <table
            data-testid="heatmap-matrix"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                <th scope="col" className="px-4 py-3">Ward ID</th>
                {data.horizons.map((h) => (
                  <th key={h} scope="col" className="px-3 py-3 font-mono tnum">
                    +{h}w{" "}
                    <span className="font-normal text-slate">
                      ({horizonDates.get(h)?.slice(5) ?? ""})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {data.ward_ids.map((wid) => (
                <tr key={wid} className="bg-white hover:bg-paper/60">
                  <th
                    scope="row"
                    className="px-4 py-2.5 font-mono text-xs font-semibold text-navy tnum"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectWard(wid)}
                      className="cursor-pointer text-left text-navy underline-offset-2 hover:text-royal hover:underline"
                    >
                      {wid}
                    </button>
                  </th>
                  {data.horizons.map((h) => {
                    const cell = cellMap.get(`${wid}:${h}`);
                    if (!cell) {
                      return (
                        <td
                          key={h}
                          className="px-3 py-2.5 font-mono text-xs text-slate"
                        >
                          —
                        </td>
                      );
                    }
                    const meta = TIER_META[cell.tier];
                    return (
                      <td
                        key={h}
                        data-testid={`heatmap-cell-${wid}-${h}`}
                        className="px-3 py-2"
                      >
                        <div
                          className={clsx(
                            "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
                            meta.badgeClasses,
                          )}
                        >
                          <span className="inline-flex items-baseline gap-1 text-xs font-semibold">
                            <span>{meta.labelEn}</span>
                            <span lang="bn" className="font-bangla text-[11px]">
                              {meta.labelBn}
                            </span>
                          </span>
                          <span className="font-mono text-xs font-semibold tnum">
                            {cell.expected_cases.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Schematic Ward Tile Grid */}
      <Card data-testid="heatmap-tile-map">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Schematic ward tile grid</CardTitle>
            <CardDescription data-testid="heatmap-schematic-label">
              Non-geographic overview — schematic, ward geometry not in the dataset.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tile horizon filter">
            <button
              type="button"
              data-testid="heatmap-horizon-peak"
              aria-pressed={tileHorizon === "peak"}
              onClick={() => setTileHorizon("peak")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                tileHorizon === "peak"
                  ? "border-royal bg-royal text-white"
                  : "border-mist bg-white text-navy hover:bg-paper",
              )}
            >
              Peak
            </button>
            {data.horizons.map((h) => (
              <button
                key={h}
                type="button"
                data-testid={`heatmap-horizon-${h}`}
                aria-pressed={tileHorizon === h}
                onClick={() => setTileHorizon(h as TileHorizonSelection)}
                className={clsx(
                  "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                  tileHorizon === h
                    ? "border-royal bg-royal text-white"
                    : "border-mist bg-white text-navy hover:bg-paper",
                )}
              >
                +{h}w
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.ward_ids.map((wid) => {
              const cell =
                tileHorizon === "peak"
                  ? wardPeakMap.get(wid)
                  : cellMap.get(`${wid}:${tileHorizon}`);
              if (!cell) return null;

              return (
                <button
                  key={wid}
                  type="button"
                  data-testid={`heatmap-tile-${wid}`}
                  onClick={() => onSelectWard(wid)}
                  aria-label={`${wid}: ${cell.tier} risk, ${cell.expected_cases.toFixed(1)} expected cases. Open ward forecast.`}
                  className="flex cursor-pointer flex-col items-start justify-between gap-2.5 rounded-lg border border-mist bg-paper p-3 text-left hover:border-royal hover:bg-white"
                >
                  <span className="font-mono text-xs font-bold text-navy tnum">
                    {wid}
                  </span>
                  <RiskTierBadge tier={cell.tier} size="sm" />
                  <div className="flex w-full items-baseline justify-between font-mono text-xs text-slate tnum">
                    <span>{cell.expected_cases.toFixed(1)} cases</span>
                    <span>score {cell.risk_score}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
