"use client";

import { Fragment, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorAlert } from "@/components/common/error-alert";
import {
  InjectionBadge,
  NeedsHumanBadge,
  UrgencyBadge,
} from "@/components/common/status-badges";
import { UsageBadge } from "@/components/common/usage-badge";
import { runBatchTriage } from "@/lib/api/client";
import type { BatchTriageItem, BatchTriageResult } from "@/lib/api/types";
import {
  cn,
  formatCategory,
  formatCostUsd,
  formatLatency,
  formatPercent,
  formatUrgency,
} from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Play,
  Timer,
  XCircle,
} from "lucide-react";

function PassFailMark({
  passed,
  predicted,
  expected,
}: {
  passed: boolean;
  predicted: string;
  expected: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {passed ? (
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-label="Pass"
        />
      ) : (
        <XCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
          aria-label="Fail"
        />
      )}
      <div className="min-w-0 text-xs">
        <div
          className={cn(
            "font-medium",
            passed ? "text-ink" : "text-red-700 dark:text-red-300",
          )}
        >
          {predicted}
        </div>
        {!passed ? (
          <div className="text-ink-muted">Label: {expected}</div>
        ) : null}
      </div>
    </div>
  );
}

export function BatchWorkspace() {
  const queryClient = useQueryClient();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const batchMutation = useMutation({
    mutationFn: runBatchTriage,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["triage", "history"] });
      toast.success(
        `Batch complete: ${formatPercent(data.category_accuracy)} category accuracy`,
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Batch triage failed. Please retry.",
      );
    },
  });

  useEffect(() => {
    if (!batchMutation.isPending) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [batchMutation.isPending]);

  const handleRun = () => {
    setElapsedSeconds(0);
    setExpandedTicketId(null);
    batchMutation.mutate();
  };

  const data: BatchTriageResult | undefined = batchMutation.data;

  const categoryMatches = data
    ? data.items.filter((item) => item.category_correct).length
    : 0;
  const urgencyMatches = data
    ? data.items.filter((item) => item.urgency_correct).length
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Batch Triage Evaluation
          </h1>
          <p className="text-sm text-ink-muted">
            Run triage across all 16 labelled sample tickets and compare predictions against ground truth.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRun}
          data-testid="run-batch-button"
          disabled={batchMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          <span>
            {batchMutation.isPending
              ? "Running batch…"
              : "Run all 16 sample tickets"}
          </span>
        </button>
      </header>

      {batchMutation.isPending ? (
        <section
          data-testid="batch-loading"
          aria-busy="true"
          aria-label="Running batch triage…"
          className="space-y-4 rounded-xl border border-accent-border bg-surface p-5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Timer className="h-5 w-5 animate-pulse text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Triaging 16 sample tickets…
                </p>
                <p className="text-xs text-ink-muted">
                  Evaluating categories, urgency, guardrails, and replies. Live LLM batches typically take 30–60 seconds.
                </p>
              </div>
            </div>
            <span className="rounded-lg border border-border-subtle bg-subtle px-3 py-1 font-mono text-xs font-semibold text-ink-secondary tabular-nums">
              {elapsedSeconds}s elapsed
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
          </div>

          <div className="space-y-2 pt-2">
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
          </div>
        </section>
      ) : batchMutation.isError ? (
        <ErrorAlert
          error={batchMutation.error}
          title="Batch triage failed"
          onRetry={handleRun}
        />
      ) : !data ? (
        <section
          data-testid="batch-empty"
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-subtle text-accent">
            <Layers className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            Ready to evaluate sample tickets
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-ink-muted">
            Click &ldquo;Run all 16 sample tickets&rdquo; to evaluate English, Bangla, Banglish, and prompt-injection tickets against ground-truth labels.
          </p>
        </section>
      ) : (
        <div data-testid="batch-results" className="space-y-5">
          {/* Totals summary strip */}
          <section
            aria-label="Batch accuracy totals"
            data-testid="batch-totals"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
              <div className="text-xs font-medium text-ink-muted">
                Category accuracy
              </div>
              <div
                data-testid="batch-category-accuracy"
                className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums"
              >
                {formatPercent(data.category_accuracy)}
              </div>
              <div className="mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
                {categoryMatches} / {data.total} matched
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
              <div className="text-xs font-medium text-ink-muted">
                Urgency accuracy
              </div>
              <div
                data-testid="batch-urgency-accuracy"
                className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums"
              >
                {formatPercent(data.urgency_accuracy)}
              </div>
              <div className="mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
                {urgencyMatches} / {data.total} matched
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
              <div className="text-xs font-medium text-ink-muted">
                Total cost
              </div>
              <div
                data-testid="batch-total-cost"
                className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums"
              >
                {formatCostUsd(data.usage.cost_usd)}
              </div>
              <div className="mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
                {data.usage.llm_calls} LLM calls ·{" "}
                <span translate="no">{data.usage.model}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
              <div className="text-xs font-medium text-ink-muted">
                Total latency
              </div>
              <div
                data-testid="batch-total-latency"
                className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums"
              >
                {formatLatency(data.usage.latency_ms)}
              </div>
              <div className="mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
                {data.total} tickets evaluated
              </div>
            </div>
          </section>

          <UsageBadge usage={data.usage} />

          {/* Comparison table */}
          {data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-ink-muted">
              Batch endpoint returned 0 items. Ensure the triage service and sample dataset are active, then retry.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-xs">
              <div className="overflow-x-auto">
                <table
                  data-testid="batch-table"
                  className="w-full min-w-[780px] border-collapse text-left text-sm"
                >
                  <thead>
                    <tr className="border-b border-border-subtle bg-subtle/60 text-xs font-semibold text-ink-muted">
                      <th className="py-3 pl-4 pr-3">Ticket ID</th>
                      <th className="px-3 py-3">Category (Pred vs Label)</th>
                      <th className="px-3 py-3">Urgency (Pred vs Label)</th>
                      <th className="px-3 py-3">Needs human</th>
                      <th className="px-3 py-3">Injection</th>
                      <th className="py-3 pl-3 pr-4">Ticket preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.items.map((item: BatchTriageItem) => {
                      const isExpanded = expandedTicketId === item.ticket_id;
                      const pred = item.result;

                      return (
                        <Fragment key={item.ticket_id}>
                          <tr
                            className={cn(
                              "transition-colors hover:bg-subtle/40",
                              pred?.injection_detected &&
                                "bg-red-50/40 dark:bg-red-950/15",
                            )}
                          >
                            <td className="whitespace-nowrap py-3 pl-4 pr-3 font-mono text-xs font-semibold text-ink">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTicketId(
                                    isExpanded ? null : item.ticket_id,
                                  )
                                }
                                aria-expanded={isExpanded}
                                className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                                )}
                                <span translate="no">{item.ticket_id}</span>
                              </button>
                            </td>

                            <td className="px-3 py-3">
                              {pred ? (
                                <PassFailMark
                                  passed={item.category_correct}
                                  predicted={formatCategory(pred.category)}
                                  expected={formatCategory(item.label_category)}
                                />
                              ) : (
                                <span className="text-xs text-red-600">
                                  Error
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-3">
                              {pred ? (
                                <PassFailMark
                                  passed={item.urgency_correct}
                                  predicted={formatUrgency(pred.urgency)}
                                  expected={formatUrgency(item.label_urgency)}
                                />
                              ) : (
                                <span className="text-xs text-red-600">
                                  Error
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-3">
                              {pred ? (
                                <NeedsHumanBadge needsHuman={pred.needs_human} />
                              ) : (
                                <span className="text-xs text-ink-muted">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3">
                              {pred ? (
                                <InjectionBadge
                                  detected={pred.injection_detected}
                                  compact
                                />
                              ) : (
                                <span className="text-xs text-ink-muted">—</span>
                              )}
                            </td>

                            <td className="max-w-xs truncate py-3 pl-3 pr-4 text-xs text-ink-secondary">
                              {item.error ? (
                                <span className="font-medium text-red-600 dark:text-red-400">
                                  {item.error}
                                </span>
                              ) : (
                                item.text
                              )}
                            </td>
                          </tr>

                          {isExpanded ? (
                            <tr className="bg-subtle/50">
                              <td colSpan={6} className="px-6 py-4 text-xs">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <p className="font-semibold text-ink">
                                      Original ticket
                                    </p>
                                    <p className="rounded-lg border border-border-subtle bg-surface p-3 leading-relaxed text-ink-secondary">
                                      {item.text}
                                    </p>
                                  </div>
                                  {pred ? (
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-ink">
                                          Summary:
                                        </span>
                                        <span className="text-ink-secondary">
                                          {pred.summary}
                                        </span>
                                        <UrgencyBadge urgency={pred.urgency} />
                                      </div>
                                      <p className="font-semibold text-ink">
                                        Suggested reply
                                      </p>
                                      <p className="rounded-lg border border-border-subtle bg-surface p-3 leading-relaxed text-ink-secondary">
                                        {pred.suggested_reply}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="text-red-600 dark:text-red-400">
                                      {item.error ?? "No result produced."}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
