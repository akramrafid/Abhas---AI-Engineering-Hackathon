"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudRain,
  FileSpreadsheet,
  LineChart,
  Printer,
  Timer,
} from "@/components/icons";
import { clsx } from "clsx";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { useLandingLang } from "../lang-context";

const PAIN_POINTS = [
  {
    num: "01",
    icon: Clock3,
    titleEn: "Blind until admissions spike",
    titleBn: "রোগী বাড়ার আগে কোনো সংকেত নেই",
    bodyEn:
      "Hospital wards fill up before field crews know which clogged drainage blocks actually drove the surge.",
    bodyBn:
      "কোন এলাকার জমা পানি থেকে প্রাদুর্ভাব শুরু হলো তা জানার আগেই হাসপাতালে রোগী ভরে যায়।",
    tagEn: "Day 21+ lag",
    tagBn: "২১+ দিন দেরি",
  },
  {
    num: "02",
    icon: AlertTriangle,
    titleEn: "City-wide alerts blur all 60 wards",
    titleBn: "পুরো শহরের এক সতর্কতায় ৬০ ওয়ার্ড আলাদা হয় না",
    bodyEn:
      "Blanket monsoon warnings treat every ward alike, spreading larviciding teams too thin to stop hotspots.",
    bodyBn:
      "পুরো শহরের সাধারণ বর্ষা সতর্কতায় ৬০টি ওয়ার্ড আলাদা করা যায় না, ফলে মশা নিধন দল সঠিকভাবে বণ্টন হয় না।",
    tagEn: "No ward rank",
    tagBn: "ওয়ার্ড ক্রম নেই",
  },
  {
    num: "03",
    icon: FileSpreadsheet,
    titleEn: "Guesswork on beds & IV saline",
    titleBn: "শয্যা ও স্যালাইন মজুদে অনুমাননির্ভরতা",
    bodyEn:
      "Static spreadsheets and PDFs lack uncertainty bounds, leaving zonal officers guessing how many kits to stage.",
    bodyBn:
      "স্প্রেডশিট বা পিডিএফে অনিশ্চয়তার পরিসর থাকে না, তাই কতগুলো শয্যা ও স্যালাইন প্রস্তুত রাখতে হবে তা অনুমান করতে হয়।",
    tagEn: "No P10–P90",
    tagBn: "পরিসর অনুপস্থিত",
  },
] as const;

const SOLUTIONS = [
  {
    num: "01",
    icon: Timer,
    titleEn: "Ranked ward tiers 1–4 weeks ahead",
    titleBn: "১–৪ সপ্তাহ আগেই ওয়ার্ডভিত্তিক ঝুঁকির স্তর",
    bodyEn:
      "Per-ward forecasts turn this week's rainfall into Low–Critical tiers before Aedes larvae mature into a surge.",
    bodyBn:
      "ওয়ার্ডভিত্তিক পূর্বাভাস এ সপ্তাহের বৃষ্টি থেকেই মশা পূর্ণাঙ্গ হওয়ার আগে ঝুঁকির স্তর আলাদা করে দেখায়।",
    chipEn: "+1w to +4w",
    chipBn: "+১ থেকে +৪ সপ্তাহ",
  },
  {
    num: "02",
    icon: LineChart,
    titleEn: "Exact TreeSHAP cause breakdown",
    titleBn: "সুস্পষ্ট TreeSHAP কারণ বিশ্লেষণ",
    bodyEn:
      "Shows council leadership exactly why a ward turned Critical: 2–4w lagged rain, humidity, water logging, or sanitation.",
    bodyBn:
      "নির্দিষ্ট ওয়ার্ডের ঝুঁকি কেন বাড়ল — বৃষ্টির ল্যাগ, আর্দ্রতা, জলাবদ্ধতা নাকি স্যানিটেশন — তা স্পষ্টভাবে দেখায়।",
    chipEn: "Explainable AI",
    chipBn: "ব্যাখ্যাযোগ্য এআই",
  },
  {
    num: "03",
    icon: Printer,
    titleEn: "80% bounds + A4 & SMS dispatch",
    titleBn: "৮০% সীমা + এ৪ নোটিশ ও এসএমএস",
    bodyEn:
      "Conformalized P10–P90 intervals and one-click Bangla/English A4 notices convert forecasts into immediate field orders.",
    bodyBn:
      "৮০% অনিশ্চয়তা পরিসর ও বাংলা-ইংরেজি প্রিন্টযোগ্য নোটিশ প্রতিটি ওয়ার্ডের জন্য একটি স্পষ্ট করণীয় তৈরি করে।",
    chipEn: "P10–P90 · A4 · SMS",
    chipBn: "P10–P90 · এ৪ · এসএমএস",
  },
] as const;

