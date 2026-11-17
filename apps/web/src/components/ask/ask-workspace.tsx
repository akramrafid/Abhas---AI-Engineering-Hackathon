"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { DocDrawer, type DocViewerSelection } from "@/components/common/doc-drawer";
import { ErrorAlert } from "@/components/common/error-alert";
import { CitationChip } from "@/components/common/citation-chip";
import { MarkdownContent } from "@/components/common/markdown-content";
import { LanguageBadge } from "@/components/common/status-badges";
import { UsageBadge } from "@/components/common/usage-badge";
import { ApiError, isAbortError } from "@/lib/api/errors";
import { streamAsk } from "@/lib/api/sse";
import type { ChatTurn, Citation, Usage } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  HelpCircle,
  RotateCcw,
  Send,
  Sparkles,
  Square,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  questionForRetry?: string;
  language?: string;
  answered?: boolean;
  citations?: Citation[];
  usage?: Usage;
  requestId?: string;
  isStreaming?: boolean;
  stopped?: boolean;
  error?: ApiError;
}

const EXAMPLE_QUESTIONS = [
  {
    id: "outage-30h",
    label: "30-hour outage credit",
    question:
      "How much credit do I get if my internet is down for 30 hours?",
  },
  {
    id: "stock-price",
    label: "Stock price (out-of-scope)",
    question: "What is LumaNet's stock price?",
  },
  {
    id: "bangla-credit",
    label: "বাংলা · ৩০ ঘণ্টা ক্রেডিট",
    question: "ইন্টারনেট ৩০ ঘণ্টা বন্ধ থাকলে কত দিনের ক্রেডিট পাব?",
  },
] as const;

const MAX_QUESTION_LENGTH = 2000;

