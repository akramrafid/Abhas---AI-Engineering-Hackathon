"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { TIER_META } from "@/components/brand/RiskTierBadge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import type { HeatmapCell, RiskTier } from "@/lib/api/client";

type MatrixSortKey = "peak" | "ward" | number;

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

export interface HeatmapMatrixTableProps {
  wardIds: readonly string[];
  horizons: readonly number[];
  cellMap: Map<string, HeatmapCell>;
  wardPeakMap: Map<string, HeatmapCell>;
  horizonDates: Map<number, string>;
  onSelectWard: (wardId: string) => void;
}

export function HeatmapMatrixTable({
  wardIds,
  horizons,
  cellMap,
  wardPeakMap,
  horizonDates,
  onSelectWard,
}: HeatmapMatrixTableProps) {
  const [sortBy, setSortBy] = useState<MatrixSortKey>("peak");

  const sortedWardIds = useMemo(() => {
    const list = [...wardIds];
    if (sortBy === "ward") {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (sortBy === "peak") {
      return list.sort((a, b) => {
        const pa = wardPeakMap.get(a);
        const pb = wardPeakMap.get(b);
        const tierDiff = (pb ? TIER_RANK[pb.tier] : -1) - (pa ? TIER_RANK[pa.tier] : -1);
        if (tierDiff !== 0) return tierDiff;
        const casesDiff = (pb?.expected_cases ?? 0) - (pa?.expected_cases ?? 0);
        if (casesDiff !== 0) return casesDiff;
        return a.localeCompare(b);
      });
    }
    return list.sort((a, b) => {
      const ca = cellMap.get(`${a}:${sortBy}`);
      const cb = cellMap.get(`${b}:${sortBy}`);
      const casesDiff = (cb?.expected_cases ?? 0) - (ca?.expected_cases ?? 0);
      if (casesDiff !== 0) return casesDiff;
      return a.localeCompare(b);
    });
  }, [wardIds, sortBy, wardPeakMap, cellMap]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Ward × horizon risk matrix</CardTitle>
          <CardDescription>
            Sortable ward grid in tier colours with EN/BN labels in every cell. Select any ward to open its driver breakdown.
          </CardDescription>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Sort heatmap rows"
        >
          <span className="text-xs font-semibold text-slate">Sort:</span>
          <button
            type="button"
            data-testid="heatmap-sort-peak"
            aria-pressed={sortBy === "peak"}
            onClick={() => setSortBy("peak")}
            className={clsx(
              "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
              sortBy === "peak"
                ? "border-royal bg-royal text-white"
                : "border-mist bg-white text-navy hover:bg-paper",
            )}
          >
            Peak risk
          </button>
          <button
            type="button"
            data-testid="heatmap-sort-ward"
            aria-pressed={sortBy === "ward"}
            onClick={() => setSortBy("ward")}
            className={clsx(
              "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
              sortBy === "ward"
                ? "border-royal bg-royal text-white"
                : "border-mist bg-white text-navy hover:bg-paper",
            )}
          >
            Ward A–Z
          </button>
          {horizons.map((h) => (
            <button
              key={h}
              type="button"
              data-testid={`heatmap-sort-${h}`}
              aria-pressed={sortBy === h}
              onClick={() => setSortBy(h)}
              className={clsx(
                "min-h-8 cursor-pointer rounded-md border px-2 font-mono text-xs font-semibold tnum",
                sortBy === h
                  ? "border-royal bg-royal text-white"
                  : "border-mist bg-white text-navy hover:bg-paper",
              )}
            >
              +{h}w
            </button>
          ))}
        </div>
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
              {horizons.map((h) => (
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
            {sortedWardIds.map((wid) => (
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
                {horizons.map((h) => {
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
  );
}