const TIMELINE_STEPS = [
  {
    weekEn: "Week 0",
    weekBn: "সপ্তাহ ০",
    labelEn: "Heavy monsoon rain",
    labelBn: "ভারী বর্ষার বৃষ্টি",
    mode: "abhas" as const,
  },
  {
    weekEn: "Week 1–2",
    weekBn: "সপ্তাহ ১–২",
    labelEn: "Abhas alert · clear larvae",
    labelBn: "আভাস সতর্কতা · লার্ভা নিধন",
    mode: "abhas" as const,
  },
  {
    weekEn: "Week 3",
    weekBn: "সপ্তাহ ৩",
    labelEn: "Outbreak surge peaks",
    labelBn: "সংক্রমণ শীর্ষে পৌঁছায়",
    mode: "reactive" as const,
  },
  {
    weekEn: "Week 4",
    weekBn: "সপ্তাহ ৪",
    labelEn: "Reactive beds overwhelmed",
    labelBn: "হাসপাতালের শয্যা উপচে পড়ে",
    mode: "reactive" as const,
  },
] as const;

export function ProblemSolution() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const scope = useRef<HTMLElement>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.fromTo(
          "[data-ps-reveal]",
          { y: 22, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: EASE_OUT,
            stagger: 0.09,
            clearProps: "transform,opacity",
            scrollTrigger: { trigger: scope.current, start: "top 82%", once: true },
          },
        );
      });
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      id="problem"
      aria-labelledby="problem-heading"
      lang={lang}
      className="relative scroll-mt-20 overflow-hidden border-y border-mist bg-paper px-4 py-24 text-ink sm:px-8 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(58%_48%_at_50%_0%,rgba(47,91,255,0.065),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Asymmetric Editorial Header */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-12">
          <h2
            id="problem-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,4vw,3.3rem)] font-extrabold leading-[1.04] tracking-[-0.032em] text-navy",
              bn && "font-bangla leading-[1.15] tracking-normal",
            )}
          >
            {bn
              ? "হাসপাতালে রোগী বাড়ার পর ব্যবস্থা নিলে তিন সপ্তাহ দেরি হয়ে যায়।"
              : "Acting when hospital wards fill up is three weeks too late."}
          </h2>

          <div className="lg:justify-self-end">
            <p
              className={clsx(
                "max-w-lg text-base leading-7 text-slate sm:text-lg sm:leading-8",
                bn && "font-bangla",
              )}
            >
              {bn
                ? "বর্ষায় ডেঙ্গু প্রতিরোধের সবচেয়ে বড় বাধা তথ্যের অভাব নয় — সময়ের ব্যবধান। আভাস বৃষ্টির তিন সপ্তাহ আগেই প্রতিটি ওয়ার্ডের ঝুঁকি আলাদা করে দেয়।"
                : "Health offices do not lack effort during monsoon — they lack lead time. Abhas closes the three-week gap between rainfall and clinic surge, ward by ward."}
            </p>
            <div
              className={clsx(
                "mt-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-navy shadow-[0_1px_2px_rgba(11,26,92,0.05)] ring-1 ring-mist tnum",
                bn && "font-bangla",
              )}
            >
              <CloudRain aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
              <span>{bn ? "বৃষ্টির সংকেত শীর্ষে: +৩ সপ্তাহ" : "Peak rain signal: +3 weeks"}</span>
              <span aria-hidden="true" className="text-mist">|</span>
              <span className="font-mono text-royal">r = 0.47</span>
            </div>
          </div>
        </div>

        {/* 3-Week Biological Window Visual Strip */}
        <div
          data-ps-reveal
          className="mt-10 rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_14px_34px_-22px_rgba(11,26,92,0.14)] ring-1 ring-mist/90 sm:p-5"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TIMELINE_STEPS.map((step, index) => {
              const isAbhas = step.mode === "abhas";
              return (
                <div
                  key={step.weekEn}
                  className={clsx(
                    "relative rounded-2xl p-3.5 ring-1 transition-colors",
                    isAbhas
                      ? "bg-royal/[0.05] ring-royal/20"
                      : "bg-paper/80 ring-mist/85",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 text-[11px] font-bold tnum",
                        isAbhas ? "text-royal" : "text-slate",
                        bn && "font-bangla",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={clsx(
                          "h-2 w-2 rounded-full",
                          isAbhas ? "bg-royal" : "bg-slate/45",
                        )}
                      />
                      {bn ? step.weekBn : step.weekEn}
                    </span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isAbhas
                          ? "bg-royal text-white"
                          : "bg-white text-slate ring-1 ring-mist",
                        bn && "font-bangla",
                      )}
                    >
                      {isAbhas
                        ? bn
                          ? "আভাস পদক্ষেপ"
                          : "Abhas window"
                        : bn
                          ? "বিলম্বিত"
                          : "Too late"}
                    </span>
                  </div>
                  <p
                    className={clsx(
                      "mt-2 text-xs font-semibold leading-snug sm:text-[13px]",
                      isAbhas ? "text-navy" : "text-slate",
                      bn && "font-bangla",
                    )}
                  >
                    {bn ? step.labelBn : step.labelEn}
                  </p>
                  <div
                    aria-hidden="true"
                    className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-mist/70"
                  >
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        isAbhas
                          ? "bg-[linear-gradient(90deg,#0B1A5C_0%,#2F5BFF_100%)]"
                          : "bg-slate/35",
                      )}
                      style={{ width: `${(index + 1) * 25}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* High-Contrast Split Comparison: Muted Today vs Obsidian-Navy Abhas */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5.2fr)_minmax(0,6.8fr)] lg:items-stretch">
          {/* Left: Today's reactive reality */}
          <article
            data-ps-reveal
            className="flex flex-col justify-between rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_20px_44px_-24px_rgba(11,26,92,0.12)] ring-1 ring-mist/90 sm:p-8"
          >
            <div>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-mist/80 pb-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-slate ring-1 ring-mist">
                    <Clock3 aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className={clsx("text-base font-bold text-navy", bn && "font-bangla")}>
                      {bn ? "বর্তমান প্রতিক্রিয়াশীল পদ্ধতি" : "Today: reactive after cases rise"}
                    </h3>
                    <p className={clsx("text-xs text-slate", bn && "font-bangla")}>
                      {bn ? "হাসপাতালে ভর্তির পর জরুরি সাড়া" : "Responding only after clinics overflow"}
                    </p>
                  </div>
                </div>
                <span
                  className={clsx(
                    "rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-slate ring-1 ring-mist tnum",
                    bn && "font-bangla",
                  )}
                >
                  {bn ? "দিন ২১+" : "Day 21+"}
                </span>
              </header>

              <ul className="mt-5 space-y-3">
                {PAIN_POINTS.map((point, idx) => {
                  const Icon = point.icon;
                  const linked = hoveredRow === idx;
                  return (
                    <li
                      key={point.num}
                      onMouseEnter={() => setHoveredRow(idx)}
                      onMouseLeave={() => setHoveredRow(null)}
                      className={clsx(
                        "rounded-2xl p-4 ring-1 transition-all duration-200",
                        linked
                          ? "bg-paper ring-slate/30"
                          : "bg-paper/55 ring-mist/75 hover:bg-paper",
                      )}
                    >
                      <div className="flex items-start gap-3.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate ring-1 ring-mist">
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className={clsx("text-sm font-bold text-navy", bn && "font-bangla")}>
                              {bn ? point.titleBn : point.titleEn}
                            </p>
                            <span
                              className={clsx(
                                "rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate ring-1 ring-mist tnum",
                                bn && "font-bangla",
                              )}
                            >
                              {bn ? point.tagBn : point.tagEn}
                            </span>
                          </div>
                          <p
                            className={clsx(
                              "mt-1.5 text-[13.5px] leading-6 text-slate",
                              bn && "font-bangla",
                            )}
                          >
                            {bn ? point.bodyBn : point.bodyEn}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <footer className="mt-6 border-t border-mist/80 pt-4">
              <p className={clsx("text-xs font-medium leading-5 text-slate", bn && "font-bangla")}>
                {bn
                  ? "ফলাফল: দলগুলো আগামী সপ্তাহের প্রজননস্থলের বদলে গতকালের রোগীর পেছনে ছুটতে বাধ্য হয়।"
                  : "Outcome: field teams chase yesterday's hospital admissions instead of next week's breeding sites."}
              </p>
            </footer>
          </article>

          {/* Right: With Abhas — Elevated Obsidian-Navy Showcase Card */}
          <article
            data-ps-reveal
            className="relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-[linear-gradient(145deg,#0B0F14_0%,#0B1A5C_60%,#16339E_100%)] p-6 text-white shadow-[0_6px_18px_rgba(11,15,20,0.22),0_32px_68px_-24px_rgba(11,26,92,0.52)] ring-1 ring-white/12 sm:p-8"
          >
            {/* Ambient specular & corner bloom */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-royal/35 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 left-12 h-56 w-56 rounded-full bg-lime/10 blur-3xl"
            />

            <div className="relative">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 pb-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal text-white shadow-[0_8px_20px_-6px_rgba(47,91,255,0.75)] ring-1 ring-white/25">
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className={clsx("text-base font-bold text-white", bn && "font-bangla")}>
                      {bn ? "আভাস: তিন সপ্তাহ আগে ওয়ার্ডভিত্তিক পদক্ষেপ" : "With Abhas: preemptive, ward by ward"}
                    </h3>
                    <p className={clsx("text-xs text-mist/85", bn && "font-bangla")}>
                      {bn
                        ? "লার্ভা পূর্ণাঙ্গ হওয়ার আগেই লক্ষ্যভিত্তিক প্রতিরোধ"
                        : "Targeted vector control before larvae mature"}
                    </p>
                  </div>
                </div>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full bg-lime/15 px-3 py-1 text-[11px] font-bold text-lime ring-1 ring-lime/35 tnum",
                    bn && "font-bangla",
                  )}
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lime" />
                  {bn ? "১৪–২১ দিন আগে" : "14–21 days early"}
                </span>
              </header>

              <ul className="mt-5 space-y-3">
                {SOLUTIONS.map((item, idx) => {
                  const Icon = item.icon;
                  const linked = hoveredRow === idx;
                  return (
                    <li
                      key={item.num}
                      onMouseEnter={() => setHoveredRow(idx)}
                      onMouseLeave={() => setHoveredRow(null)}
                      className={clsx(
                        "group rounded-2xl p-4 ring-1 backdrop-blur-md transition-all duration-200",
                        linked
                          ? "bg-white/[0.13] ring-lime/45 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.45)]"
                          : "bg-white/[0.06] ring-white/12 hover:bg-white/[0.11] hover:ring-white/25",
                      )}
                    >
                      <div className="flex items-start gap-3.5">
                        <span
                          className={clsx(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
                            linked
                              ? "bg-lime text-ink ring-lime/60"
                              : "bg-white/10 text-white ring-white/15 group-hover:bg-royal",
                          )}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className={clsx("text-sm font-bold text-white", bn && "font-bangla")}>
                              {bn ? item.titleBn : item.titleEn}
                            </p>
                            <span
                              className={clsx(
                                "rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-mist ring-1 ring-white/15 tnum",
                                bn && "font-bangla",
                              )}
                            >
                              {bn ? item.chipBn : item.chipEn}
                            </span>
                          </div>
                          <p
                            className={clsx(
                              "mt-1.5 text-[13.5px] leading-6 text-mist/90",
                              bn && "font-bangla",
                            )}
                          >
                            {bn ? item.bodyBn : item.bodyEn}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <footer className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-5">
              <div className={clsx("flex items-center gap-3 text-xs text-mist/85 tnum", bn && "font-bangla")}>
                <span className="font-bold text-white">0.59 ms / ward</span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span>{bn ? "৬০ ওয়ার্ড · ৫ সিটি" : "60 wards · 5 cities"}</span>
              </div>
              <Link
                href={`/dashboard?demo=1&lang=${lang}`}
                className={clsx(
                  "group inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-bold text-navy shadow-sm transition-all hover:bg-lime hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                  bn && "font-bangla",
                )}
              >
                {bn ? "৩ সপ্তাহের পূর্বাভাস দেখুন" : "Inspect 3-week forecast"}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}
