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
import { UI_COPY, type Lang } from "@/lib/i18n";
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

const CHANNEL_IDS: readonly DispatchChannel[] = ["sms", "whatsapp", "brief"];

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
  const s5 = UI_COPY[uiLang].command.step5;
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
          <CardTitle lang={uiLang} className={bn ? "font-bangla" : undefined}>
            {s5.title}
          </CardTitle>
          <CardDescription lang={uiLang} className={bn ? "font-bangla" : undefined}>
            {s5.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Target mode */}
            <div className="space-y-2">
              <span lang={uiLang} className={clsx("block text-xs font-semibold text-navy", bn && "font-bangla")}>
                {s5.targetWardsLabel}
              </span>
              <div
                role="group"
                aria-label={s5.targetModeAria}
                className="inline-flex rounded-lg border border-mist bg-paper p-1"
              >
                <button
                  type="button"
                  data-testid="dispatch-target-wards"
                  aria-pressed={targetMode === "wards"}
                  onClick={() => onTargetModeChange("wards")}
                  lang={uiLang}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold",
                    bn && "font-bangla",
                    targetMode === "wards"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  {s5.targetSelectedWards(selectedWardIds.length)}
                </button>
                <button
                  type="button"
                  data-testid="dispatch-target-scope"
                  aria-pressed={targetMode === "scope"}
                  onClick={() => onTargetModeChange("scope")}
                  lang={uiLang}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold",
                    bn && "font-bangla",
                    targetMode === "scope"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  {s5.targetEntireScope(scope)}
                </button>
              </div>
            </div>

            {/* Channels */}
            <fieldset className="space-y-2">
              <legend lang={uiLang} className={clsx("text-xs font-semibold text-navy", bn && "font-bangla")}>
                {s5.channelsLabel}
              </legend>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {CHANNEL_IDS.map((chId) => {
                  const checked = channels.includes(chId);
                  const onlyOneLeft = checked && channels.length === 1;
                  const inputId = `dispatch-channel-${chId}`;
                  return (
                    <label
                      key={chId}
                      htmlFor={inputId}
                      lang={uiLang}
                      className={clsx(
                        "inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-mist bg-paper/60 px-2.5 py-1 text-xs font-semibold text-navy",
                        bn && "font-bangla",
                      )}
                    >
                      <input
                        id={inputId}
                        data-testid={inputId}
                        type="checkbox"
                        checked={checked}
                        disabled={onlyOneLeft}
                        onChange={() => onToggleChannel(chId)}
                        className="h-4 w-4 accent-royal"
                      />
                      <span>{s5.channelLabels[chId]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Notice language toggle */}
            <div className="space-y-2">
              <span lang={uiLang} className={clsx("block text-xs font-semibold text-navy", bn && "font-bangla")}>
                {s5.noticeLangLabel}
              </span>
              <div
                role="group"
                aria-label={s5.noticeLangAria}
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
              <p lang={uiLang} className={clsx("text-xs font-semibold text-navy", bn && "font-bangla")}>
                {s5.chooseWardsTitle(selectedWardIds.length)}
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
            <span lang={uiLang} className={clsx("font-mono tnum", bn && "font-bangla")}>
              {s5.basisSummary(
                originWeek,
                stockPct,
                totalCrews,
                useSavedPlan ? savedAllocationPlanId : null,
              )}
            </span>
            {savedAllocationPlanId ? (
              <label
                lang={uiLang}
                className={clsx("inline-flex cursor-pointer items-center gap-2 font-semibold text-navy", bn && "font-bangla")}
              >
                <input
                  type="checkbox"
                  checked={useSavedPlan}
                  onChange={(e) => onUseSavedPlanChange(e.target.checked)}
                  className="h-4 w-4 accent-royal"
                />
                <span>{s5.useSavedPlanLabel}</span>
              </label>
            ) : null}
          </div>

          {isFetching ? (
            <p
              role="status"
              aria-live="polite"
              lang={uiLang}
              className={clsx("font-mono text-xs font-semibold text-navy", bn && "font-bangla")}
            >
              {s5.renderingNotices}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step5-error-banner"
          retryTestId="step5-retry"
          title={s5.errorTitle}
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton testId="step5-loading" label={s5.loadingLabel} />
      ) : null}

      {!isError && data && notices.length === 0 ? (
        <EmptyState title={s5.emptyTitle} description={s5.emptyDescription} />
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
                    <p
                      lang={uiLang}
                      className={clsx("font-mono text-xs text-slate tnum", bn && "font-bangla")}
                    >
                      {s5.noticeFactsLine(
                        facts.city,
                        facts.window_start,
                        facts.window_end,
                        facts.predicted_cases.toFixed(1),
                        `${facts.saline_bags.allocated}/${facts.saline_bags.required}`,
                        `${facts.diagnostic_kits.allocated}/${facts.diagnostic_kits.required}`,
                        `${facts.hospital_beds.allocated}/${facts.hospital_beds.required}`,
                        facts.crews_assigned,
                      )}
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
                      lang={uiLang}
                      className={clsx(
                        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy",
                        bn && "font-bangla",
                      )}
                    >
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      <span>{s5.openPrintableBrief}</span>
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
                          <h3
                            lang={uiLang}
                            className={clsx(
                              "inline-flex items-center gap-1.5 text-xs font-bold text-navy",
                              bn && "font-bangla",
                            )}
                          >
                            <MessageSquare
                              aria-hidden="true"
                              className="h-4 w-4 text-royal"
                            />
                            <span>{s5.smsPreviewTitle}</span>
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
                              lang={uiLang}
                              className={clsx(
                                "rounded border border-mist bg-white px-2 py-0.5 text-navy",
                                bn && "font-bangla",
                              )}
                            >
                              {s5.charsLabel(sms.characters)}
                            </span>
                            <span
                              data-testid="sms-segments"
                              lang={uiLang}
                              className={clsx(
                                "rounded border border-mist bg-white px-2 py-0.5 text-navy",
                                bn && "font-bangla",
                              )}
                            >
                              {s5.segmentsLabel(sms.segments)}
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
                          lang={uiLang}
                          className={clsx(
                            "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-3 text-xs font-semibold text-navy hover:border-royal",
                            bn && "font-bangla",
                          )}
                        >
                          {copiedKey === smsCopyKey ? (
                            <>
                              <Check aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>{s5.copiedSms}</span>
                            </>
                          ) : (
                            <>
                              <Copy aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>{s5.copySms}</span>
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
                          <h3
                            lang={uiLang}
                            className={clsx(
                              "inline-flex items-center gap-1.5 text-xs font-bold text-navy",
                              bn && "font-bangla",
                            )}
                          >
                            <MessageCircle
                              aria-hidden="true"
                              className="h-4 w-4 text-royal"
                            />
                            <span>{s5.whatsappPreviewTitle}</span>
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
                          lang={uiLang}
                          className={clsx(
                            "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-3 text-xs font-semibold text-navy hover:border-royal",
                            bn && "font-bangla",
                          )}
                        >
                          {copiedKey === waCopyKey ? (
                            <>
                              <Check aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>{s5.copiedWhatsapp}</span>
                            </>
                          ) : (
                            <>
                              <Copy aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                              <span>{s5.copyWhatsapp}</span>
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
                lang={uiLang}
                className={clsx(
                  "min-h-10 cursor-pointer rounded-lg border border-mist bg-white px-4 text-xs font-semibold text-navy hover:border-royal hover:bg-paper",
                  bn && "font-bangla",
                )}
              >
                {s5.showAllNotices(notices.length)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
