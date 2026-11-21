"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import type { HeatmapCell } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

type TileHorizonSelection = "peak" | 1 | 2 | 3 | 4;

export interface HeatmapTileGridProps {
  wardIds: readonly string[];
  horizons: readonly number[];
  cellMap: Map<string, HeatmapCell>;
  wardPeakMap: Map<string, HeatmapCell>;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
}

export function HeatmapTileGrid({
  wardIds,
  horizons,
  cellMap,
  wardPeakMap,
  lang,
  onSelectWard,
}: HeatmapTileGridProps) {
  const [tileHorizon, setTileHorizon] = useState<TileHorizonSelection>("peak");

  return (
    <Card data-testid="heatmap-tile-map">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Schematic ward tile grid</CardTitle>
          <CardDescription data-testid="heatmap-schematic-label">
            Non-geographic overview — schematic, ward geometry not in the dataset.
          </CardDescription>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Tile horizon filter"
        >
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
          {horizons.map((h) => (
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
          {wardIds.map((wid) => {
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
                className="flex cursor-pointer flex-col items-start justify-between gap-2.5 rounded-lg border border-mist bg-paper p-3 text-left hover:border-royal hover:bg-white"
              >
                <span className="font-mono text-xs font-bold text-navy tnum">
                  {wid}
                </span>
                <RiskTierBadge tier={cell.tier} size="sm" lang={lang} />
                <div className="flex w-full items-baseline justify-between font-mono text-xs text-slate tnum">
                  <span>{cell.expected_cases.toFixed(1)} cases</span>
                  <span>score {cell.risk_score}</span>
                </div>
                <span className="sr-only">Open ward forecast</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
