"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
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

type FilterMode = "all" | "live" | "roadmap";

const INTEGRATIONS = [
  {
    nameEn: "Open-Meteo Weather API",
    nameBn: "Open-Meteo আবহাওয়া এপিআই",
    statusEn: "Live",
    statusBn: "সক্রিয়",
    live: true,
    icon: CloudRain,
    detailEn: "Batched 5-city forecast & historical rainfall feed, cached 6 hours with zero API keys required.",
    detailBn: "পাঁচ শহরের পূর্বাভাস ও ঐতিহাসিক বৃষ্টির তথ্য এক কলেই আনা হয়, ৬ ঘণ্টা ক্যাশ থাকে, কোনো এপিআই কী লাগে না।",
    specsEn: ["4 calls/day", "6h cache", "CC BY 4.0"],
    specsBn: ["৪ কল/দিন", "৬ ঘণ্টা ক্যাশ", "CC BY 4.0"],
  },
  {
    nameEn: "Gemini 2.5 Flash & Claude Haiku",
    nameBn: "Gemini 2.5 Flash ও Claude Haiku",
    statusEn: "Live (optional)",
    statusBn: "সক্রিয় (ঐচ্ছিক)",
    live: true,
    icon: Sparkles,
    detailEn: "Built-in Abhas AI assistant and optional bilingual officer briefings capped at $1/day with offline fallback.",
    detailBn: "আভাস এআই সহকারী ও বাংলা-ইংরেজি কর্মকর্তা ব্রিফিং — দিনে সর্বোচ্চ $১ সীমাবদ্ধ, অফলাইন ফলব্যাকসহ।",
    specsEn: ["$1/day cap", "EN / বাংলা", "Offline fallback"],
    specsBn: ["দিনে সর্বোচ্চ $১", "বাংলা / ইংরেজি", "অফলাইন ফলব্যাক"],
  },
  {
    nameEn: "CSV & Printable A4 Briefs",
    nameBn: "CSV ও প্রিন্টযোগ্য এ৪ নোটিশ",
    statusEn: "Live",
    statusBn: "সক্রিয়",
    live: true,
    icon: FileSpreadsheet,
    detailEn: "Formula-safe CSV priority exports for Excel/MIS teams and print-ready bilingual ward field notices.",
    detailBn: "এক্সেল/এমআইএস টিমের জন্য নিরাপদ CSV এক্সপোর্ট এবং মাঠকর্মীদের প্রিন্টযোগ্য এ৪ ওয়ার্ড নোটিশ।",
    specsEn: ["Formula-safe CSV", "A4 print layout"],
    specsBn: ["নিরাপদ CSV", "এ৪ প্রিন্ট ফরম্যাট"],
  },
  {
    nameEn: "Bangladesh SMS Gateways",
    nameBn: "বাংলাদেশ এসএমএস গেটওয়ে",
    statusEn: "Pilot roadmap",
    statusBn: "পাইলট রোডম্যাপ",
    live: false,
    icon: MessageSquare,
    detailEn: "Pre-formatted ≤ 160-character ward alerts engineered for municipal bulk-SMS dispatch during city pilots.",
    detailBn: "সিটি পাইলটের সময় বাল্ক-এসএমএস পাঠানোর জন্য ≤ ১৬০ অক্ষরের প্রস্তুত ওয়ার্ড সতর্কবার্তা।",
    specsEn: ["≤ 160 chars", "GSM-7 single part"],
    specsBn: ["≤ ১৬০ অক্ষর", "একক এসএমএস"],
  },
  {
    nameEn: "DGHS MIS / City Health Feeds",
    nameBn: "DGHS MIS / সিটি স্বাস্থ্য ফিড",
    statusEn: "Pilot roadmap",
    statusBn: "পাইলট রোডম্যাপ",
    live: false,
    icon: Database,
    detailEn: "Drop-in weekly ward case ingestion schema ready to connect directly to live municipal surveillance pipelines.",
    detailBn: "সরাসরি সরকারি সাপ্তাহিক ডেঙ্গু সার্ভেইল্যান্স ডেটার সাথে যুক্ত হওয়ার জন্য প্রস্তুত ডেটাবেস স্কিমা।",
    specsEn: ["Alembic schema", "SQLite / Postgres"],
    specsBn: ["Alembic স্কিমা", "SQLite / Postgres"],
  },
] as const;

