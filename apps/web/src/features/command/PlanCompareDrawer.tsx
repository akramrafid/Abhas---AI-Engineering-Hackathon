"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "@/components/icons";
import { clsx } from "clsx";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import type { Lang } from "@/lib/i18n";
import {
  usePlanCompareQuery,
  usePlansListQuery,
  type PlanKind,
} from "./api";

export interface PlanCompareDrawerProps {
  open: boolean;
  onClose: () => void;
  lang: Lang;
}

const METRIC_LABELS: Record<string, string> = {
  stock_pct: "Available stock (%)",
  mean_fulfilment_pct: "Mean fulfilment (%)",
  critical_wards: "Critical deficit wards",
  deficit_wards: "Total deficit wards",
  crews: "Spraying crews",
  cases_prevented: "Cases prevented (h=2–4)",
  unroutable_patients: "Unroutable patients",
  notices: "Dispatch notices",
};

function formatMetricValue(metric: string, val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  if (metric.endsWith("_pct")) return `${val.toFixed(1)}%`;
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(2);
}

function formatDelta(metric: string, delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "—";
  const sign = delta > 0 ? "+" : "";
  if (metric.endsWith("_pct")) return `${sign}${delta.toFixed(1)} pp`;
  if (Number.isInteger(delta)) return `${sign}${delta}`;
  return `${sign}${delta.toFixed(2)}`;
}

export function PlanCompareDrawer({ open, onClose, lang }: PlanCompareDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [kindFilter, setKindFilter] = useState<PlanKind | "all">("all");
  const [selectedA, setSelectedA] = useState<string>("");
  const [selectedB, setSelectedB] = useState<string>("");

  const plansQuery = usePlansListQuery(
    kindFilter === "all" ? undefined : kindFilter,
    open,
  );
  const plans = useMemo(() => plansQuery.data?.plans ?? [], [plansQuery.data?.plans]);

  const effectiveA = useMemo(() => {
    if (selectedA && plans.some((p) => p.id === selectedA)) return selectedA;
    return plans[1]?.id ?? plans[0]?.id ?? "";
  }, [selectedA, plans]);

  const effectiveB = useMemo(() => {
    if (selectedB && plans.some((p) => p.id === selectedB)) return selectedB;
    return plans[0]?.id ?? "";
  }, [selectedB, plans]);

  const compareQuery = usePlanCompareQuery(
    effectiveA || null,
    effectiveB || null,
    open && Boolean(effectiveA && effectiveB),
  );

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  const comparison = compareQuery.data;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="plan-compare-drawer"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto ml-auto mr-0 h-full max-h-screen w-full max-w-2xl overflow-y-auto bg-white p-0 text-ink shadow-2xl shadow-ink/40 ring-1 ring-mist backdrop:bg-ink/50 sm:my-0"
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-mist bg-white px-5 py-4">
          <div>
            <h2
              id={titleId}
              lang={lang}
              className={clsx(
                "text-lg font-bold text-navy",
                lang === "bn" && "font-bangla",
              )}
            >
              {lang === "bn" ? "সংরক্ষিত পরিকল্পনা তুলনা" : "Compare saved plans"}
            </h2>
            <p className="text-xs text-slate">
              Append-only decision log · delta = Plan B − Plan A
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void plansQuery.refetch();
              }}
              aria-label="Refresh saved plans"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-mist bg-paper text-navy hover:border-royal"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Close plan comparison"
              data-testid="close-compare-drawer"
              onClick={() => dialogRef.current?.close()}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-mist bg-white text-navy hover:bg-paper"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 p-5">
          {/* Kind filter */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter plans by kind">
            {(["all", "allocation", "overflow", "simulation", "dispatch"] as const).map(
              (kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold capitalize",
                    kindFilter === kind
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  {kind}
                </button>
              ),
            )}
          </div>

          {plansQuery.isError ? (
            <ErrorBanner
              title="Could not load saved plans"
              error={plansQuery.error}
              onRetry={() => {
                void plansQuery.refetch();
              }}
            />
          ) : null}

          {plansQuery.isPending ? (
            <PanelSkeleton label="Loading saved operational plans…" />
          ) : null}

          {!plansQuery.isPending && !plansQuery.isError && plans.length === 0 ? (
            <EmptyState
              testId="compare-empty-state"
              title="No saved plans yet"
              description="Use “Save as plan” on any Command Center step to snapshot an allocation, overflow routing, simulation, or dispatch run into the append-only decision log."
            />
          ) : null}

          {!plansQuery.isPending && !plansQuery.isError && plans.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="compare-plan-a"
                    className="text-xs font-semibold text-navy"
                  >
                    Baseline plan A
                  </label>
                  <select
                    id="compare-plan-a"
                    data-testid="compare-select-a"
                    value={effectiveA}
                    onChange={(e) => setSelectedA(e.target.value)}
                    className="min-h-10 rounded-lg border border-mist bg-paper/50 px-3 py-2 text-xs font-medium text-navy focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.kind}] {p.label} ({p.origin_week})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="compare-plan-b"
                    className="text-xs font-semibold text-navy"
                  >
                    Candidate plan B
                  </label>
                  <select
                    id="compare-plan-b"
                    data-testid="compare-select-b"
                    value={effectiveB}
                    onChange={(e) => setSelectedB(e.target.value)}
                    className="min-h-10 rounded-lg border border-mist bg-paper/50 px-3 py-2 text-xs font-medium text-navy focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.kind}] {p.label} ({p.origin_week})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {compareQuery.isError ? (
                <ErrorBanner
                  title="Could not compare selected plans"
                  error={compareQuery.error}
                  onRetry={() => {
                    void compareQuery.refetch();
                  }}
                />
              ) : null}

              {compareQuery.isPending ? (
                <PanelSkeleton label="Comparing plan headlines…" />
              ) : null}

              {comparison ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-mist bg-paper p-3 text-xs">
                      <p className="font-semibold text-navy">Plan A · {comparison.a.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate tnum">
                        {comparison.a.kind} · origin {comparison.a.origin_week} ·{" "}
                        {comparison.a.model_version} · {comparison.a.git_sha}
                      </p>
                    </div>
                    <div className="rounded-xl border border-royal bg-paper p-3 text-xs">
                      <p className="font-semibold text-navy">Plan B · {comparison.b.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate tnum">
                        {comparison.b.kind} · origin {comparison.b.origin_week} ·{" "}
                        {comparison.b.model_version} · {comparison.b.git_sha}
                      </p>
                    </div>
                  </div>

                  <div
                    className="overflow-x-auto rounded-xl border border-mist"
                    tabIndex={0}
                    role="region"
                    aria-label="Saved plan metric comparison table"
                  >
                    <table
                      data-testid="plan-compare-table"
                      className="w-full border-collapse text-left text-xs"
                    >
                      <thead>
                        <tr className="border-b border-mist bg-paper font-semibold text-slate">
                          <th scope="col" className="px-3 py-2.5">
                            Metric
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Plan A
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Plan B
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Delta (B − A)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mist bg-white">
                        {comparison.diffs.map((row) => (
                          <tr key={row.metric}>
                            <th scope="row" className="px-3 py-2.5 font-semibold text-navy">
                              {METRIC_LABELS[row.metric] ?? row.metric}
                            </th>
                            <td className="px-3 py-2.5 text-right font-mono text-slate tnum">
                              {formatMetricValue(row.metric, row.a)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink tnum">
                              {formatMetricValue(row.metric, row.b)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-navy tnum">
                              {formatDelta(row.metric, row.delta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
