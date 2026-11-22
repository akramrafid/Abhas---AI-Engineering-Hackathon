"use client";

import Link from "next/link";
import {
  ArrowRight,
  CloudRain,
  Database,
  FileSpreadsheet,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "@/components/icons";
import { clsx } from "clsx";
import { useLandingLang } from "../lang-context";

const INTEGRATIONS = [
  {
    name: "Open-Meteo Weather API",
    status: "Live",
    live: true,
    icon: CloudRain,
    detail: "Batched 5-city forecast & historical rainfall feed, cached 6 hours (4 calls/day, CC BY 4.0, zero API key).",
  },
  {
    name: "Gemini 2.5 Flash & Claude Haiku",
    status: "Live (optional)",
    live: true,
    icon: Sparkles,
    detail: "Built-in Abhas AI assistant and optional bilingual officer briefings capped at $1/day with offline fallback.",
  },
  {
    name: "CSV & Printable A4 Briefs",
    status: "Live",
    live: true,
    icon: FileSpreadsheet,
    detail: "Formula-safe CSV priority exports for Excel/MIS teams and print-ready EN/বাংলা field notices.",
  },
  {
    name: "Bangladesh SMS Gateways",
    status: "Pilot roadmap",
    live: false,
    icon: MessageSquare,
    detail: "Pre-formatted ≤ 160-character ward alerts designed for municipal bulk-SMS dispatch during pilots.",
  },
  {
    name: "DGHS MIS / City Health Feeds",
    status: "Pilot roadmap",
    live: false,
    icon: Database,
    detail: "Drop-in weekly ward case ingestion schema (Alembic SQLite / Postgres) ready for live surveillance pipelines.",
  },
] as const;

const TRUST_PILLARS = [
  {
    title: "Zero patient PII stored",
    detail: "Abhas processes ward-level aggregate counts and weather only — never names, phone numbers, or clinical records.",
  },
  {
    title: "Offline-first on local hardware",
    detail: "The 954.6 KiB LightGBM model and SQLite database run inside a health office with zero external keys required.",
  },
  {
    title: "30/30 AI & API red-team checks passing",
    detail: "Prompt-injection isolation, streaming 64 KiB body caps, strict rate limits, secret redaction, and RFC 9457 errors.",
  },
  {
    title: "Honest validation & model card",
    detail: "Hold-out 2024–2025 metrics are locked and auditable; simulated-dataset limitations are disclosed openly.",
  },
] as const;

export function IntegrationsAndTrust() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  return (
    <section
      id="security"
      aria-labelledby="integrations-heading"
      className="scroll-mt-20 border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-28"
    >
      <div className="mx-auto max-w-6xl space-y-20">
        {/* Integrations */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div>
            <h2
              id="integrations-heading"
              lang={lang}
              className={clsx(
                "text-balance text-[clamp(1.75rem,3.2vw,2.6rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-navy",
                bn && "font-bangla leading-tight",
              )}
            >
              {bn
                ? "বিদ্যমান সরকারি ও আবহাওয়া ব্যবস্থার সাথে সহজে যুক্ত হয়।"
                : "Built to connect with how health offices already work."}
            </h2>
            <p
              lang={lang}
              className={clsx("mt-4 text-body leading-7 text-slate", bn && "font-bangla")}
            >
              {bn
                ? "আজই কাজ করে Open-Meteo, CSV এক্সপোর্ট ও এআই ব্রিফিং — এবং পাইলট পর্যায়ে স্থানীয় SMS গেটওয়ে ও DGHS ডেটা ফিড যুক্ত করার জন্য প্রস্তুত।"
                : "Open-Meteo weather, safe CSV exports, and bilingual AI briefings work out of the box. Municipal SMS gateways and DGHS surveillance feeds are schema-ready for city pilots."}
            </p>
          </div>

          <ul className="divide-y divide-mist border-y border-mist">
            {INTEGRATIONS.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.name}
                  className="grid gap-2 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start sm:gap-6"
                >
                  <div className="flex items-start gap-2.5">
                    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
                    <div>
                      <p className="text-sm font-bold text-navy">{item.name}</p>
                      <span
                        className={clsx(
                          "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          item.live
                            ? "bg-royal/10 text-royal"
                            : "bg-paper text-slate ring-1 ring-mist",
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-slate">{item.detail}</p>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Security & Trust */}
        <div className="rounded-[16px] border border-mist bg-paper p-6 sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-navy">
                <ShieldCheck aria-hidden="true" className="h-5 w-5 text-royal" />
                <h3
                  lang={lang}
                  className={clsx(
                    "text-2xl font-extrabold tracking-[-0.025em] text-navy",
                    bn && "font-bangla",
                  )}
                >
                  {bn ? "নিরাপত্তা, গোপনীয়তা ও স্বচ্ছতা" : "Security, privacy, and public-sector trust"}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate">
                Verifiable security posture — no invented compliance logos, only controls tested in our CI pipeline.
              </p>
            </div>
            <Link
              href="/security"
              className="group inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-mist bg-white px-4 text-sm font-semibold text-navy transition-colors hover:border-royal hover:text-royal"
            >
              <Lock aria-hidden="true" className="h-3.5 w-3.5" />
              Read security architecture
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <dl className="mt-8 grid gap-6 border-t border-mist pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_PILLARS.map((pillar) => (
              <div key={pillar.title}>
                <dt className="text-sm font-bold text-navy">{pillar.title}</dt>
                <dd className="mt-1.5 text-sm leading-6 text-slate">{pillar.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
