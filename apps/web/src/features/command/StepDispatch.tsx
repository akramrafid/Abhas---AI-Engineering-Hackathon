"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, MessageSquare, Printer } from "@/components/icons";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import type { ApiError, Ward } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import {
  buildBriefHref,
  type DispatchChannel,
  type DispatchResponse,
  type Scope,
} from "./api";
import { DeficitBadge } from "./DeficitBadge";

export interface StepDispatchProps {
  scope: Scope;
  originWeek: string;
  stockPct: number;
  totalCrews: number;
  wards: readonly Ward[];
  targetMode: "scope" | "wards";
  selectedWardIds: readonly string[];
  channels: readonly DispatchChannel[];
  noticeLang: Lang;
  savedAllocationPlanId: string | null;
  useSavedPlan: boolean;
  uiLang: Lang;
  data: DispatchResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onTargetModeChange: (mode: "scope" | "wards") => void;
  onToggleWardId: (wardId: string) => void;
  onToggleChannel: (channel: DispatchChannel) => void;
  onNoticeLangChange: (lang: Lang) => void;
  onUseSavedPlanChange: (use: boolean) => void;
}

const CHANNEL_OPTIONS: ReadonlyArray<{ id: DispatchChannel; label: string }> = [
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "brief", label: "Printable brief" },
];

