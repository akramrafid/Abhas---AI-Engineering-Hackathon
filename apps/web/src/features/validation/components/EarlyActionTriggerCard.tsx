"use client";

import { clsx } from "clsx";
import type { TriggerValidationResponse } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface EarlyActionTriggerCardProps {
  data?: TriggerValidationResponse;
  isPending?: boolean;
  isError?: boolean;
  lang?: Lang;
}

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function fmtWeeks(val: number | null | undefined, bn: boolean): string {
  if (val === null || val === undefined) return "—";
  return bn ? `${val.toFixed(1)} সপ্তাহ` : `${val.toFixed(1)} wk`;
}

export function EarlyActionTriggerCard({
  data,
  isPending = false,
  isError = false,
  lang = "en",
}: EarlyActionTriggerCardProps) {
  const bn = lang === "bn";

  if (isPending) {
    return (
      <section
        data-testid="early-action-trigger-loading"
        className="rounded-2xl bg-white p-5 ring-1 ring-mist/90"
      >
        <div className="h-5 w-56 animate-pulse rounded bg-mist/60" />
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-paper" />
      </section>
    );
  }

  if (isError || !data) {
    return null;
  }

  const rule = data.rule;
  const hr = data.holdout_rule;
  const hm = data.holdout_model;
  const cmp = data.comparison;

  const ruleSentence = bn ? rule.rule_text_bn : rule.rule_text_en;
  const falseAlarmsCut = Math.max(0, cmp.false_alarms_avoided);

  return (
    <section
      data-testid="early-action-trigger-card"
      aria-labelledby="early-action-trigger-heading"
      className="rounded-2xl bg-white p-5 text-ink ring-1 ring-mist/90"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            lang={lang}
            className={clsx(
              "font-mono text-[11px] font-semibold uppercase tracking-wider text-royal",
              bn && "font-bangla normal-case tracking-normal",
            )}
          >
            {bn
              ? "ADR-0020 · শূন্য-মডেল মাঠ পর্যায়ের নিয়ম বনাম আভাস মডেল"
              : "ADR-0020 · Zero-Model Clipboard Rule vs Abhas LightGBM"}
          </p>
          <h2
            id="early-action-trigger-heading"
            lang={lang}
            className={clsx(
              "mt-1 text-lg font-bold tracking-tight text-navy",
              bn && "font-bangla",
            )}
          >
            {bn ? "পূর্ব-সতর্কতা ট্রিগার (Early-action trigger)" : "Early-action trigger"}
          </h2>
        </div>

        <span
          lang={lang}
          className={clsx(
            "inline-flex items-center rounded-full border border-royal/25 bg-paper px-3 py-1 font-mono text-xs font-semibold text-navy",
            bn && "font-bangla",
          )}
        >
          {bn
            ? `অফলাইনে কার্যকর · প্রশিক্ষণ ${rule.fit_years[0]}–${rule.fit_years[1]} · হোল্ড-আউট ${rule.holdout_years[0]}–${rule.holdout_years[1]}`
            : `Works with no model · Fit ${rule.fit_years[0]}–${rule.fit_years[1]} · Locked hold-out ${rule.holdout_years[0]}–${rule.holdout_years[1]}`}
        </span>
      </div>

      {/* One-sentence auditable rule */}
      <div
        data-testid="trigger-rule-sentence"
        className="mt-4 rounded-xl border-l-4 border-royal bg-paper px-4 py-3"
      >
        <p
          lang={lang}
          className={clsx("text-sm font-semibold text-navy", bn && "font-bangla")}
        >
          {ruleSentence}
        </p>
        <p
          lang={lang}
          className={clsx("mt-1 text-xs text-slate", bn && "font-bangla")}
        >
          {bn
            ? "কমিশনার ব্রিফে সরাসরি মুদ্রিত — ল্যাপটপ বা সার্ভার বন্ধ থাকলেও মাঠ কর্মকর্তারা ২ সপ্তাহের বৃষ্টিপাত দেখেই ৩ সপ্তাহ আগে ব্যবস্থা নিতে পারবেন।"
            : "Printed directly on every commissioner brief — field officers can verify 2-week rain and act 3 weeks ahead even with zero software."}
        </p>
      </div>

      {/* Side-by-side comparison bars: Hit rate & False-alarm ratio */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div
          data-testid="trigger-hit-far-bars"
          className="space-y-4 rounded-xl border border-mist/80 bg-white p-4"
        >
          <h3
            lang={lang}
            className={clsx(
              "text-xs font-bold uppercase tracking-wider text-navy",
              bn && "font-bangla normal-case tracking-normal",
            )}
          >
            {bn
              ? "হোল্ড-আউট হিট রেট ও মিথ্যা অ্যালার্ম অনুপাত (FAR)"
              : "Locked 2024–25 Hold-Out: Hit Rate & False-Alarm Ratio"}
          </h3>

          {/* Hit rate bars */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate">
              <span lang={lang} className={clsx(bn && "font-bangla")}>
                {bn ? "হিট রেট — আভাস মডেল (h=3)" : "Hit rate · Abhas LightGBM (h=3)"}
              </span>
              <span className="font-mono font-bold text-navy tnum">
                {pct(hm.hit_rate)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist/60">
              <div
                className="h-full rounded-full bg-royal"
                style={{ width: `${Math.min(100, Math.round(hm.hit_rate * 100))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-medium text-slate">
              <span lang={lang} className={clsx(bn && "font-bangla")}>
                {bn ? "হিট রেট — শূন্য-মডেল নিয়ম" : "Hit rate · Zero-model rule"}
              </span>
              <span className="font-mono font-bold text-navy tnum">
                {pct(hr.hit_rate)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist/60">
              <div
                className="h-full rounded-full bg-navy/70"
                style={{ width: `${Math.min(100, Math.round(hr.hit_rate * 100))}%` }}
              />
            </div>
          </div>

          {/* False-alarm ratio bars */}
          <div className="space-y-2 border-t border-mist/60 pt-3">
            <div className="flex items-center justify-between text-xs font-medium text-slate">
              <span lang={lang} className={clsx(bn && "font-bangla")}>
                {bn
                  ? "মিথ্যা অ্যালার্ম অনুপাত (FAR) — আভাস মডেল (কম ভালো)"
                  : "False-alarm ratio (FAR) · Abhas model (lower is better)"}
              </span>
              <span className="font-mono font-bold text-navy tnum">
                {pct(hm.false_alarm_ratio)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist/60">
              <div
                className="h-full rounded-full bg-[#0F766E]"
                style={{
                  width: `${Math.min(100, Math.round(hm.false_alarm_ratio * 100))}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-medium text-slate">
              <span lang={lang} className={clsx(bn && "font-bangla")}>
                {bn
                  ? "মিথ্যা অ্যালার্ম অনুপাত (FAR) — শূন্য-মডেল নিয়ম"
                  : "False-alarm ratio (FAR) · Zero-model rule"}
              </span>
              <span className="font-mono font-bold text-[#9A3412] tnum">
                {pct(hr.false_alarm_ratio)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist/60">
              <div
                className="h-full rounded-full bg-[#C2410C]"
                style={{
                  width: `${Math.min(100, Math.round(hr.false_alarm_ratio * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Scorecard + Lead-time quartiles */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-mist/80 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-paper p-3">
              <p
                lang={lang}
                className={clsx("text-[11px] font-semibold text-slate", bn && "font-bangla")}
              >
                {bn ? "পিয়ার্স স্কিল (আভাস)" : "Peirce skill (Abhas)"}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                {hm.peirce_skill_score.toFixed(3)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate tnum">
                {bn ? "নিয়ম" : "Rule"}: {hr.peirce_skill_score.toFixed(3)}
              </p>
            </div>

            <div className="rounded-lg bg-paper p-3">
              <p
                lang={lang}
                className={clsx("text-[11px] font-semibold text-slate", bn && "font-bangla")}
              >
                {bn ? "মিথ্যা অ্যালার্ম কম" : "False alarms cut"}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-royal tnum">
                −{falseAlarmsCut.toLocaleString()}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate tnum">
                {hm.alerts.toLocaleString()} vs {hr.alerts.toLocaleString()}
              </p>
            </div>

            <div className="col-span-2 rounded-lg bg-paper p-3 sm:col-span-1">
              <p
                lang={lang}
                className={clsx("text-[11px] font-semibold text-slate", bn && "font-bangla")}
              >
                {bn ? "উচ্চ ঝুঁকি সপ্তাহ" : "Observed High wks"}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                {hr.high_weeks.toLocaleString()}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate tnum">
                / {hr.total_ward_weeks.toLocaleString()}
              </p>
            </div>
          </div>

          <div
            data-testid="trigger-lead-time"
            className="rounded-lg border border-mist/80 bg-paper/70 px-3.5 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span
                lang={lang}
                className={clsx("font-semibold text-navy", bn && "font-bangla")}
              >
                {bn ? "লিড-টাইম কোয়ার্টাইল (Q25 / মধ্যমা / Q75)" : "Lead-time quartiles (Q25 / Median / Q75)"}
              </span>
              <span className="font-mono font-bold text-navy tnum">
                {fmtWeeks(hr.lead_time_weeks.q25, bn)} ·{" "}
                {fmtWeeks(hr.lead_time_weeks.median, bn)} ·{" "}
                {fmtWeeks(hr.lead_time_weeks.q75, bn)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate tnum">
              {bn
                ? `নিয়ম কাভারেজ: ${hr.lead_time_weeks.spells_covered}/${hr.lead_time_weeks.total_spells} ঢেউ · আভাস মধ্যমা লিড: ${fmtWeeks(hm.lead_time_weeks.median, bn)} (${hm.lead_time_weeks.spells_covered}/${hm.lead_time_weeks.total_spells})`
                : `Rule wave coverage: ${hr.lead_time_weeks.spells_covered}/${hr.lead_time_weeks.total_spells} · Abhas median lead: ${fmtWeeks(hm.lead_time_weeks.median, bn)} (${hm.lead_time_weeks.spells_covered}/${hm.lead_time_weeks.total_spells})`}
            </p>
          </div>

          <p className="text-xs leading-relaxed text-slate">{cmp.summary_note}</p>
        </div>
      </div>
    </section>
  );
}
