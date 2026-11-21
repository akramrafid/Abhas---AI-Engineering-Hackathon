"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import type { ConfusionMatrix, CoverageRow } from "@/lib/api/client";

export interface CoverageAndConfusionProps {
  coverage: readonly CoverageRow[];
  confusion: ConfusionMatrix;
}

export function CoverageAndConfusion({
  coverage,
  confusion,
}: CoverageAndConfusionProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("holdout_2024_2025");

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const row of coverage) set.add(row.period);
    return Array.from(set);
  }, [coverage]);

  const effectivePeriod = useMemo(() => {
    if (selectedPeriod === "ALL") return "ALL";
    if (periods.includes(selectedPeriod)) return selectedPeriod;
    return periods[periods.length - 1] ?? "ALL";
  }, [periods, selectedPeriod]);

  const visibleCoverage = useMemo(() => {
    if (effectivePeriod === "ALL") return coverage;
    return coverage.filter((r) => r.period === effectivePeriod);
  }, [coverage, effectivePeriod]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr] lg:items-start">
      <Card data-testid="validation-coverage">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>80% prediction band coverage</CardTitle>
            {periods.length > 1 ? (
              <div className="flex items-center gap-1" role="group" aria-label="Coverage period">
                <button
                  type="button"
                  aria-pressed={effectivePeriod === "holdout_2024_2025"}
                  onClick={() => setSelectedPeriod("holdout_2024_2025")}
                  className={clsx(
                    "min-h-7 cursor-pointer rounded-sm border px-2 font-mono text-[11px]",
                    effectivePeriod === "holdout_2024_2025"
                      ? "border-royal bg-royal font-semibold text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  Hold-out
                </button>
                <button
                  type="button"
                  aria-pressed={effectivePeriod === "ALL"}
                  onClick={() => setSelectedPeriod("ALL")}
                  className={clsx(
                    "min-h-7 cursor-pointer rounded-sm border px-2 font-mono text-[11px]",
                    effectivePeriod === "ALL"
                      ? "border-royal bg-royal font-semibold text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  All ({coverage.length})
                </button>
              </div>
            ) : null}
          </div>
          <CardDescription>
            Share of actual weekly counts falling inside [P10, P90]. Calibration target window: 75%–90%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleCoverage.length === 0 ? (
            <p className="text-sm text-slate">No coverage rows available.</p>
          ) : (
            <div className="space-y-3">
              {visibleCoverage.map((row, idx) => {
                const pct = row.coverage_80 * 100;
                const inTarget = row.coverage_80 >= 0.75 && row.coverage_80 <= 0.9;
                return (
                  <div
                    key={`${row.period}-${row.horizon}-${idx}`}
                    className="rounded-md border border-mist bg-paper p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-navy tnum">
                        +{row.horizon}w · {row.period}
                      </span>
                      <span className="font-mono text-sm font-bold text-ink tnum">
                        {pct.toFixed(1)}%{" "}
                        <span className="text-xs font-medium text-slate">
                          ({inTarget ? "in target" : "outside 75–90%"})
                        </span>
                      </span>
                    </div>
                    <div
                      className="relative mt-2 h-2.5 w-full overflow-hidden rounded-sm border border-mist bg-white"
                      aria-hidden="true"
                    >
                      <div
                        className="absolute inset-y-0 border-x border-royal/40 bg-forecast-band"
                        style={{ left: "75%", width: "15%" }}
                      />
                      <div
                        className="relative h-full bg-royal"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="validation-confusion">
        <CardHeader>
          <CardTitle>Tier confusion matrix</CardTitle>
          <CardDescription>
            Rows = actual tier; columns = predicted tier on hold-out weeks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-mist bg-paper p-3">
              <p className="text-xs font-semibold text-slate">Within 1 tier</p>
              <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                {(confusion.within_one_tier * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-mist bg-paper p-3">
              <p className="text-xs font-semibold text-slate">Critical recall</p>
              <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                {(confusion.critical_recall * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-mist bg-paper p-3">
              <p className="text-xs font-semibold text-slate">Macro-F1</p>
              <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                {confusion.macro_f1.toFixed(2)}
              </p>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-md border border-mist"
            tabIndex={0}
            role="region"
            aria-label="Tier confusion matrix table"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-mist bg-paper text-slate">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Actual ↓ / Pred →
                  </th>
                  {confusion.labels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2 text-right font-semibold text-navy"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {confusion.labels.map((rowLabel, rowIdx) => (
                  <tr key={rowLabel}>
                    <th
                      scope="row"
                      className="bg-paper px-3 py-2 font-semibold text-navy"
                    >
                      {rowLabel}
                    </th>
                    {(confusion.matrix[rowIdx] ?? []).map((count, colIdx) => (
                      <td
                        key={`${rowLabel}-${colIdx}`}
                        className={clsx(
                          "px-3 py-2 text-right font-mono tnum",
                          rowIdx === colIdx
                            ? "bg-forecast-band font-bold text-navy"
                            : "bg-white text-ink",
                        )}
                      >
                        {count.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