export function AskWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [docSelection, setDocSelection] = useState<DocViewerSelection | null>(
    null,
  );

  const abortRef = useRef<AbortController | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const seqRef = useRef(0);
  const submitQuestionRef = useRef<
    ((
      rawQuestion: string,
      options?: { retryAssistantId?: string; baseMessages?: ChatMessage[] },
    ) => Promise<void>) | null
  >(null);

  const nextId = (prefix: string) => {
    seqRef.current += 1;
    return `${prefix}-${seqRef.current}`;
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = transcriptContainerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 96;
  }, []);

  useEffect(() => {
    if (messages.length === 0 || !shouldAutoScrollRef.current) return;
    const container = transcriptContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSelectCitation = useCallback((citation: Citation) => {
    setDocSelection({ docId: citation.doc_id, citation });
  }, []);

  const activeCitationKey = docSelection?.citation
    ? `${docSelection.citation.doc_id}:${docSelection.citation.id}:${docSelection.citation.snippet}`
    : undefined;

  const submitQuestion = useCallback(
    async (
      rawQuestion: string,
      options?: { retryAssistantId?: string; baseMessages?: ChatMessage[] },
    ) => {
      const question = rawQuestion.trim();
      if (!question || isStreaming) return;

      const snapshot = options?.baseMessages ?? messages;
      const history: ChatTurn[] = snapshot
        .filter((m) => !m.error && !m.isStreaming && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 4000),
        }));

      const assistantId = options?.retryAssistantId ?? nextId("assistant");
      const userId = nextId("user");

      shouldAutoScrollRef.current = true;

      if (options?.retryAssistantId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "",
                  citations: [],
                  answered: undefined,
                  usage: undefined,
                  language: undefined,
                  stopped: false,
                  error: undefined,
                  isStreaming: true,
                }
              : m,
          ),
        );
      } else {
        setInput("");
        setMessages((prev) => [
          ...prev,
          { id: userId, role: "user", content: question },
          {
            id: assistantId,
            role: "assistant",
            content: "",
            questionForRetry: question,
            citations: [],
            isStreaming: true,
          },
        ]);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        await streamAsk(
          { question, history },
          {
            onMeta: (meta) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        requestId: meta.request_id,
                        language: meta.language,
                      }
                    : m,
                ),
              );
            },
            onToken: (text) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + text }
                    : m,
                ),
              );
            },
            onDone: (done) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: done.answer,
                        answered: done.answered,
                        language: done.language,
                        citations: done.answered ? done.citations : [],
                        usage: done.usage,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
            },
          },
          { signal: controller.signal },
        );

        // Safety net if stream closed before a `done` event
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.isStreaming
              ? { ...m, isStreaming: false }
              : m,
          ),
        );
      } catch (err) {
        if (isAbortError(err)) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, stopped: true }
                : m,
            ),
          );
          return;
        }

        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError({
                status: 0,
                code: "ask_failed",
                message:
                  err instanceof Error
                    ? err.message
                    : "Unable to complete your request. Please retry.",
              });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: apiError }
              : m,
          ),
        );

        toast.error(apiError.message, {
          action: {
            label: "Retry",
            onClick: () => {
              void submitQuestionRef.current?.(question, {
                retryAssistantId: assistantId,
                baseMessages: snapshot,
              });
            },
          },
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [isStreaming, messages],
  );

  useEffect(() => {
    submitQuestionRef.current = submitQuestion;
  }, [submitQuestion]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setDocSelection(null);
    setInput("");
  }, []);

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (input.trim() && !isStreaming) {
        void submitQuestion(input);
      }
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6.5rem)] max-w-7xl flex-col gap-4 md:h-[calc(100dvh-3rem)] md:min-h-0">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Ask Knowledge Base
          </h1>
          <p className="text-sm text-ink-muted">
            Grounded answers in English, Bangla, and Banglish with verified policy citations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={handleNewChat}
              data-testid="new-chat-button"
              disabled={isStreaming}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New conversation</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Main split workspace: Chat + Citation Doc Panel */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          docSelection ? "lg:grid-cols-[minmax(0,1fr)_440px]" : "grid-cols-1",
        )}
      >
        <section
          aria-label="Ask conversation"
          className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-surface shadow-xs"
        >
          {/* Transcript */}
          <div
            ref={transcriptContainerRef}
            onScroll={handleScroll}
            className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6"
          >
            {messages.length === 0 ? (
              <div
                data-testid="ask-empty-state"
                className="mx-auto my-auto flex max-w-2xl flex-col items-center py-4 text-center sm:py-8"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent">
                  <Sparkles className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold text-ink">
                  Search LumaNet Fiber policies
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-ink-muted">
                  Ask any customer policy question. Untrusted forum posts are excluded, and uncovered questions clearly report missing coverage.
                </p>

                <div className="mt-6 grid w-full gap-2.5 sm:grid-cols-3">
                  {EXAMPLE_QUESTIONS.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      data-testid={`example-${ex.id}`}
                      onClick={() => void submitQuestion(ex.question)}
                      className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-subtle/60 p-3.5 text-left transition-colors hover:border-accent-border hover:bg-accent-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="text-xs font-semibold text-accent">
                        {ex.label}
                      </span>
                      <span className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-secondary group-hover:text-ink">
                        {ex.question}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm leading-relaxed text-white shadow-xs sm:max-w-[75%]">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                const isRefusal = msg.answered === false;
                const confirmedCitations =
                  !msg.isStreaming && msg.answered === true
                    ? (msg.citations ?? [])
                    : [];
                const isUnverifiedAnswer =
                  !msg.isStreaming &&
                  msg.answered === true &&
                  confirmedCitations.length === 0;
                return (
                  <article
                    key={msg.id}
                    data-testid="answer"
                    aria-live={msg.isStreaming ? "polite" : "off"}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors sm:p-5",
                      isRefusal
                        ? "border-amber-300 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/30"
                        : "border-border-subtle bg-subtle/40",
                    )}
                  >
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink">
                          LumaDesk Copilot
                        </span>
                        {msg.language ? (
                          <LanguageBadge language={msg.language} />
                        ) : null}
                        {isRefusal ? (
                          <span
                            data-testid="not-in-kb-badge"
                            className="inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100"
                          >
                            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Not in the knowledge base
                          </span>
                        ) : null}
                        {isUnverifiedAnswer ? (
                          <span
                            data-testid="no-citation-badge"
                            className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-xs font-medium text-ink-muted"
                          >
                            Unverified (no citation)
                          </span>
                        ) : null}
                        {msg.stopped ? (
                          <span className="rounded bg-subtle px-2 py-0.5 text-xs text-ink-muted">
                            Stopped
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {msg.error ? (
                      <ErrorAlert
                        error={msg.error}
                        title="Could not stream answer"
                        onRetry={() => {
                          const targetQuestion = msg.questionForRetry ?? "";
                          if (!targetQuestion) return;
                          void submitQuestion(targetQuestion, {
                            retryAssistantId: msg.id,
                            baseMessages: messages.slice(0, idx),
                          });
                        }}
                      />
                    ) : msg.isStreaming && msg.content.length === 0 ? (
                      <div
                        className="space-y-2 py-1"
                        aria-busy="true"
                        aria-label="Searching knowledge base…"
                      >
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                          <span>Searching trusted LumaNet documents…</span>
                        </div>
                        <div className="h-4 w-3/4 animate-pulse rounded bg-subtle" />
                        <div className="h-4 w-1/2 animate-pulse rounded bg-subtle" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <MarkdownContent
                          content={msg.content}
                          citations={confirmedCitations}
                          activeCitationKey={activeCitationKey}
                          onSelectCitation={handleSelectCitation}
                        />
                        {msg.isStreaming ? (
                          <span
                            className="inline-block h-4 w-1.5 animate-pulse rounded-xs bg-accent align-middle"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                    )}

                    {/* Sources row */}
                    {confirmedCitations.length > 0 ? (
                      <div
                        data-testid="sources-row"
                        className="mt-4 border-t border-border-subtle pt-3"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Sources</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {confirmedCitations.map((citation) => {
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
                      </div>
                    ) : null}

                    {/* Usage telemetry */}
                    {msg.usage ? (
                      <div className="mt-3">
                        <UsageBadge usage={msg.usage} />
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          {/* Quick prompts + Composer */}
          <div className="border-t border-border-subtle bg-subtle/40 p-3 sm:p-4">
            {messages.length > 0 ? (
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-ink-muted">
                  Examples:
                </span>
                {EXAMPLE_QUESTIONS.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    disabled={isStreaming}
                    onClick={() => void submitQuestion(ex.question)}
                    className="rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink-secondary transition-colors hover:border-accent-border hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            ) : null}

            <form onSubmit={handleFormSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="ask-input" className="sr-only">
                  Ask a question about LumaNet Fiber policies
                </label>
                <textarea
                  id="ask-input"
                  name="question"
                  data-testid="chat-input"
                  rows={2}
                  maxLength={MAX_QUESTION_LENGTH}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  autoComplete="off"
                  placeholder="Ask about outage credits, billing rules, router setup… (Enter to send)"
                  className="block w-full resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                {isStreaming ? (
                  <button
                    type="button"
                    data-testid="stop-button"
                    onClick={handleStop}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-300 bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    data-testid="send-button"
                    disabled={!input.trim()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Ask</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Citation Document Side Panel */}
        <DocDrawer
          selection={docSelection}
          onClose={() => setDocSelection(null)}
          inlineOnDesktop
        />
      </div>
    </div>
  );
}