const TRUST_PILLARS = [
  {
    icon: Lock,
    metric: "0 PII",
    titleEn: "Zero patient PII stored",
    titleBn: "কোনো রোগীর ব্যক্তিগত তথ্য নেই",
    detailEn: "Abhas processes ward-level aggregate counts and weather only — never names, phone numbers, or clinical records.",
    detailBn: "আভাস শুধু ওয়ার্ডভিত্তিক মোট সংখ্যা ও আবহাওয়া বিশ্লেষণ করে — রোগীর নাম, ফোন বা চিকিৎসা নথি কখনো নেয় না।",
  },
  {
    icon: Database,
    metric: "954.6 KiB",
    titleEn: "Offline-first on local hardware",
    titleBn: "অফিস ল্যাপটপে অফলাইন-ফার্স্ট",
    detailEn: "The 954.6 KiB LightGBM model and SQLite database run inside a health office with zero external keys required.",
    detailBn: "৯৫৪.৬ কি.বা. মডেল ও লোকাল ডেটাবেস কোনো বাহ্যিক কী ছাড়াই স্বাস্থ্য দপ্তরের কম্পিউটারে চলে।",
  },
  {
    icon: ShieldCheck,
    metric: "30 / 30",
    titleEn: "AI & API red-team checks passing",
    titleBn: "৩০/৩০ এআই ও এপিআই নিরাপত্তা পাস",
    detailEn: "Prompt-injection isolation, streaming 64 KiB body caps, strict rate limits, secret redaction, and RFC 9457 errors.",
    detailBn: "প্রম্পট-ইনজেকশন সুরক্ষা, ৬৪ কি.বা. বডি সীমা, রেট লিমিট, সিক্রেট গোপন ও মানসম্মত এরর কাঠামো।",
  },
  {
    icon: CheckCircle2,
    metric: "2024–25",
    titleEn: "Honest validation & model card",
    titleBn: "স্বচ্ছ যাচাই ও মডেল কার্ড",
    detailEn: "Hold-out 2024–2025 metrics are locked and auditable; simulated-dataset limitations are disclosed openly.",
    detailBn: "২০২৪–২০২৫ হোল্ড-আউট ফলাফল লকড ও যাচাইযোগ্য; ডেটাসেটের সীমাবদ্ধতা খোলামেলাভাবে উল্লেখ করা হয়েছে।",
  },
] as const;

