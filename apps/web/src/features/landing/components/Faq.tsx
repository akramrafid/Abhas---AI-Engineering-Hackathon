"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, MessageSquareText, Plus } from "@/components/icons";
import { clsx } from "clsx";
import { ABHAS_FAQ_ITEMS } from "@/lib/seo";
import { useLandingLang } from "../lang-context";

type FaqTopic = "all" | "model" | "ops" | "trust";

const FAQ = ABHAS_FAQ_ITEMS;

export function Faq() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const [topic, setTopic] = useState<FaqTopic>("all");

  const visible = topic === "all" ? FAQ : FAQ.filter((item) => item.topic === topic);

  const topics: ReadonlyArray<{ id: FaqTopic; label: string }> = [
    { id: "all", label: bn ? "সব প্রশ্ন (৯)" : "All (9)" },
    { id: "model", label: bn ? "মডেল ও ডেটা" : "Model & Data" },
    { id: "ops", label: bn ? "সেটআপ ও খরচ" : "Setup & Cost" },
    { id: "trust", label: bn ? "নিরাপত্তা ও পাইলট" : "Privacy & Pilots" },
  ];

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      lang={lang}
      className="scroll-mt-20 border-t border-mist bg-paper px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <h2
            id="faq-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,3.8vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn ? "কর্মকর্তারা প্রথমে যে প্রশ্নগুলো করেন।" : "Questions officers ask first."}
          </h2>
          <p className={clsx("mt-4 max-w-sm text-base leading-7 text-slate", bn && "font-bangla")}>
            {bn ? "সংক্ষিপ্ত উত্তর, প্রমাণিত পরিসংখ্যানসহ।" : "Short answers, with the measured numbers behind them."}
          </p>

          <div
            role="group"
            aria-label={bn ? "বিষয় অনুযায়ী প্রশ্ন ফিল্টার" : "Filter questions by topic"}
            className="mt-7 flex flex-wrap gap-1.5"
          >
            {topics.map((item) => {
              const active = topic === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(item.id)}
                  className={clsx(
                    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                    bn && "font-bangla",
                    active
                      ? "bg-navy text-white shadow-xs"
                      : "bg-white text-slate ring-1 ring-mist hover:text-navy hover:ring-navy/25",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className={clsx("mt-8 rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-16px_rgba(11,26,92,0.12)] ring-1 ring-mist/90", bn && "font-bangla")}>
            <p className="text-sm font-bold text-navy">
              {bn ? "সম্পূর্ণ মডেল কার্ড বা এপিআই ডকুমেন্টেশন দরকার?" : "Need the full model card or API spec?"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate">
              {bn
                ? "আমাদের কারিগরি ডকুমেন্টেশনে প্রতিটি যাচাই মেট্রিক, OpenAPI রুট ও নিরাপত্তা নিয়ন্ত্রণ দেখুন।"
                : "Inspect every validation metric, OpenAPI route, and security control in our technical docs."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                href="/docs"
                className="group inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors hover:bg-royal hover:text-white hover:ring-royal"
              >
                <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                {bn ? "ডকস পড়ুন" : "Read docs"}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-royal ring-1 ring-mist transition-colors hover:border-royal hover:text-navy"
              >
                <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
                {bn ? "টিমকে জিজ্ঞেস করুন" : "Ask the team"}
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {visible.map((item) => {
            const idx = FAQ.indexOf(item) + 1;
            const num = String(idx).padStart(2, "0");
            return (
              <details
                key={item.qEn}
                className="group overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/90 transition-all duration-200 hover:ring-royal/30 open:ring-royal/35 open:shadow-[0_14px_34px_-18px_rgba(47,91,255,0.18)] [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-royal">
                  <span className="flex items-center gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-bold text-slate ring-1 ring-mist transition-colors group-open:bg-navy group-open:text-white group-open:ring-navy tnum">
                      {num}
                    </span>
                    <span className={clsx("text-[15px] font-bold leading-snug text-navy transition-colors group-hover:text-royal group-open:text-royal sm:text-base", bn && "font-bangla")}>
                      {bn ? item.qBn : item.qEn}
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-royal ring-1 ring-mist transition-all duration-200 group-open:bg-royal group-open:text-white group-open:ring-royal">
                    <Plus
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 group-open:rotate-45"
                    />
                  </span>
                </summary>
                <div className="border-t border-mist/70 mx-4 pt-3.5 pb-4 sm:mx-5 sm:pt-4 sm:pb-5">
                  <p className={clsx("max-w-[64ch] text-sm leading-7 text-slate sm:pl-10", bn && "font-bangla")}>
                    {bn ? item.aBn : item.aEn}
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