export function StepDispatch({
  scope,
  originWeek,
  stockPct,
  totalCrews,
  wards,
  targetMode,
  selectedWardIds,
  channels,
  noticeLang,
  savedAllocationPlanId,
  useSavedPlan,
  uiLang,
  data,
  isPending,
  isFetching,
  isError,
  error,
  onRetry,
  onTargetModeChange,
  onToggleWardId,
  onToggleChannel,
  onNoticeLangChange,
  onUseSavedPlanChange,
}: StepDispatchProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAllNotices, setShowAllNotices] = useState(false);
  const bn = uiLang === "bn";

  const copyText = async (key: string, text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? null : cur));
      }, 2000);
    } catch {
      setCopiedKey(key);
    }
  };

  const scopeWards =
    scope === "all" ? wards : wards.filter((w) => w.city === scope);
  const notices = data?.notices ?? [];
  const visibleNotices = showAllNotices ? notices : notices.slice(0, 12);

  return (
    <div data-testid="command-panel-5" className="space-y-5">
      {/* Dispatch controls */}
      <Card>
        <CardHeader>
          <CardTitle className={bn ? "font-bangla" : undefined}>
            {bn
              ? "ধাপ ৫ · বহু-চ্যানেল নির্দেশনা ও প্রিন্টযোগ্য ব্রিফ"
              : "Step 5 · Multi-channel dispatch & printable commissioner brief"}
          </CardTitle>
          <CardDescription className={bn ? "font-bangla" : undefined}>
            {bn
              ? "প্রতিটি সংখ্যা নির্ধারিত ফ্যাক্টস থেকে তৈরি (কোনো বাহ্যিক নেটওয়ার্ক কল ছাড়া): SMS (GSM-7/UCS-2), WhatsApp এবং A4 প্রিন্টযোগ্য ব্রিফ।"
              : "Deterministic, zero-network notices grounded strictly in NoticeFacts: SMS with GSM-7 / UCS-2 segment metering, WhatsApp brief, and printable A4 HTML."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Target mode */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-navy">
                Target wards
              </span>
              <div
                role="group"
                aria-label="Dispatch target selection mode"
                className="inline-flex rounded-lg border border-mist bg-paper p-1"
              >
                <button
                  type="button"
                  data-testid="dispatch-target-wards"
                  aria-pressed={targetMode === "wards"}
                  onClick={() => onTargetModeChange("wards")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold",
                    targetMode === "wards"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  Selected wards ({selectedWardIds.length})
                </button>
                <button
                  type="button"
                  data-testid="dispatch-target-scope"
                  aria-pressed={targetMode === "scope"}
                  onClick={() => onTargetModeChange("scope")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold",
                    targetMode === "scope"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  Entire scope ({scope})
                </button>
              </div>
            </div>

            {/* Channels */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-navy">
                Dispatch channels
              </legend>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {CHANNEL_OPTIONS.map((ch) => {
                  const checked = channels.includes(ch.id);
                  const onlyOneLeft = checked && channels.length === 1;
                  const inputId = `dispatch-channel-${ch.id}`;
                  return (
                    <label
                      key={ch.id}
                      htmlFor={inputId}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-mist bg-paper/60 px-2.5 py-1 text-xs font-semibold text-navy"
                    >
                      <input
                        id={inputId}
                        data-testid={inputId}
                        type="checkbox"
                        checked={checked}
                        disabled={onlyOneLeft}
                        onChange={() => onToggleChannel(ch.id)}
                        className="h-4 w-4 accent-royal"
                      />
                      <span>{ch.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Notice language toggle */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-navy">
                Notice language (EN / BN)
              </span>
              <div
                role="group"
                aria-label="Dispatch notice language"
                className="inline-flex rounded-lg border border-mist bg-paper p-1"
              >
                <button
                  type="button"
                  data-testid="dispatch-lang-en"
                  aria-pressed={noticeLang === "en"}
                  onClick={() => onNoticeLangChange("en")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold",
                    noticeLang === "en"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  English (GSM-7)
                </button>
                <button
                  type="button"
                  data-testid="dispatch-lang-bn"
                  aria-pressed={noticeLang === "bn"}
                  onClick={() => onNoticeLangChange("bn")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 font-bangla text-xs font-semibold",
                    noticeLang === "bn"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  বাংলা (UCS-2)
                </button>
              </div>
            </div>
          </div>

          {/* Selected wards picker */}
          {targetMode === "wards" && scopeWards.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-mist bg-paper/50 p-3.5">
              <p className="text-xs font-semibold text-navy">
                Choose wards to dispatch ({selectedWardIds.length} selected)
              </p>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                {scopeWards.map((w) => {
                  const selected = selectedWardIds.includes(w.ward_id);
                  const disabled = selected && selectedWardIds.length === 1;
                  return (
                    <button
                      key={w.ward_id}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => onToggleWardId(w.ward_id)}
                      className={clsx(
                        "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                        selected
                          ? "border-royal bg-royal text-white"
                          : "border-mist bg-white text-navy hover:border-royal",
                        disabled && "opacity-75",
                      )}
                    >
                      {w.ward_id}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Allocation basis summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-paper px-3.5 py-2 text-xs text-navy">
            <span className="font-mono tnum">
              Basis: origin {originWeek} · stock {stockPct}% · crews {totalCrews}
              {useSavedPlan && savedAllocationPlanId
                ? ` · saved plan ${savedAllocationPlanId.slice(0, 8)}`
                : " · live Step 2 inputs"}
            </span>
            {savedAllocationPlanId ? (
              <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-navy">
                <input
                  type="checkbox"
                  checked={useSavedPlan}
                  onChange={(e) => onUseSavedPlanChange(e.target.checked)}
                  className="h-4 w-4 accent-royal"
                />
                <span>Use last saved allocation plan</span>
              </label>
            ) : null}
          </div>

          {isFetching ? (
            <p role="status" aria-live="polite" className="font-mono text-xs font-semibold text-navy">
              Rendering notices…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step5-error-banner"
          retryTestId="step5-retry"
          title="Could not render dispatch notices"
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton
          testId="step5-loading"
          label="Rendering bilingual SMS, WhatsApp, and printable commissioner briefs…"
        />
      ) : null}

      {!isError && data && notices.length === 0 ? (
        <EmptyState
          title="No dispatch notices generated"
          description="Select at least one ward and channel above."
        />
      ) : null}

      {!isError && data && notices.length > 0 ? (
        <div data-testid="dispatch-notices-list" className="space-y-4">
          {visibleNotices.map((notice) => {
            const { facts, sms, whatsapp, brief_url } = notice;
            const briefHref = buildBriefHref({
              wardId: facts.ward_id,
              originWeek,
              lang: data.lang,
              stockPct,
              totalCrews,
              planId: useSavedPlan ? savedAllocationPlanId : null,
              briefUrl: brief_url,
            });
            const smsCopyKey = `sms-${facts.ward_id}`;
            const waCopyKey = `wa-${facts.ward_id}`;

            return (
              <Card
                key={facts.ward_id}
                data-testid={`dispatch-notice-${facts.ward_id}`}
                className="overflow-hidden"
              >
                <CardHeader className="gap-3 bg-paper/60 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-sm tnum">
                        {facts.ward_id} · {facts.ward_name}
                      </CardTitle>
                      <RiskTierBadge tier={facts.tier} size="sm" lang={data.lang} />
                      <DeficitBadge level={facts.deficit_level} lang={data.lang} />
                    </div>
                    <p className="font-mono text-xs text-slate tnum">
                      {facts.city} · window {facts.window_start} to {facts.window_end} ·{" "}
                      {facts.predicted_cases.toFixed(1)} cases · Saline{" "}
                      {facts.saline_bags.allocated}/{facts.saline_bags.required} · Kits{" "}
                      {facts.diagnostic_kits.allocated}/{facts.diagnostic_kits.required} · Beds{" "}
                      {facts.hospital_beds.allocated}/{facts.hospital_beds.required} · Crews{" "}
                      {facts.crews_assigned}
                    </p>
                    <p
                      lang={data.lang}
                      className={clsx(
                        "text-xs font-medium text-ink",
                        data.lang === "bn" && "font-bangla",
                      )}
                    >
                      {facts.action}
                    </p>
                  </div>

                  {brief_url ? (
                    <a
                      href={briefHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`open-brief-${facts.ward_id}`}
                      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy"
                    >
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      <span>Open printable brief</span>
                    </a>
                  ) : null}
                </CardHeader>

                <CardContent className="grid gap-4 lg:grid-cols-2">
                  {/* SMS Preview Card */}
                  {sms ? (
                    <div
                      data-testid={`sms-preview-${facts.ward_id}`}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-mist bg-paper/40 p-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-navy">
                            <MessageSquare
                              aria-hidden="true"
                              className="h-4 w-4 text-royal"
                            />
                            <span>SMS Preview</span>
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-semibold tnum">
                            <span
                              data-testid="sms-encoding"
                              className="rounded bg-navy px-2 py-0.5 text-white"
                            >
                              {sms.encoding}
                            </span>
                            <span
                              data-testid="sms-characters"
                              className="rounded border border-mist bg-white px-2 py-0.5 text-navy"
                            >
                              {sms.characters} chars
                            </span>
                            <span
                              data-testid="sms-segments"
                              className="rounded border border-mist bg-white px-2 py-0.5 text-navy"
                            >
                              {sms.segments} {sms.segments === 1 ? "segment" : "segments"}
                            </span>
                          </div>
                        </div>

                        <p
                          lang={data.lang}
                          className={clsx(
                            "rounded-lg border border-mist bg-white p-3 text-xs leading-relaxed text-ink break-words",
                            data.lang === "bn" ? "font-bangla" : "font-mono",
                          )}
                        >
                          {sms.text}
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void copyText(smsCopyKey, sms.text)}
                          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-3 text-xs font-semibold text-navy hover:border-royal"
                        >
                          {copiedKey === smsCopyKey ? (
                            <>
                              <Check aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>Copied SMS</span>
                            </>
                          ) : (
                            <>
                              <Copy aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>Copy SMS</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* WhatsApp Preview Card */}
                  {whatsapp ? (
                    <div
                      data-testid={`whatsapp-preview-${facts.ward_id}`}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-mist bg-paper/40 p-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-navy">
                            <MessageCircle
                              aria-hidden="true"
                              className="h-4 w-4 text-royal"
                            />
                            <span>WhatsApp Preview</span>
                          </h3>
                          <span className="font-mono text-[11px] text-slate tnum">
                            {data.lang.toUpperCase()}
                          </span>
                        </div>

                        <pre
                          lang={data.lang}
                          className={clsx(
                            "whitespace-pre-wrap break-words rounded-lg border border-mist bg-white p-3 text-xs leading-relaxed text-ink",
                            data.lang === "bn" ? "font-bangla" : "font-sans",
                          )}
                        >
                          {whatsapp}
                        </pre>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          data-testid={`copy-whatsapp-${facts.ward_id}`}
                          onClick={() => void copyText(waCopyKey, whatsapp)}
                          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-3 text-xs font-semibold text-navy hover:border-royal"
                        >
                          {copiedKey === waCopyKey ? (
                            <>
                              <Check aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>Copied WhatsApp</span>
                            </>
                          ) : (
                            <>
                              <Copy aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>Copy WhatsApp</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          {notices.length > 12 && !showAllNotices ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllNotices(true)}
                className="min-h-10 cursor-pointer rounded-lg border border-mist bg-white px-4 text-xs font-semibold text-navy hover:border-royal hover:bg-paper"
              >
                Show all {notices.length} ward notices
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
