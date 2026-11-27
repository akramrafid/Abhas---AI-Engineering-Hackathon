"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "@/components/icons";
import { clsx } from "clsx";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { UI_COPY, type Lang } from "@/lib/i18n";
import {
  usePlanCompareQuery,
  usePlansListQuery,
  type PlanKind,
  type PlanSummary,
} from "./api";

export interface PlanCompareDrawerProps {
  open: boolean;
  onClose: () => void;
  lang: Lang;
}

function formatCreatedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 16);
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const hh = String(parsed.getUTCHours()).padStart(2, "0");
  const mi = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatPlanOption(p: PlanSummary, lang: Lang): string {
  const cmp = UI_COPY[lang].command.compare;
  const kindLabel = cmp.kinds[p.kind] ?? p.kind;
  const scopePart = p.scope ? (p.scope === "all" ? (lang === "bn" ? "সকল নগর" : "all") : p.scope) : "all";
  const stockPart =
    typeof p.headline?.stock_pct === "number" ? ` · ${cmp.stockLabel} ${p.headline.stock_pct}%` : "";
  return `[${kindLabel}] ${p.label} · ${scopePart}${stockPart} · ${formatCreatedAt(p.created_at)}`;
}

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
  const cmp = UI_COPY[lang].command.compare;
  const bn = lang === "bn";

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
      role="dialog"
      aria-modal="true"
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
              className={clsx("text-lg font-bold text-navy", bn && "font-bangla")}
            >
              {cmp.title}
            </h2>
            <p lang={lang} className={clsx("text-xs text-slate", bn && "font-bangla")}>
              {cmp.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void plansQuery.refetch();
              }}
              aria-label={cmp.refreshAria}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-mist bg-paper text-navy hover:border-royal"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={cmp.closeAria}
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
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={cmp.kindFilterAria}>
            {(["all", "allocation", "overflow", "simulation", "dispatch"] as const).map(
              (kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                  lang={lang}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
                    bn && "font-bangla",
                    kindFilter === kind
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  {cmp.kinds[kind]}
                </button>
              ),
            )}
          </div>

          {plansQuery.isError ? (
            <ErrorBanner
              title={cmp.loadErrorTitle}
              error={plansQuery.error}
              onRetry={() => {
                void plansQuery.refetch();
              }}
            />
          ) : null}

          {plansQuery.isPending ? <PanelSkeleton label={cmp.loadingLabel} /> : null}

          {!plansQuery.isPending && !plansQuery.isError && plans.length === 0 ? (
            <EmptyState
              testId="compare-empty-state"
              title={cmp.emptyTitle}
              description={cmp.emptyDescription}
            />
          ) : null}

          {!plansQuery.isPending && !plansQuery.isError && plans.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="compare-plan-a"
                    lang={lang}
                    className={clsx("text-xs font-semibold text-navy", bn && "font-bangla")}
                  >
                    {cmp.planALabel}
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
                        {formatPlanOption(p, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="compare-plan-b"
                    lang={lang}
                    className={clsx("text-xs font-semibold text-navy", bn && "font-bangla")}
                  >
                    {cmp.planBLabel}
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
                        {formatPlanOption(p, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {compareQuery.isError ? (
                <ErrorBanner
                  title={cmp.compareErrorTitle}
                  error={compareQuery.error}
                  onRetry={() => {
                    void compareQuery.refetch();
                  }}
                />
              ) : null}

              {compareQuery.isPending ? <PanelSkeleton label={cmp.comparingLabel} /> : null}

              {comparison ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-mist bg-paper p-3 text-xs">
                      <p className={clsx("font-semibold text-navy", bn && "font-bangla")}>
                        {cmp.planAPrefix} · {comparison.a.label}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate tnum">
                        {cmp.kinds[comparison.a.kind]} · {cmp.scopeLabel}:{" "}
                        {comparison.a.scope ?? "all"}
                        {typeof comparison.a.headline?.stock_pct === "number"
                          ? ` · ${cmp.stockLabel} ${comparison.a.headline.stock_pct}%`
                          : ""}{" "}
                        · {cmp.originLabel} {comparison.a.origin_week} ·{" "}
                        {formatCreatedAt(comparison.a.created_at)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate tnum">
                        {comparison.a.model_version} · {comparison.a.git_sha}
                      </p>
                    </div>
                    <div className="rounded-xl border border-royal bg-paper p-3 text-xs">
                      <p className={clsx("font-semibold text-navy", bn && "font-bangla")}>
                        {cmp.planBPrefix} · {comparison.b.label}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate tnum">
                        {cmp.kinds[comparison.b.kind]} · {cmp.scopeLabel}:{" "}
                        {comparison.b.scope ?? "all"}
                        {typeof comparison.b.headline?.stock_pct === "number"
                          ? ` · ${cmp.stockLabel} ${comparison.b.headline.stock_pct}%`
                          : ""}{" "}
                        · {cmp.originLabel} {comparison.b.origin_week} ·{" "}
                        {formatCreatedAt(comparison.b.created_at)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate tnum">
                        {comparison.b.model_version} · {comparison.b.git_sha}
                      </p>
                    </div>
                  </div>

                  <div
                    className="overflow-x-auto rounded-xl border border-mist"
                    tabIndex={0}
                    role="region"
                    aria-label={cmp.tableAria}
                  >
                    <table
                      data-testid="plan-compare-table"
                      className="w-full border-collapse text-left text-xs"
                    >
                      <thead>
                        <tr
                          lang={lang}
                          className={clsx(
                            "border-b border-mist bg-paper font-semibold text-slate",
                            bn && "font-bangla",
                          )}
                        >
                          <th scope="col" className="px-3 py-2.5">
                            {cmp.colMetric}
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            {cmp.colPlanA}
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            {cmp.colPlanB}
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            {cmp.colDelta}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mist bg-white">
                        {comparison.diffs.map((row) => (
                          <tr key={row.metric}>
                            <th
                              scope="row"
                              lang={lang}
                              className={clsx(
                                "px-3 py-2.5 font-semibold text-navy",
                                bn && "font-bangla",
                              )}
                            >
                              {cmp.metrics[row.metric] ?? row.metric}
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
