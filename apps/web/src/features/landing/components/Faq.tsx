"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, MessageSquareText, Plus } from "@/components/icons";
import { clsx } from "clsx";

type FaqTopic = "all" | "model" | "ops" | "trust";

// Every answer restates facts from TASK.md, ARCHITECTURE.md or the live validation endpoint.
const FAQ = [
  {
    topic: "model",
    q: "Is this real outbreak data?",
    a: "It is the organisers' dataset: 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur and Narayanganj, weekly from January 2016 to December 2025. It looks simulated, so treat the accuracy figures as a demonstration, not a real-world claim.",
  },
  {
    topic: "model",
    q: "How far ahead does it see?",
    a: "One to four weeks for every ward. The rain signal is strongest three weeks out: cases correlate 0.47 with rain three weeks earlier once the season is removed, against 0.03 for the same week.",
  },
  {
    topic: "model",
    q: "How accurate is it?",
    a: "On 2024 and 2025, years locked away before training and scored once, the three-week forecast misses by about one case per ward-week on average, 20% less than each ward's seasonal average. Every forecast carries an 80% range so officers see the uncertainty.",
  },
  {
    topic: "ops",
    q: "What does it cost a health office to run?",
    a: "Nothing beyond a laptop. The model is a 954 KiB file that answers in under a millisecond per ward on the CPU. Live weather is one Open-Meteo request for all five cities every six hours. The optional Claude Haiku advisory has a hard cap of one dollar a day; without a key a free template writes the same advice.",
  },
  {
    topic: "ops",
    q: "Does it need the internet?",
    a: "No. The dashboard runs offline from the dataset. Live weather, the advisory text, the map tiles and sign-in are optional extras.",
  },
  {
    topic: "ops",
    q: "How long does setup take for a city health office?",
    a: "Under three minutes on a standard Windows, macOS, or Linux laptop. One command installs dependencies, seeds the local SQLite database, verifies the committed model artifact, and launches both the API and dashboard — zero API keys required.",
  },
  {
    topic: "trust",
    q: "How is health and citizen data protected?",
    a: "Abhas stores ward-level aggregate case counts and weather variables only — zero patient names, IDs, phone numbers, or clinical records ever enter the system. It can run completely air-gapped on office hardware, and passes 30/30 automated API & AI security tests.",
  },
  {
    topic: "trust",
    q: "How do pilot onboarding and support work?",
    a: "City corporations and public health teams can request a zero-fee pilot directly from this page or via WhatsApp. We help map your weekly ward surveillance spreadsheet to Abhas's schema and train zonal health officers in Bangla and English.",
  },
  {
    topic: "model",
    q: "Why are ward positions on the map approximate?",
    a: "The dataset has ward numbers but no boundaries, so each ward is placed near its city corporation's real centre. Abhas never draws ward outlines it does not have.",
  },
] as const;

const TOPICS: ReadonlyArray<{ id: FaqTopic; label: string }> = [
  { id: "all", label: "All (9)" },
  { id: "model", label: "Model & Data" },
  { id: "ops", label: "Setup & Cost" },
  { id: "trust", label: "Privacy & Pilots" },
];

export function Faq() {
  const [topic, setTopic] = useState<FaqTopic>("all");

  const visible = topic === "all" ? FAQ : FAQ.filter((item) => item.topic === topic);

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 border-t border-mist bg-paper/75 px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <h2
            id="faq-heading"
            className="text-balance text-[clamp(2rem,3.8vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy"
          >
            Questions officers ask first.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-7 text-slate">
            Short answers, with the measured numbers behind them.
          </p>

          {/* Topic filter pills */}
          <div
            role="group"
            aria-label="Filter questions by topic"
            className="mt-7 flex flex-wrap gap-1.5"
          >
            {TOPICS.map((item) => {
              const active = topic === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(item.id)}
                  className={clsx(
                    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
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

          {/* Technical docs & direct desk helper card */}
          <div className="mt-8 rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-16px_rgba(11,26,92,0.12)] ring-1 ring-mist/90">
            <p className="text-sm font-bold text-navy">Need the full model card or API spec?</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              Inspect every validation metric, OpenAPI route, and security control in our technical docs.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                href="/docs"
                className="group inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors hover:bg-royal hover:text-white hover:ring-royal"
              >
                <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                Read docs
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
                Ask the team
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
                key={item.q}
                className="group overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/90 transition-all duration-200 hover:ring-royal/30 open:ring-royal/35 open:shadow-[0_14px_34px_-18px_rgba(47,91,255,0.18)] [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-royal">
                  <span className="flex items-center gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-bold text-slate ring-1 ring-mist transition-colors group-open:bg-navy group-open:text-white group-open:ring-navy tnum">
                      {num}
                    </span>
                    <span className="text-[15px] font-bold leading-snug text-navy transition-colors group-hover:text-royal group-open:text-royal sm:text-base">
                      {item.q}
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-royal ring-1 ring-mist transition-all duration-200 group-open:bg-royal group-open:text-white group-open:ring-royal">
                    <Plus
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 group-open:rotate-45"
                    />
                  </span>
                </summary>
                <div className="border-t border-mist/70 mx-5 pt-4 pb-5">
                  <p className="max-w-[64ch] pl-10 text-sm leading-7 text-slate">{item.a}</p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
