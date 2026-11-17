"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKbDocument } from "@/lib/api/client";
import type { Citation } from "@/lib/api/types";
import { cn, formatPercent } from "@/lib/utils";
import { FileText, Highlighter, X } from "lucide-react";
import { ErrorAlert } from "./error-alert";
import { MarkdownContent } from "./markdown-content";
import { TrustBadge } from "./status-badges";

export interface DocViewerSelection {
  docId: string;
  citation?: Citation;
}

export interface DocDrawerProps {
  selection: DocViewerSelection | null;
  onClose: () => void;
  inlineOnDesktop?: boolean;
}

export function DocDrawer({
  selection,
  onClose,
  inlineOnDesktop = false,
}: DocDrawerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const docId = selection?.docId ?? null;

  const {
    data: doc,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["kb", "document", docId],
    queryFn: () => getKbDocument(docId!),
    enabled: Boolean(docId),
  });

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, onClose]);

  useEffect(() => {
    if (!doc || !selection?.citation?.snippet) return;
    const timer = window.setTimeout(() => {
      const target = scrollRef.current?.querySelector(
        '[data-testid="highlighted-snippet"]',
      );
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [doc, selection?.citation?.snippet]);

  if (!selection) return null;

  const panelBody = (
    <aside
      data-testid="doc-panel"
      aria-label="Knowledge base document viewer"
      className={cn(
        "flex h-full flex-col bg-surface text-ink",
        inlineOnDesktop
          ? "w-full max-w-xl border-l border-border-subtle shadow-2xl lg:max-w-none lg:rounded-xl lg:border lg:shadow-sm"
          : "w-full max-w-xl border-l border-border-subtle shadow-2xl",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <FileText
              className="h-4 w-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-semibold text-ink">
              {doc?.title ?? selection.citation?.title ?? selection.docId}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="font-mono" translate="no">
              {doc?.path ?? `kb/${selection.docId}.md`}
            </span>
            {doc ? <TrustBadge trusted={doc.trusted} /> : null}
            {doc ? (
              <span className="font-mono tabular-nums">
                {doc.chunks} chunks
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="close-doc-panel"
          aria-label="Close document viewer"
          className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {selection.citation ? (
        <div className="border-b border-border-subtle bg-amber-50/70 px-4 py-3 dark:bg-amber-950/25">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
            <span className="inline-flex items-center gap-1.5">
              <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Cited excerpt [{selection.citation.id}]
                {selection.citation.section
                  ? ` · ${selection.citation.section}`
                  : ""}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              Relevance {formatPercent(selection.citation.score)}
            </span>
          </div>
          <p className="mt-1.5 rounded border border-amber-200/80 bg-white/80 px-2.5 py-1.5 text-xs text-ink-secondary dark:border-amber-800/40 dark:bg-slate-900/60">
            {selection.citation.snippet}
          </p>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      >
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading document…">
            <div className="h-6 w-2/3 animate-pulse rounded bg-subtle" />
            <div className="h-4 w-full animate-pulse rounded bg-subtle" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-subtle" />
            <div className="h-24 w-full animate-pulse rounded bg-subtle" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-subtle" />
          </div>
        ) : isError ? (
          <ErrorAlert
            error={error}
            title="Could not load document"
            onRetry={() => void refetch()}
          />
        ) : doc ? (
          <MarkdownContent
            content={doc.content}
            highlightSnippet={selection.citation?.snippet}
          />
        ) : null}
      </div>
    </aside>
  );

  return (
    <div
      className={cn(
        inlineOnDesktop
          ? "fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px] lg:static lg:inset-auto lg:z-auto lg:block lg:h-full lg:min-h-0 lg:bg-transparent lg:backdrop-blur-none"
          : "fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]",
      )}
      role={inlineOnDesktop ? undefined : "dialog"}
      aria-modal={inlineOnDesktop ? undefined : true}
      aria-label={inlineOnDesktop ? undefined : "Document viewer"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panelBody}
    </div>
  );
}
