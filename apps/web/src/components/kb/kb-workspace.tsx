"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocDrawer, type DocViewerSelection } from "@/components/common/doc-drawer";
import { ErrorAlert } from "@/components/common/error-alert";
import { TrustBadge } from "@/components/common/status-badges";
import { listKbDocuments, reindexKb } from "@/lib/api/client";
import type { DocumentSummary, IndexResult } from "@/lib/api/types";
import { cn, formatLatency } from "@/lib/utils";
import {
  BookOpen,
  CheckCircle2,
  Database,
  Eye,
  RefreshCw,
} from "lucide-react";

export function KbWorkspace() {
  const queryClient = useQueryClient();
  const [docSelection, setDocSelection] = useState<DocViewerSelection | null>(
    null,
  );

  const docsQuery = useQuery({
    queryKey: ["kb", "documents"],
    queryFn: listKbDocuments,
  });

  const indexMutation = useMutation({
    mutationFn: reindexKb,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["kb", "documents"] });
      toast.success(
        `Indexed ${result.files} files (${result.upserted} upserted, ${result.unchanged} unchanged)`,
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Re-indexing failed. Please retry.",
      );
    },
  });

  const indexResult: IndexResult | undefined = indexMutation.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Knowledge Base
          </h1>
          <p className="text-sm text-ink-muted">
            Inspect indexed LumaNet documents, verify trust status, and run idempotent vector indexing.
          </p>
        </div>

        <button
          type="button"
          onClick={() => indexMutation.mutate()}
          data-testid="reindex-button"
          disabled={indexMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-4 w-4", indexMutation.isPending && "animate-spin")}
            aria-hidden="true"
          />
          <span>{indexMutation.isPending ? "Re-indexing…" : "Re-index"}</span>
        </button>
      </header>

      {/* Re-index result or error */}
      {indexMutation.isError ? (
        <ErrorAlert
          error={indexMutation.error}
          title="Knowledge base re-index failed"
          onRetry={() => indexMutation.mutate()}
        />
      ) : null}

      {indexResult ? (
        <section
          aria-label="Indexing summary"
          data-testid="index-result"
          className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Index run complete</span>
            </div>
            <span className="font-mono text-xs text-emerald-800 dark:text-emerald-300 tabular-nums">
              {formatLatency(indexResult.duration_ms)}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 dark:border-emerald-800/50 dark:bg-slate-900/50">
              <dt className="text-[11px] text-ink-muted">Files</dt>
              <dd className="font-mono text-base font-bold text-ink tabular-nums">
                {indexResult.files}
              </dd>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 dark:border-emerald-800/50 dark:bg-slate-900/50">
              <dt className="text-[11px] text-ink-muted">Total chunks</dt>
              <dd className="font-mono text-base font-bold text-ink tabular-nums">
                {indexResult.chunks}
              </dd>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 dark:border-emerald-800/50 dark:bg-slate-900/50">
              <dt className="text-[11px] text-ink-muted">Upserted</dt>
              <dd className="font-mono text-base font-bold text-ink tabular-nums">
                {indexResult.upserted}
              </dd>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 dark:border-emerald-800/50 dark:bg-slate-900/50">
              <dt className="text-[11px] text-ink-muted">Unchanged</dt>
              <dd className="font-mono text-base font-bold text-ink tabular-nums">
                {indexResult.unchanged}
              </dd>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 dark:border-emerald-800/50 dark:bg-slate-900/50">
              <dt className="text-[11px] text-ink-muted">Deleted stale</dt>
              <dd className="font-mono text-base font-bold text-ink tabular-nums">
                {indexResult.deleted}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* Documents grid */}
      <section aria-label="Knowledge base documents">
        {docsQuery.isPending ? (
          <div
            data-testid="kb-loading"
            aria-busy="true"
            aria-label="Loading knowledge base documents…"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl border border-border-subtle bg-surface"
              />
            ))}
          </div>
        ) : docsQuery.isError ? (
          <ErrorAlert
            error={docsQuery.error}
            title="Could not load knowledge base documents"
            onRetry={() => void docsQuery.refetch()}
          />
        ) : !docsQuery.data || docsQuery.data.length === 0 ? (
          <div
            data-testid="kb-empty"
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center"
          >
            <Database
              className="mb-3 h-8 w-8 text-ink-muted"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-ink">
              No knowledge base documents found
            </h2>
            <p className="mt-1 max-w-md text-sm text-ink-muted">
              Run Re-index to ingest LumaNet Fiber policy markdown files into Qdrant.
            </p>
            <button
              type="button"
              onClick={() => indexMutation.mutate()}
              disabled={indexMutation.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Re-index now</span>
            </button>
          </div>
        ) : (
          <div
            data-testid="kb-documents-list"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {docsQuery.data.map((doc: DocumentSummary) => (
              <article
                key={doc.doc_id}
                data-testid={`kb-doc-${doc.doc_id}`}
                className={cn(
                  "flex flex-col justify-between rounded-xl border bg-surface p-4 shadow-xs transition-colors",
                  doc.trusted
                    ? "border-border-subtle hover:border-border-strong"
                    : "border-red-300/80 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/15",
                )}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <BookOpen
                        className="h-4 w-4 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      <h2 className="truncate text-sm font-semibold text-ink">
                        {doc.title}
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <TrustBadge trusted={doc.trusted} />
                    <span className="rounded border border-border-subtle bg-subtle px-2 py-0.5 font-mono text-xs text-ink-secondary tabular-nums">
                      {doc.chunks} chunks
                    </span>
                  </div>

                  <p className="truncate font-mono text-xs text-ink-muted" translate="no">
                    {doc.path}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
                  <span
                    className="min-w-0 truncate font-mono text-[11px] text-ink-muted"
                    translate="no"
                  >
                    {doc.doc_id}
                  </span>
                  <button
                    type="button"
                    data-testid={`view-doc-${doc.doc_id}`}
                    onClick={() => setDocSelection({ docId: doc.doc_id })}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-subtle bg-subtle px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Inspect document</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <DocDrawer
        selection={docSelection}
        onClose={() => setDocSelection(null)}
      />
    </div>
  );
}
