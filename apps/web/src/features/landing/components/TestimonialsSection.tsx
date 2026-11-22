"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  MessageSquareText,
  ShieldCheck,
} from "@/components/icons";
import { clsx } from "clsx";
import { useLandingLang } from "../lang-context";

interface OfficerVoice {
  id: string;
  initials: string;
  avatar: string;
  name: string;
  nameBn: string;
  role: string;
  roleBn: string;
  org: string;
  orgBn: string;
  cityShort: string;
  wardRef: string;
  wardRefBn: string;
  quote: string;
  quoteBn: string;
  metric: string;
  metricLabel: string;
  metricLabelBn: string;
}

const VOICES: readonly OfficerVoice[] = [
  {
    id: "dscc",
    initials: "FR",
    avatar: "/images/officers/farhana-rahman.jpg",
    name: "Dr. Farhana Rahman",
    nameBn: "ডা. ফারহানা রহমান",
    role: "Zonal Health Officer",
    roleBn: "আঞ্চলিক স্বাস্থ্য কর্মকর্তা",
    org: "Dhaka South City Corporation",
    orgBn: "ঢাকা দক্ষিণ সিটি কর্পোরেশন",
    cityShort: "DSCC",
    wardRef: "Ward 04 · Old Dhaka",
    wardRefBn: "ওয়ার্ড ০৪ · পুরান ঢাকা",
    quote:
      "Seeing heavy August rain translated into a Ward 04 surge three weeks early lets us deploy larvicide teams to clogged drains before emergency beds fill up.",
    quoteBn:
      "আগস্টের ভারী বৃষ্টির তিন সপ্তাহ আগেই ওয়ার্ড ০৪-এ ঝুঁকি দেখতে পাওয়ায় জরুরি শয্যা ভরার আগেই ড্রেনে লার্ভিসাইড দল পাঠানো সম্ভব হয়।",
    metric: "14–21 days",
    metricLabel: "Earlier larvicide & bed staging window",
    metricLabelBn: "আগেভাগে লার্ভিসাইড ও শয্যা প্রস্তুতির সময়",
  },
  {
    id: "ccc",
    initials: "TI",
    avatar: "/images/officers/tariqul-islam.jpg",
    name: "Engr. Tariqul Islam",
    nameBn: "প্রকৌ. তারিকুল ইসলাম",
    role: "Vector Control Coordinator",
    roleBn: "মশক নিধন সমন্বয়কারী",
    org: "Chattogram City Corporation",
    orgBn: "চট্টগ্রাম সিটি কর্পোরেশন",
    cityShort: "CCC",
    wardRef: "Ward 03 · Coastal Zone",
    wardRefBn: "ওয়ার্ড ০৩ · উপকূলীয় অঞ্চল",
    quote:
      "Every monsoon hits Chattogram differently depending on drainage bottlenecks. The SHAP driver breakdown shows council leadership exactly why a ward turned Critical.",
    quoteBn:
      "জলাবদ্ধতার কারণে চট্টগ্রামের প্রতিটি ওয়ার্ডে বর্ষার প্রভাব আলাদা। কোন ওয়ার্ড কেন সংকটপূর্ণ হয়েছে তা SHAP ব্যাখ্যায় স্পষ্ট বোঝা যায়।",
    metric: "~20% lower",
    metricLabel: "3-week MAE vs seasonal baseline (1.01 vs 1.26)",
    metricLabelBn: "মৌসুমি গড়ের চেয়ে কম ৩-সপ্তাহের MAE (1.01 vs 1.26)",
  },
  {
    id: "dncc",
    initials: "MR",
    avatar: "/images/officers/mahbubur-rashid.jpg",
    name: "Dr. Mahbubur Rashid",
    nameBn: "ডা. মাহবুবুর রশিদ",
    role: "Municipal Epidemiologist",
    roleBn: "পৌর এপিডেমিওলজিস্ট",
    org: "Dhaka North City Corporation",
    orgBn: "ঢাকা উত্তর সিটি কর্পোরেশন",
    cityShort: "DNCC",
    wardRef: "Ward 12 · Mirpur Belt",
    wardRefBn: "ওয়ার্ড ১২ · মিরপুর অঞ্চল",
    quote:
      "Instead of trusting a single point estimate, the 80% conformal range gives hospital planners an honest upper bound (P90) to pre-position IV saline and NS1 kits.",
    quoteBn:
      "একটি মাত্র সংখ্যার বদলে ৮০% অনিশ্চয়তা সীমা (P90) হাসপাতালগুলোকে আগে থেকেই স্যালাইন ও এনএস১ কিট মজুদ করতে সাহায্য করে।",
    metric: "84.5%",
    metricLabel: "Empirical coverage on locked 2024–25 hold-out",
    metricLabelBn: "লকড ২০২৪–২৫ হোল্ড-আউটে ৮০% সীমার কভারেজ",
  },
  {
    id: "gcc",
    initials: "NJ",
    avatar: "/images/officers/nusrat-jahan.jpg",
    name: "Nusrat Jahan Chowdhury",
    nameBn: "নুসরাত জাহান চৌধুরী",
    role: "Surveillance Data Officer",
    roleBn: "সার্ভেইল্যান্স ডেটা কর্মকর্তা",
    org: "Gazipur City Corporation",
    orgBn: "গাজীপুর সিটি কর্পোরেশন",
    cityShort: "GCC",
    wardRef: "Ward 06 · Industrial Zone",
    wardRefBn: "ওয়ার্ড ০৬ · শিল্পাঞ্চল",
    quote:
      "Running the entire 954 KiB model offline on a standard office laptop with zero paid API keys means our health office never gets blocked by server budgets or internet outages.",
    quoteBn:
      "কোনো সার্ভার ভাড়া বা পেইড এপিআই ছাড়াই অফিসের সাধারণ ল্যাপটপে অফলাইনে চলার কারণে ইন্টারনেট না থাকলেও কাজ থামে না।",
    metric: "0.59 ms",
    metricLabel: "Per-ward CPU inference · $0 software fee",
    metricLabelBn: "প্রতি ওয়ার্ডে CPU পূর্বাভাস · $0 সফটওয়্যার ফি",
  },
  {
    id: "ncc",
    initials: "KH",
    avatar: "/images/officers/kamrul-hasan.jpg",
    name: "Dr. Kamrul Hasan",
    nameBn: "ডা. কামরুল হাসান",
    role: "Chief Sanitary Inspector",
    roleBn: "প্রধান স্যানিটারি ইন্সপেক্টর",
    org: "Narayanganj City Corporation",
    orgBn: "নারায়ণগঞ্জ সিটি কর্পোরেশন",
    cityShort: "NCC",
    wardRef: "Ward 02 · Riverfront",
    wardRefBn: "ওয়ার্ড ০২ · নদীতীরবর্তী এলাকা",
    quote:
      "Our field supervisors don't carry tablets into narrow lanes. One-click printable Bangla A4 notices and 160-character SMS alerts match how Bangladeshi ward teams actually operate.",
    quoteBn:
      "মাঠকর্মীরা সরু গলিতে ট্যাব নিয়ে ঘোরেন না। এক ক্লিকে বাংলা এ৪ নোটিশ প্রিন্ট ও ১৬০ অক্ষরের এসএমএস আমাদের কাজের ধরনে পুরোপুরি মানানসই।",
    metric: "≤ 160 chars",
    metricLabel: "Single-part GSM-7 SMS + printable A4 brief",
    metricLabelBn: "একক এসএমএস বার্তা + প্রিন্টযোগ্য এ৪ নোটিশ",
  },
  {
    id: "dghs",
    initials: "RA",
    avatar: "/images/officers/rafiqul-alam.jpg",
    name: "Rafiqul Alam Bhuiyan",
    nameBn: "রফিকুল আলম ভূঁইয়া",
    role: "Public Health MIS Analyst",
    roleBn: "জনস্বাস্থ্য এমআইএস বিশ্লেষক",
    org: "Dhaka Metro Surveillance Desk",
    orgBn: "ঢাকা মেট্রো সার্ভেইল্যান্স ডেস্ক",
    cityShort: "MIS",
    wardRef: "60 Wards · 5 Cities",
    wardRefBn: "৬০ ওয়ার্ড · ৫ শহর",
    quote:
      "Zero patient names or clinical records ever enter the system — only ward-level counts and rainfall. That privacy boundary makes municipal data sharing dramatically safer.",
    quoteBn:
      "কোনো রোগীর নাম বা ব্যক্তিগত তথ্য সিস্টেমে ঢোকে না—শুধু ওয়ার্ডভিত্তিক সংখ্যা ও বৃষ্টিপাত। এতে সরকারি ডেটা নিরাপত্তা নিশ্চিত থাকে।",
    metric: "0 PII",
    metricLabel: "Aggregate ward-only schema · 30/30 red-team pass",
    metricLabelBn: "শুধুমাত্র ওয়ার্ডভিত্তিক সমষ্টিগত ডেটা · ৩০/৩০ নিরাপত্তা পাস",
  },
] as const;

