"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CitationChip } from "@/components/common/citation-chip";
import { DocDrawer, type DocViewerSelection } from "@/components/common/doc-drawer";
import { ErrorAlert } from "@/components/common/error-alert";
import { MarkdownContent } from "@/components/common/markdown-content";
import {
  CategoryBadge,
  InjectionBadge,
  LanguageBadge,
  NeedsHumanBadge,
  SentimentBadge,
  UrgencyBadge,
} from "@/components/common/status-badges";
import { UsageBadge } from "@/components/common/usage-badge";
import sampleTicketsRaw from "@/data/sample_tickets.json";
import { getTriageHistory, triageTicket } from "@/lib/api/client";
import type { Citation, SampleTicket, TriageResult } from "@/lib/api/types";
import { cn, formatDateTime, splitWithHighlight } from "@/lib/utils";
import {
  BookOpen,
  Check,
  Copy,
  Eraser,
  History,
  Highlighter,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";

const SAMPLE_TICKETS = sampleTicketsRaw as SampleTicket[];
const CHANNELS = ["chat", "email", "app", "phone"] as const;
const MAX_TICKET_LENGTH = 8000;

export function TriageWorkspace() {
  const queryClient = useQueryClient();

  const [selectedSampleId, setSelectedSampleId] = useState("");
  const [channel, setChannel] = useState<string>("chat");
  const [ticketText, setTicketText] = useState("");
  const [analyzedTicketText, setAnalyzedTicketText] = useState("");
  const [copiedReply, setCopiedReply] = useState(false);
  const [docSelection, setDocSelection] = useState<DocViewerSelection | null>(
    null,
  );

  const activeSample = useMemo(
    () => SAMPLE_TICKETS.find((t) => t.id === selectedSampleId) ?? null,
    [selectedSampleId],
  );

  const ticketIdForSubmit =
    activeSample && activeSample.text === ticketText ? activeSample.id : null;

  const historyQuery = useQuery({
    queryKey: ["triage", "history"],
    queryFn: () => getTriageHistory(50),
  });

  const triageMutation = useMutation({
    mutationFn: async (payload: {
      text: string;
      channel: string;
      ticket_id: string | null;
    }) => triageTicket(payload),
    onSuccess: (_data, variables) => {
      setAnalyzedTicketText(variables.text);
      setCopiedReply(false);
      void queryClient.invalidateQueries({ queryKey: ["triage", "history"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Ticket triage failed. Please retry.",
      );
    },
  });

  const handleLoadSample = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    if (!sampleId) return;
    const found = SAMPLE_TICKETS.find((t) => t.id === sampleId);
    if (found) {
      setChannel(found.channel);
      setTicketText(found.text);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = ticketText.trim();
    if (!trimmed || triageMutation.isPending) return;
    triageMutation.mutate({
      text: trimmed,
      channel,
      ticket_id: ticketIdForSubmit,
    });
  };

  const handleClear = () => {
    setSelectedSampleId("");
    setChannel("chat");
    setTicketText("");
    setAnalyzedTicketText("");
    triageMutation.reset();
    setCopiedReply(false);
  };

  const handleCopyReply = async (replyText: string) => {
    try {
      await navigator.clipboard.writeText(replyText);
      setCopiedReply(true);
      toast.success("Suggested reply copied to clipboard");
      window.setTimeout(() => setCopiedReply(false), 2000);
    } catch {
      toast.error("Unable to copy to clipboard. Please select and copy manually.");
    }
  };

  const handleSelectCitation = useCallback((citation: Citation) => {
    setDocSelection({ docId: citation.doc_id, citation });
  }, []);

  const result: TriageResult | undefined = triageMutation.data;

  const highlightedSegments = useMemo(
    () =>
      splitWithHighlight(
        analyzedTicketText,
        result?.urgency_evidence ?? undefined,
      ),
    [analyzedTicketText, result?.urgency_evidence],
  );

  const activeCitationKey = docSelection?.citation
    ? `${docSelection.citation.doc_id}:${docSelection.citation.id}:${docSelection.citation.snippet}`
    : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="border-b border-border-subtle pb-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Ticket Triage
        </h1>
        <p className="text-sm text-ink-muted">
          Classify urgency, detect prompt injections, highlight urgency drivers, and draft grounded replies in the customer&apos;s language.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Intake form */}
        <section
          aria-label="Ticket intake form"
          className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs sm:p-5 lg:col-span-5"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label
                  htmlFor="sample-ticket-select"
                  className="mb-1.5 block text-xs font-semibold text-ink-secondary"
                >
                  Load sample ticket
                </label>
                <select
                  id="sample-ticket-select"
                  name="sampleTicket"
                  data-testid="sample-select"
                  value={selectedSampleId}
                  onChange={(e) => handleLoadSample(e.target.value)}
                  className="block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="">Custom ticket…</option>
                  {SAMPLE_TICKETS.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.id} · {sample.channel} · {sample.label_language} —{" "}
                      {sample.text.slice(0, 42)}…
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ticket-channel"
                  className="mb-1.5 block text-xs font-semibold text-ink-secondary"
                >
                  Channel
                </label>
                <select
                  id="ticket-channel"
                  name="channel"
                  data-testid="channel-select"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="ticket-text"
                  className="text-xs font-semibold text-ink-secondary"
                >
                  Customer ticket text
                </label>
                <span className="font-mono text-[11px] text-ink-muted tabular-nums">
                  {ticketText.length} / {MAX_TICKET_LENGTH}
                </span>
              </div>
              <textarea
                id="ticket-text"
                name="ticketText"
                data-testid="ticket-input"
                rows={7}
                maxLength={MAX_TICKET_LENGTH}
                value={ticketText}
                onChange={(e) => setTicketText(e.target.value)}
                autoComplete="off"
                placeholder="Paste a customer message in English, Bangla, or Banglish…"
                className="block w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleClear}
                data-testid="clear-triage-button"
                disabled={triageMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-subtle px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-border-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>

              <button
                type="submit"
                data-testid="triage-submit"
                disabled={!ticketText.trim() || triageMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>
                  {triageMutation.isPending ? "Triaging…" : "Triage ticket"}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Triage result panel */}
        <section
          aria-label="Triage analysis result"
          className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs sm:p-5 lg:col-span-7"
        >
          {triageMutation.isPending ? (
            <div
              data-testid="triage-loading"
              aria-busy="true"
              aria-label="Analyzing ticket…"
              className="space-y-4 py-2"
            >
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-24 animate-pulse rounded-md bg-subtle" />
                <div className="h-6 w-20 animate-pulse rounded-md bg-subtle" />
                <div className="h-6 w-24 animate-pulse rounded-md bg-subtle" />
                <div className="h-6 w-28 animate-pulse rounded-md bg-subtle" />
              </div>
              <div className="h-5 w-4/5 animate-pulse rounded bg-subtle" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-subtle" />
              <div className="h-28 w-full animate-pulse rounded-lg bg-subtle" />
            </div>
          ) : triageMutation.isError ? (
            <ErrorAlert
              error={triageMutation.error}
              title="Ticket triage failed"
              onRetry={() => {
                const trimmed = ticketText.trim();
                if (!trimmed) return;
                triageMutation.mutate({
                  text: trimmed,
                  channel,
                  ticket_id: ticketIdForSubmit,
                });
              }}
            />
          ) : !result ? (
            <div
              data-testid="triage-empty"
              className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-subtle/40 p-6 text-center"
            >
              <ShieldAlert
                className="mb-3 h-8 w-8 text-ink-muted"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-ink">
                No ticket analyzed yet
              </h2>
              <p className="mt-1 max-w-sm text-xs text-ink-muted">
                Choose a sample ticket (such as T-003 for Bangla or T-008 for prompt injection) or paste any customer message to inspect structured triage output.
              </p>
            </div>
          ) : (
            <div data-testid="triage-result" className="space-y-5">
              {/* Top ID + timestamp + status badges */}
              <div className="space-y-3 border-b border-border-subtle pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span translate="no" data-testid="triage-id">
                      #{result.id.slice(0, 12)}
                    </span>
                    {result.ticket_id ? (
                      <span
                        translate="no"
                        data-testid="triage-ticket-id"
                        className="rounded bg-subtle px-1.5 py-0.5 font-semibold text-ink-secondary"
                      >
                        {result.ticket_id}
                      </span>
                    ) : null}
                  </div>
                  <time dateTime={result.created_at} className="tabular-nums">
                    {formatDateTime(result.created_at)}
                  </time>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={result.category} />
                  <UrgencyBadge urgency={result.urgency} />
                  <SentimentBadge sentiment={result.sentiment} />
                  <LanguageBadge language={result.language} />
                  <NeedsHumanBadge needsHuman={result.needs_human} />
                  <InjectionBadge detected={result.injection_detected} />
                </div>

                {result.injection_detected ? (
                  <div
                    role="alert"
                    data-testid="injection-warning-banner"
                    className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-100"
                  >
                    <ShieldAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-semibold">
                        Prompt injection attempt flagged
                      </p>
                      <p className="mt-0.5 text-red-800 dark:text-red-200">
                        Instructions inside this ticket were ignored and the ticket has been routed for human review.
                      </p>
                    </div>
                  </div>
                ) : null}

                <p
                  data-testid="triage-summary"
                  className="text-sm font-medium text-ink"
                >
                  {result.summary}
                </p>
              </div>

              {/* Reasons */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-ink-secondary">
                  Decision reasons
                </h3>
                {result.reasons && result.reasons.length > 0 ? (
                  <ul
                    data-testid="triage-reasons"
                    className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary"
                  >
                    {result.reasons.map((reason, idx) => (
                      <li key={`${idx}-${reason}`}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-muted">
                    No special escalation or guardrail triggers recorded.
                  </p>
                )}
              </div>

              {/* Original ticket with urgency_evidence highlighted */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
                    <Highlighter className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>Original ticket &amp; urgency evidence</span>
                  </h3>
                  {result.urgency_evidence ? (
                    <span className="text-[11px] text-ink-muted">
                      Highlighted sentence drove urgency
                    </span>
                  ) : null}
                </div>
                <div
                  data-testid="ticket-evidence-box"
                  className="rounded-lg border border-border-subtle bg-subtle/60 p-3 text-sm leading-relaxed text-ink-secondary"
                >
                  {highlightedSegments.map((seg, idx) =>
                    seg.highlighted ? (
                      <mark
                        key={idx}
                        data-testid="urgency-evidence-highlight"
                        className="lumadesk-highlight"
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={idx}>{seg.text}</span>
                    ),
                  )}
                </div>
                {result.urgency_evidence ? (
                  <p
                    data-testid="urgency-evidence-text"
                    className="text-xs text-ink-muted"
                  >
                    Urgency evidence:{" "}
                    <span className="font-medium text-ink-secondary">
                      &ldquo;{result.urgency_evidence}&rdquo;
                    </span>
                  </p>
                ) : null}
              </div>

              {/* Suggested reply with Copy + Citation chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink-secondary">
                    Suggested reply
                  </h3>
                  <button
                    type="button"
                    data-testid="copy-reply-button"
                    onClick={() => void handleCopyReply(result.suggested_reply)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {copiedReply ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy reply</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  data-testid="suggested-reply"
                  className="rounded-xl border border-accent-border/70 bg-accent-soft/30 p-3.5 text-sm text-ink"
                >
                  <MarkdownContent
                    content={result.suggested_reply}
                    citations={result.citations}
                    activeCitationKey={activeCitationKey}
                    onSelectCitation={handleSelectCitation}
                  />
                </div>

                {result.citations.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Citations:</span>
                    </span>
                    {result.citations.map((citation) => {
                      const key = `${citation.doc_id}:${citation.id}:${citation.snippet}`;
                      return (
                        <CitationChip
                          key={key}
                          citation={citation}
                          showTitle
                          active={activeCitationKey === key}
                          onSelect={handleSelectCitation}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Usage badge */}
              <UsageBadge usage={result.usage} />
            </div>
          )}
        </section>
      </div>

      {/* Triage History */}
      <section
        aria-label="Recent triage history"
        className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">
              Triage history
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void historyQuery.refetch()}
            disabled={historyQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                historyQuery.isFetching && "animate-spin",
              )}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>

        {historyQuery.isPending ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="Loading history…">
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
          </div>
        ) : historyQuery.isError ? (
          <ErrorAlert
            error={historyQuery.error}
            title="Could not load triage history"
            onRetry={() => void historyQuery.refetch()}
          />
        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
          <div
            data-testid="history-empty"
            className="rounded-lg border border-dashed border-border-strong bg-subtle/40 px-4 py-8 text-center text-sm text-ink-muted"
          >
            No triaged tickets stored yet. Submit a ticket above to populate history.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="triage-history-list">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs font-semibold text-ink-muted">
                  <th className="py-2.5 pr-3">Ticket</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Urgency</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3">Flags</th>
                  <th className="py-2.5 px-3">Summary</th>
                  <th className="py-2.5 pl-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {historyQuery.data.map((item) => (
                  <tr key={item.id} className="hover:bg-subtle/40">
                    <td className="py-2.5 pr-3 font-mono text-xs text-ink-secondary">
                      <span translate="no">
                        {item.ticket_id ?? item.id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <CategoryBadge category={item.category} />
                    </td>
                    <td className="py-2.5 px-3">
                      <UrgencyBadge urgency={item.urgency} />
                    </td>
                    <td className="py-2.5 px-3">
                      <LanguageBadge language={item.language} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <NeedsHumanBadge needsHuman={item.needs_human} />
                        {item.injection_detected ? (
                          <InjectionBadge detected compact />
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-xs truncate py-2.5 px-3 text-xs text-ink-secondary">
                      {item.summary}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-3 text-right font-mono text-xs text-ink-muted tabular-nums">
                      {formatDateTime(item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
