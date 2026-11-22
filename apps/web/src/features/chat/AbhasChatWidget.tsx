"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Check,
  Copy,
  MapPin,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { streamAbhasChat, type ChatTurn } from "./api";
import { FormattedMessage } from "./FormattedMessage";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  language?: "en" | "bn";
  source?: "gemini" | "grounded_fallback";
  model?: string | null;
  groundedWard?: string | null;
  latencyMs?: number;
  cached?: boolean;
  streaming?: boolean;
  error?: boolean;
}

const STARTER_PROMPTS = {
  en: [
    "Why does rainfall predict dengue 3 weeks later?",
    "What is the current forecast for DSCC_Ward_04?",
    "How accurate is Abhas on 2024–2025 hold-out?",
    "How do officers use the Scenario sandbox?",
  ],
  bn: [
    "বৃষ্টির ৩ সপ্তাহ পর কেন ডেঙ্গু ঝুঁকি বাড়ে?",
    "DSCC_Ward_04 এর বর্তমান পূর্বাভাস কী?",
    "Abhas মডেল কতটা নির্ভুল?",
    "ড্যাশবোর্ডের সিনারিও স্যান্ডবক্স কীভাবে ব্যবহার করব?",
  ],
} as const;

const WARD_ID_RE = /^(?:DNCC|DSCC|CCC|GCC|NCC)_Ward_\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ChatWidgetInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawWard = searchParams.get("ward");
  const activeWard = rawWard && WARD_ID_RE.test(rawWard) ? rawWard : null;
  const rawOrigin = searchParams.get("origin");
  const activeOrigin = rawOrigin && ISO_DATE_RE.test(rawOrigin) ? rawOrigin : null;
  const urlLang = searchParams.get("lang") === "bn" ? "bn" : "en";

  const [open, setOpen] = useState(false);
  const [langOverride, setLangOverride] = useState<"en" | "bn" | null>(null);
  const lang: "en" | "bn" = langOverride ?? urlLang;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [activeModelLabel, setActiveModelLabel] = useState<string>("Gemini 2.5 Flash");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const suggestions =
    messages.length === 0 ? [...STARTER_PROMPTS[lang]] : followUpSuggestions;

  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Global keyboard shortcut: Ctrl+/ or Cmd+/ toggles chat; Escape closes.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus input when opened.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => textareaRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Auto-scroll to latest message.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Clean up any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const clearConversation = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setFollowUpSuggestions([]);
  }, [stopStreaming]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || isStreaming) return;

      const userMsgId = `u-${Date.now()}`;
      const assistantMsgId = `a-${Date.now() + 1}`;

      const history: ChatTurn[] = messages
        .filter((m) => !m.error && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      setInput("");
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: text },
        { id: assistantMsgId, role: "assistant", content: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamAbhasChat(
          {
            message: text,
            history,
            language: lang === "bn" ? "bn" : "auto",
            ward_id: activeWard,
            origin_week: activeOrigin,
          },
          {
            onMeta: (meta) => {
              if (meta.model) {
                setActiveModelLabel(
                  meta.model === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : meta.model,
                );
              } else if (meta.source === "grounded_fallback") {
                setActiveModelLabel("Offline Grounded");
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        language: meta.language,
                        source: meta.source,
                        model: meta.model,
                        groundedWard: meta.grounded_ward,
                        cached: meta.cached,
                      }
                    : m,
                ),
              );
            },
            onDelta: (chunk) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m,
                ),
              );
            },
            onDone: (done) => {
              if (done.suggestions.length > 0) {
                setFollowUpSuggestions(done.suggestions);
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        streaming: false,
                        latencyMs: done.latency_ms,
                        cached: done.cached,
                        source: done.source,
                        model: done.model,
                      }
                    : m,
                ),
              );
            },
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        const errMsg =
          lang === "bn"
            ? "এই মুহূর্তে Abhas API-এর সাথে সংযোগ করা যাচ্ছে না। দয়া করে লোকাল API (`npm run dev`) চালু আছে কিনা দেখে আবার চেষ্টা করুন।"
            : "Could not reach the Abhas API right now. Please verify the local server (`npm run dev`) is running and try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: errMsg, streaming: false, error: true }
              : m,
          ),
        );
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
        );
      }
    },
    [activeOrigin, activeWard, input, isStreaming, lang, messages],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
    }
  };

  // Hide on Clerk auth pages to keep sign-in uncluttered.
  if (pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up")) {
    return null;
  }

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open ? (
        <section
          role="dialog"
          aria-label="Abhas AI Assistant"
          data-testid="abhas-chat-dialog"
          className="flex h-[min(600px,calc(100svh-6rem))] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-[0_24px_64px_-12px_rgba(11,15,20,0.45),0_8px_24px_-6px_rgba(47,91,255,0.22)] backdrop-blur-2xl"
        >
          {/* Liquid-glass dark header */}
          <header className="relative flex items-center justify-between gap-2 overflow-hidden bg-gradient-to-r from-ink via-navy to-ink px-4 py-3 text-white">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-royal/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold tracking-tight text-white">
                  Abhas AI <span lang="bn" className="font-bangla font-medium text-mist">আভাস এআই</span>
                </h2>
                <p className="flex items-center gap-1.5 truncate font-mono text-[11px] text-mist">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      isStreaming ? "animate-pulse bg-sky-300" : "bg-emerald-400",
                    )}
                  />
                  {isStreaming ? "Replying…" : activeModelLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Language switcher */}
              <div
                role="group"
                aria-label="Chat language"
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 p-0.5"
              >
                {(["en", "bn"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={lang === code}
                    onClick={() => setLangOverride(code)}
                    className={clsx(
                      "cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
                      code === "bn" && "font-bangla",
                      lang === code ? "bg-royal text-white" : "text-mist hover:text-white",
                    )}
                  >
                    {code === "en" ? "EN" : "বাংলা"}
                  </button>
                ))}
              </div>

              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={clearConversation}
                  aria-label="Clear chat"
                  title="New conversation"
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                data-testid="abhas-chat-close"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Active dashboard ward context bar */}
          {activeWard ? (
            <div className="flex items-center justify-between gap-2 border-b border-mist bg-paper px-4 py-1.5 text-xs text-slate">
              <span className="inline-flex items-center gap-1.5 font-medium text-navy">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                Live context: <code className="font-mono font-semibold">{activeWard}</code>
              </span>
              {activeOrigin ? (
                <span className="font-mono text-[11px] text-slate">{activeOrigin}</span>
              ) : null}
            </div>
          ) : null}

          {/* Messages scroll area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-3.5 overflow-y-auto bg-paper/70 px-4 py-4"
          >
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-mist bg-white p-3.5 shadow-sm">
                  <p
                    lang={lang}
                    className={clsx(
                      "text-sm font-semibold text-navy",
                      lang === "bn" && "font-bangla",
                    )}
                  >
                    {lang === "bn"
                      ? "আভাস (Abhas) সম্পর্কে যেকোনো প্রশ্ন করুন"
                      : "Ask anything about Abhas"}
                  </p>
                  <p
                    lang={lang}
                    className={clsx(
                      "mt-1 text-xs leading-5 text-slate",
                      lang === "bn" && "font-bangla",
                    )}
                  >
                    {lang === "bn"
                      ? "ঢাকা উত্তর, ঢাকা দক্ষিণ, চট্টগ্রাম, গাজীপুর ও নারায়ণগঞ্জের ৬০টি ওয়ার্ডের পূর্বাভাস, বৃষ্টির ৩-সপ্তাহ ল্যাগ, মডেলের নির্ভুলতা বা ড্যাশবোর্ড ব্যবহার নিয়ে তাৎক্ষণিক উত্তর পান।"
                      : "Instant, grounded answers on all 60 wards across 5 city corporations, 3-week rainfall lag science, LightGBM hold-out accuracy, and live ward forecasts."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate">
                    {lang === "bn" ? "দ্রুত প্রশ্ন" : "Quick questions"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {suggestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void sendMessage(q)}
                        className={clsx(
                          "cursor-pointer rounded-xl border border-mist bg-white px-3 py-2 text-left text-xs font-medium text-navy transition-all hover:border-royal hover:bg-royal/[0.04]",
                          lang === "bn" && "font-bangla",
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "flex flex-col",
                    msg.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={clsx(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                      msg.role === "user"
                        ? "rounded-br-sm bg-royal text-sm text-white"
                        : msg.error
                          ? "rounded-bl-sm border border-red-200 bg-red-50 text-sm text-red-900"
                          : "rounded-bl-sm border border-mist bg-white text-ink",
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{msg.content}</p>
                    ) : msg.content ? (
                      <FormattedMessage content={msg.content} isBangla={msg.language === "bn"} />
                    ) : (
                      <span
                        aria-label="Generating answer"
                        className="inline-flex items-center gap-1 py-1 text-slate"
                      >
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-royal [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-royal [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-royal" />
                      </span>
                    )}
                  </div>

                  {/* Assistant footer metadata */}
                  {msg.role === "assistant" && !msg.streaming && msg.content ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate">
                      {msg.groundedWard ? (
                        <Link
                          href={`/dashboard?demo=1&ward=${msg.groundedWard}`}
                          className="inline-flex items-center gap-1 rounded-full bg-royal/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-royal hover:bg-royal/20"
                        >
                          <MapPin aria-hidden="true" className="h-2.5 w-2.5" />
                          {msg.groundedWard}
                        </Link>
                      ) : null}
                      {typeof msg.latencyMs === "number" ? (
                        <span className="font-mono text-[10px] tnum">
                          {msg.cached
                            ? `instant (${Math.round(msg.latencyMs)}ms)`
                            : `${(msg.latencyMs / 1000).toFixed(2)}s`}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        aria-label="Copy response"
                        className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-slate hover:bg-mist/60 hover:text-navy"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check aria-hidden="true" className="h-3 w-3 text-emerald-700" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy aria-hidden="true" className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {/* Follow-up suggestions after last assistant reply */}
            {messages.length > 0 && !isStreaming && suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions.slice(0, 3).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className={clsx(
                      "cursor-pointer rounded-full border border-mist bg-white px-2.5 py-1 text-[11px] font-medium text-navy transition-colors hover:border-royal hover:text-royal",
                      lang === "bn" && "font-bangla",
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Input composer */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-mist bg-white px-3 py-2.5"
          >
            <div className="flex items-end gap-2 rounded-xl border border-mist bg-paper/70 px-3 py-1.5 focus-within:border-royal focus-within:bg-white focus-within:ring-2 focus-within:ring-royal/15">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                maxLength={1200}
                placeholder={
                  lang === "bn"
                    ? "ওয়ার্ড, পূর্বাভাস বা Abhas সম্পর্কে প্রশ্ন লিখুন…"
                    : "Ask about a ward, 3-week lag, model accuracy…"
                }
                aria-label="Ask Abhas AI"
                data-testid="abhas-chat-input"
                className={clsx(
                  "max-h-24 min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-sm text-ink placeholder:text-slate focus:outline-none",
                  lang === "bn" && "font-bangla",
                )}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  aria-label="Stop generating"
                  className="mb-0.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-navy text-white transition-colors hover:bg-ink"
                >
                  <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  data-testid="abhas-chat-send"
                  className="mb-0.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-royal text-white shadow-sm transition-all hover:bg-navy disabled:cursor-not-allowed disabled:bg-mist disabled:text-slate"
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 flex items-center justify-between px-1 font-mono text-[10px] text-slate">
              <span>Grounded in live Abhas forecasts</span>
              <span>Ctrl / to toggle</span>
            </p>
          </form>
        </section>
      ) : null}

      {/* Floating liquid-glass launcher button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? "Close Abhas AI Assistant" : "Open Abhas AI Assistant"}
        data-testid="abhas-chat-launcher"
        className={clsx(
          "group relative inline-flex h-12 cursor-pointer items-center gap-2.5 overflow-hidden rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition-all duration-300 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2",
          "bg-gradient-to-br from-navy via-royal to-navy shadow-[0_14px_34px_-6px_rgba(47,91,255,0.6),inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-xl hover:scale-[1.03] hover:shadow-[0_18px_42px_-6px_rgba(47,91,255,0.75)]",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
        />
        {open ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <>
            <MessageSquareText aria-hidden="true" className="h-4 w-4" />
            <span className="max-sm:hidden">Ask Abhas AI</span>
          </>
        )}
      </button>
    </div>
  );
}

/** Global Abhas AI chatbot widget (Suspense-wrapped for Next.js 16 Cache Components). */
export function AbhasChatWidget() {
  return (
    <Suspense fallback={null}>
      <ChatWidgetInner />
    </Suspense>
  );
}