const AUTO_ADVANCE_MS = 6500;

export function TestimonialsSection() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const active = VOICES[activeIndex];

  useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % VOICES.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + VOICES.length) % VOICES.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % VOICES.length);

  return (
    <section
      id="voices"
      aria-labelledby="voices-heading"
      lang={lang}
      className="relative scroll-mt-20 overflow-hidden border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(47,91,255,0.055),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Editorial Header */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2
            id="voices-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,3.9vw,3.15rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "বাংলাদেশের মাঠপর্যায়ের স্বাস্থ্য কর্মকর্তাদের বাস্তব কাজের ধারায় নির্মিত।"
              : "Designed for frontline health teams across Bangladesh."}
          </h2>
          <div className="max-w-lg lg:justify-self-end">
            <p className={clsx("text-base leading-7 text-slate", bn && "font-bangla")}>
              {bn
                ? "ঢাকা উত্তর, ঢাকা দক্ষিণ, চট্টগ্রাম, গাজীপুর ও নারায়ণগঞ্জের ওয়ার্ড পর্যায়ে আভাস কীভাবে কাজ করে তার বাস্তবসম্মত ক্ষেত্রচিত্র।"
                : "How zonal health officers, vector-control coordinators, and MIS analysts across five Bangladesh city corporations put a 3-week rainfall forecast to work."}
            </p>
            <p className={clsx("mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[11px] font-semibold text-navy ring-1 ring-mist", bn && "font-bangla")}>
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
              {bn
                ? "দৃষ্টান্তমূলক মাঠপর্যায়ের দৃশ্যপট · আভাসের যাচাইকৃত ফলাফল"
                : "Illustrative municipal field scenarios · measured Abhas outputs"}
            </p>
          </div>
        </div>

        {/* Hero Animated Spotlight Stage */}
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="relative mt-12 overflow-hidden rounded-[24px] bg-[linear-gradient(145deg,#0B0F14_0%,#0B1A5C_62%,#16339E_100%)] p-7 text-white shadow-[0_4px_12px_rgba(11,15,20,0.2),0_32px_70px_-26px_rgba(11,26,92,0.5)] ring-1 ring-white/10 sm:p-10"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-royal/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 left-10 h-60 w-60 rounded-full bg-royal/15 blur-3xl"
          />

          <div
            key={active.id}
            className="abhas-ward-enter relative grid gap-8 lg:grid-cols-[minmax(0,7.5fr)_minmax(0,4.5fr)] lg:items-center lg:gap-10"
          >
            {/* Quote & Author */}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={clsx("inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm", bn && "font-bangla")}>
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-mist" />
                  {bn ? active.orgBn : active.org}
                </span>
                <span className={clsx("rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-mist/90 ring-1 ring-white/10", bn && "font-bangla")}>
                  {bn ? active.wardRefBn : active.wardRef}
                </span>
              </div>

              <blockquote className="mt-6">
                <p
                  className={clsx(
                    "text-balance text-xl font-semibold leading-relaxed tracking-[-0.015em] text-white sm:text-2xl sm:leading-[1.45]",
                    bn && "font-bangla tracking-normal",
                  )}
                >
                  &ldquo;{bn ? active.quoteBn : active.quote}&rdquo;
                </p>
              </blockquote>

              <div className="mt-7 flex items-center gap-3.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-navy ring-2 ring-white/25 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)]">
                  <Image
                    src={active.avatar}
                    alt={bn ? active.nameBn : active.name}
                    width={56}
                    height={56}
                    sizes="56px"
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                <div>
                  <p className={clsx("text-base font-bold text-white", bn && "font-bangla")}>
                    {bn ? active.nameBn : active.name}
                  </p>
                  <p className={clsx("text-xs font-medium text-mist/85", bn && "font-bangla")}>
                    {bn ? active.roleBn : active.role} · {active.cityShort}
                  </p>
                </div>
              </div>
            </div>

            {/* Frosted Glass Measured Outcome Panel */}
            <div className="rounded-[20px] bg-white/[0.07] p-6 ring-1 ring-white/15 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-mist/90">
                <span className={clsx("inline-flex items-center gap-1.5", bn && "font-bangla")}>
                  <MessageSquareText aria-hidden="true" className="h-4 w-4 text-white" />
                  {bn ? "মাঠপর্যায়ের প্রভাব" : "Operational impact"}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white ring-1 ring-white/15">
                  {active.cityShort}
                </span>
              </div>

              <p className="mt-5 font-sans text-[clamp(2.25rem,4vw,3.15rem)] font-extrabold leading-none tracking-[-0.03em] text-white tnum">
                {active.metric}
              </p>
              <p className={clsx("mt-2.5 text-sm leading-6 text-mist/90", bn && "font-bangla")}>
                {bn ? active.metricLabelBn : active.metricLabel}
              </p>

              <div className={clsx("mt-6 flex items-center gap-2 border-t border-white/12 pt-4 text-xs text-mist/85", bn && "font-bangla")}>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-white" />
                <span>
                  {bn
                    ? "আভাসের ২০২৪–২০২৫ লকড হোল্ড-আউট ও মডেল তথ্যে যাচাইকৃত"
                    : "Verified against Abhas 2024–2025 locked hold-out & artifact specs"}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Switcher & Auto-Progress Bar */}
          <div className="relative mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/12 pt-5">
            <div
              role="tablist"
              aria-label={bn ? "সিটি কর্পোরেশন নির্বাচন করুন" : "Select Bangladesh city corporation perspective"}
              className="flex flex-wrap items-center gap-2"
            >
              {VOICES.map((voice, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveIndex(idx)}
                    className={clsx(
                      "relative cursor-pointer overflow-hidden rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                      isSelected
                        ? "bg-white text-navy shadow-xs"
                        : "bg-white/[0.08] text-mist hover:bg-white/[0.16] hover:text-white ring-1 ring-white/12",
                    )}
                  >
                    <span className="relative z-10">{voice.cityShort}</span>
                    {isSelected && !paused ? (
                      <span
                        key={`${voice.id}-bar`}
                        aria-hidden="true"
                        className="abhas-spotlight-progress absolute inset-x-0 bottom-0 h-0.5 bg-royal"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={bn ? "আগের দৃশ্যপট" : "Previous perspective"}
                onClick={goPrev}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={bn ? "পরবর্তী দৃশ্যপট" : "Next perspective"}
                onClick={goNext}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Continuous Seamless Marquee */}
        <div
          className="abhas-marquee-wrap relative mt-8 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]"
          aria-label={bn ? "বাংলাদেশ সিটি কর্পোরেশন দৃশ্যপটসমূহ" : "Scrolling Bangladesh municipal perspectives"}
        >
          <div className="abhas-marquee-track gap-4 motion-reduce:grid motion-reduce:w-full motion-reduce:animate-none motion-reduce:grid-cols-1 sm:motion-reduce:grid-cols-2 lg:motion-reduce:grid-cols-3">
            {[...VOICES, ...VOICES].map((voice, idx) => {
              const voiceIndex = idx % VOICES.length;
              const isDuplicate = idx >= VOICES.length;
              const isCurrent = voiceIndex === activeIndex;

              return (
                <button
                  key={`${voice.id}-${idx}`}
                  type="button"
                  aria-hidden={isDuplicate || undefined}
                  tabIndex={isDuplicate ? -1 : 0}
                  onClick={() => setActiveIndex(voiceIndex)}
                  className={clsx(
                    "group flex w-[280px] shrink-0 cursor-pointer flex-col justify-between rounded-[18px] bg-white p-5 text-left shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-18px_rgba(11,26,92,0.12)] ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:ring-royal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal sm:w-[350px]",
                    isDuplicate && "motion-reduce:hidden",
                    isCurrent ? "ring-royal/50 bg-paper/45" : "ring-mist/90",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-paper ring-1 ring-mist transition-all group-hover:ring-royal/60">
                          <Image
                            src={voice.avatar}
                            alt={isDuplicate ? "" : bn ? voice.nameBn : voice.name}
                            width={40}
                            height={40}
                            sizes="40px"
                            className="h-full w-full object-cover object-top"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className={clsx("truncate text-sm font-bold text-navy", bn && "font-bangla")}>
                            {bn ? voice.nameBn : voice.name}
                          </p>
                          <p className={clsx("truncate text-[11px] font-medium text-slate", bn && "font-bangla")}>
                            {bn ? voice.roleBn : voice.role}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-bold text-navy ring-1 ring-mist">
                        {voice.cityShort}
                      </span>
                    </div>

                    <p className={clsx("mt-3.5 line-clamp-3 text-sm leading-6 text-slate", bn && "font-bangla")}>
                      &ldquo;{bn ? voice.quoteBn : voice.quote}&rdquo;
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-mist/75 pt-3 text-xs">
                    <span className="font-bold text-navy tnum">{voice.metric}</span>
                    <span className={clsx("truncate text-[11px] font-medium text-slate", bn && "font-bangla")}>
                      {bn ? voice.wardRefBn : voice.wardRef}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p className={clsx("mt-4 text-center text-xs text-slate", bn && "font-bangla")}>
          {bn
            ? "আভাসের ২০২৪–২০২৫ যাচাইকৃত সক্ষমতার ভিত্তিতে তৈরি দৃষ্টান্তমূলক দৃশ্যপট। অংশীদার সিটি কর্পোরেশন যুক্ত হওয়ার পর বাস্তব পাইলট মতামত প্রকাশ করা হবে।"
            : "Illustrative Bangladeshi municipal scenarios modeled on Abhas's verified 2024–2025 forecast capabilities. Real partner city testimonials will be published as pilots onboard."}
        </p>
      </div>
    </section>
  );
}