export function IntegrationsAndTrust() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const [filter, setFilter] = useState<FilterMode>("all");

  const visibleIntegrations = INTEGRATIONS.filter((item) => {
    if (filter === "live") return item.live;
    if (filter === "roadmap") return !item.live;
    return true;
  });

  const liveCount = INTEGRATIONS.filter((item) => item.live).length;
  const roadmapCount = INTEGRATIONS.length - liveCount;

  return (
    <section
      id="security"
      aria-labelledby="integrations-heading"
      lang={lang}
      className="relative scroll-mt-20 overflow-hidden border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_50%_at_75%_0%,rgba(47,91,255,0.045),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl space-y-20">
        {/* Top half: Integrations */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14">
          <div className="lg:sticky lg:top-28">
            <h2
              id="integrations-heading"
              className={clsx(
                "text-balance text-[clamp(1.85rem,3.4vw,2.75rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy",
                bn && "font-bangla leading-tight tracking-normal",
              )}
            >
              {bn
                ? "বিদ্যমান সরকারি ও আবহাওয়া ব্যবস্থার সাথে সহজে যুক্ত হয়।"
                : "Built to connect with how health offices already work."}
            </h2>
            <p className={clsx("mt-4 text-base leading-7 text-slate", bn && "font-bangla")}>
              {bn
                ? "আজই কাজ করে Open-Meteo, CSV এক্সপোর্ট ও এআই ব্রিফিং — এবং পাইলট পর্যায়ে স্থানীয় SMS গেটওয়ে ও DGHS ডেটা ফিড যুক্ত করার জন্য প্রস্তুত।"
                : "Open-Meteo weather, safe CSV exports, and bilingual AI briefings work out of the box. Municipal SMS gateways and DGHS surveillance feeds are schema-ready for city pilots."}
            </p>

            {/* Readiness summary strip */}
            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-paper/85 p-4 ring-1 ring-mist/90">
                <p className="text-2xl font-extrabold tracking-tight text-navy tnum">{liveCount}</p>
                <p className={clsx("mt-0.5 text-xs font-medium text-slate", bn && "font-bangla")}>
                  {bn ? "আজই ব্যবহারযোগ্য" : "Live out of the box"}
                </p>
              </div>
              <div className="rounded-2xl bg-paper/85 p-4 ring-1 ring-mist/90">
                <p className="text-2xl font-extrabold tracking-tight text-navy tnum">{roadmapCount}</p>
                <p className={clsx("mt-0.5 text-xs font-medium text-slate", bn && "font-bangla")}>
                  {bn ? "পাইলট-প্রস্তুত স্কিমা" : "Pilot-ready schemas"}
                </p>
              </div>
            </div>

            {/* Interactive connector filter */}
            <div
              role="group"
              aria-label={bn ? "ইন্টিগ্রেশন ফিল্টার করুন" : "Filter integrations by status"}
              className="mt-5 inline-flex flex-wrap items-center gap-1 rounded-full bg-paper p-1 ring-1 ring-mist/90"
            >
              {(
                [
                  { id: "all", label: bn ? `সব (${INTEGRATIONS.length})` : `All (${INTEGRATIONS.length})` },
                  { id: "live", label: bn ? `সক্রিয় (${liveCount})` : `Live (${liveCount})` },
                  { id: "roadmap", label: bn ? `পাইলট (${roadmapCount})` : `Pilot roadmap (${roadmapCount})` },
                ] as const
              ).map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(tab.id)}
                    className={clsx(
                      "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                      bn && "font-bangla",
                      active ? "bg-navy text-white shadow-xs" : "text-slate hover:text-navy",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connector card stack */}
          <ul className="space-y-2.5 rounded-[22px] bg-paper/70 p-2.5 ring-1 ring-mist/90">
            {visibleIntegrations.map((item) => {
              const Icon = item.icon;
              const specs = bn ? item.specsBn : item.specsEn;
              return (
                <li
                  key={item.nameEn}
                  className="group rounded-[16px] bg-white p-4 shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/85 transition-all duration-200 hover:ring-royal/30 hover:shadow-[0_10px_24px_-14px_rgba(47,91,255,0.18)] sm:p-5"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={clsx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors duration-200",
                        item.live
                          ? "bg-royal/[0.08] text-royal ring-royal/15 group-hover:bg-royal group-hover:text-white group-hover:ring-royal"
                          : "bg-paper text-slate ring-mist group-hover:bg-navy/5 group-hover:text-navy",
                      )}
                    >
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={clsx("text-[15px] font-bold tracking-tight text-navy", bn && "font-bangla")}>
                          {bn ? item.nameBn : item.nameEn}
                        </p>
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            bn && "font-bangla",
                            item.live
                              ? "bg-royal/10 text-navy ring-1 ring-royal/15"
                              : "bg-paper text-slate ring-1 ring-mist",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={clsx("h-1.5 w-1.5 rounded-full", item.live ? "bg-royal" : "bg-slate/50")}
                          />
                          {bn ? item.statusBn : item.statusEn}
                        </span>
                      </div>

                      <p className={clsx("mt-1.5 text-sm leading-6 text-slate", bn && "font-bangla")}>
                        {bn ? item.detailBn : item.detailEn}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {specs.map((spec) => (
                          <span
                            key={spec}
                            className={clsx(
                              "rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-slate ring-1 ring-mist/80 tnum",
                              bn && "font-bangla",
                            )}
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Bottom half: Obsidian-Navy Security & Trust Vault */}
        <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(145deg,#0B0F14_0%,#0B1A5C_64%,#15319A_100%)] p-7 text-white shadow-[0_2px_6px_rgba(11,15,20,0.2),0_30px_64px_-26px_rgba(11,26,92,0.48)] ring-1 ring-white/10 sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-royal/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-royal/15 blur-3xl"
          />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-sm sm:flex">
                <ShieldCheck aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="max-w-2xl">
                <h3
                  className={clsx(
                    "text-2xl font-extrabold tracking-[-0.025em] text-white sm:text-[1.75rem]",
                    bn && "font-bangla tracking-normal",
                  )}
                >
                  {bn ? "নিরাপত্তা, গোপনীয়তা ও জনস্বাস্থ্য আস্থা" : "Security, privacy, and public-sector trust"}
                </h3>
                <p className={clsx("mt-2 text-sm leading-6 text-mist/90", bn && "font-bangla")}>
                  {bn
                    ? "যাচাইযোগ্য নিরাপত্তা কাঠামো — কোনো কাল্পনিক সার্টিফিকেট নয়, শুধুমাত্র আমাদের CI পাইপলাইনে পরীক্ষিত নিয়ন্ত্রণ।"
                    : "Verifiable security posture — no invented compliance logos, only controls tested in our CI pipeline."}
                </p>
              </div>
            </div>

            <Link
              href="/security"
              className={clsx(
                "group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-navy shadow-sm transition-all hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                bn && "font-bangla",
              )}
            >
              <Lock aria-hidden="true" className="h-4 w-4 text-royal" />
              {bn ? "নিরাপত্তা কাঠামো পড়ুন" : "Read security architecture"}
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <div className="relative mt-8 grid gap-4 border-t border-white/12 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.titleEn}
                  className="flex flex-col rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/12 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.09] hover:ring-white/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
                      <Icon aria-hidden="true" className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-base font-extrabold tracking-tight text-white tnum">
                      {pillar.metric}
                    </span>
                  </div>
                  <p className={clsx("mt-4 text-[15px] font-bold leading-snug text-white", bn && "font-bangla")}>
                    {bn ? pillar.titleBn : pillar.titleEn}
                  </p>
                  <p className={clsx("mt-1.5 text-sm leading-6 text-mist/85", bn && "font-bangla")}>
                    {bn ? pillar.detailBn : pillar.detailEn}
                  </p>
                </div>
              );
            })}
          </div>

          <div className={clsx("relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-mist/80", bn && "font-bangla")}>
            <p>
              {bn
                ? "CI-পরীক্ষিত নিয়ন্ত্রণ: প্রম্পট-ইনজেকশন সুরক্ষা · ৬৪ কি.বা. বডি সীমা · RFC 9457 এরর · সিক্রেট গোপন"
                : "CI-enforced controls: prompt-injection suite · 64 KiB body caps · RFC 9457 errors · secret redaction"}
            </p>
            <Link
              href="/status"
              className="group inline-flex items-center gap-1 font-semibold text-white transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
            >
              {bn ? "লাইভ সিস্টেম স্ট্যাটাস দেখুন" : "Inspect live system status"}
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
