"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  ArrowRight,
  Check,
  Clock3,
  CloudRain,
  Database,
  LineChart,
  ListOrdered,
  MapPin,
  MessageSquareText,
  Printer,
  RotateCw,
  ShieldCheck,
  Timer,
} from "@/components/icons";
import { RiskTierBadge, TIER_META, type RiskTier } from "@/components/brand/RiskTierBadge";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { formatShortDate } from "@/lib/dates";
import type { Driver } from "@/lib/api/client";
import { formatDriverLabel, TIER_ACTIONS_BN } from "@/lib/i18n";
import { useLandingLang } from "../lang-context";
import { useSpotlightForecast } from "./ForecastCard";

type StageIndex = 0 | 1 | 2 | 3;

const STAGE_DURATION_MS = 4800;

/**
 * Verified dataset & model truth for DSCC Ward 04 on monsoon origin 2024-08-05.
 * Hydrated live from `useSpotlightForecast()` when the API responds, with these
 * exact measured numbers as instant zero-flash initial state.
 */
const VERIFIED_WARD = {
  wardEn: "Dhaka South · Ward 04",
  wardBn: "ঢাকা দক্ষিণ · ওয়ার্ড ০৪",
  originDateEn: "5 Aug 2024",
  originDateBn: "৫ আগস্ট ২০২৪",
  targetDateEn: "26 Aug 2024",
  targetDateBn: "২৬ আগস্ট ২০২৪",
  rainfallMm: 216.4,
  tempC: 29.7,
  humidityPct: 82,
  waterLogging: 0.78,
  densitySqkm: "74,252",
  sanitation: 0.38,
  casesWeek0: 7,
  actualPeakCases: 23,
  expectedCases: 18.5,
  p10: 13,
  p90: 41,
  riskScore: 93,
  tier: "Critical" as RiskTier,
  mae: "1.01",
};

const LAG_CURVE = [
  { lag: 0, r: 0.03, labelEn: "Wk 0", labelBn: "সপ্তাহ ০", noteEn: "Rain falls", noteBn: "বৃষ্টি নামে" },
  { lag: 1, r: 0.07, labelEn: "Wk 1", labelBn: "সপ্তাহ ১", noteEn: "Eggs hatch", noteBn: "লার্ভা জন্ম" },
  { lag: 2, r: 0.23, labelEn: "Wk 2", labelBn: "সপ্তাহ ২", noteEn: "Mosquitoes emerge", noteBn: "পূর্ণাঙ্গ মশা" },
  { lag: 3, r: 0.47, labelEn: "Wk 3", labelBn: "সপ্তাহ ৩", noteEn: "Clinic surge peaks", noteBn: "হাসপাতালে শীর্ষ চাপ" },
  { lag: 4, r: 0.33, labelEn: "Wk 4", labelBn: "সপ্তাহ ৪", noteEn: "Wave lingers", noteBn: "সংক্রমণ থাকে" },
  { lag: 5, r: 0.04, labelEn: "Wk 5", labelBn: "সপ্তাহ ৫", noteEn: "Signal fades", noteBn: "প্রভাব কমে" },
] as const;

const HORIZON_CURVE = [
  { h: 1, labelEn: "+1 wk", labelBn: "+১ সপ্তা.", dateEn: "12 Aug", cases: 11.1, p10: 8, p90: 24 },
  { h: 2, labelEn: "+2 wk", labelBn: "+২ সপ্তা.", dateEn: "19 Aug", cases: 14.2, p10: 10, p90: 32 },
  { h: 3, labelEn: "+3 wk", labelBn: "+৩ সপ্তা.", dateEn: "26 Aug", cases: 18.5, p10: 13, p90: 41 },
  { h: 4, labelEn: "+4 wk", labelBn: "+৪ সপ্তা.", dateEn: "2 Sep", cases: 20.6, p10: 13, p90: 51 },
] as const;

const DEFAULT_DRIVERS: readonly Driver[] = [
  { key: "rain_2_4w", label: "Rain 2–4 weeks ago", effect_pct: 322, direction: "up" },
  { key: "season", label: "Season", effect_pct: 132, direction: "up" },
  { key: "heat", label: "Heat", effect_pct: 68, direction: "up" },
  { key: "recent_rain", label: "Recent rain", effect_pct: 62, direction: "up" },
];

interface StageMeta {
  index: StageIndex;
  stepNum: string;
  stepNumBn: string;
  shortEn: string;
  shortBn: string;
  titleEn: string;
  titleBn: string;
  summaryEn: string;
  summaryBn: string;
  metricEn: string;
  metricBn: string;
  captionEn: string;
  captionBn: string;
}

const STAGES: readonly StageMeta[] = [
  {
    index: 0,
    stepNum: "01",
    stepNumBn: "০১",
    shortEn: "Collect rain & ward",
    shortBn: "বৃষ্টি ও ওয়ার্ড তথ্য",
    titleEn: "Read this week's rain and ward conditions",
    titleBn: "এ সপ্তাহের বৃষ্টি ও ওয়ার্ডের অবস্থা পড়া",
    summaryEn:
      "Abhas pairs this week's rainfall, temperature, and humidity with each ward's drainage, crowding, and 10-year history — offline by default, or live from Open-Meteo.",
    summaryBn:
      "এ সপ্তাহের বৃষ্টি, তাপমাত্রা ও আর্দ্রতার সাথে প্রতিটি ওয়ার্ডের জলাবদ্ধতা, জনঘনত্ব ও ১০ বছরের ইতিহাস মেলানো হয় — ডিফল্টভাবে অফলাইন, চাইলে Open-Meteo লাইভ।",
    metricEn: "216.4 mm",
    metricBn: "২১৬.৪ মিমি",
    captionEn: "31,320 rows · 4 calls/day",
    captionBn: "৩১,৩২০ সারি · ৪ কল/দিন",
  },
  {
    index: 1,
    stepNum: "02",
    stepNumBn: "০২",
    shortEn: "Apply breeding clock",
    shortBn: "৩ সপ্তাহের প্রজনন চক্র",
    titleEn: "Shift rain forward along the mosquito breeding clock",
    titleBn: "মশার প্রজনন চক্র অনুযায়ী বৃষ্টির সময়-ল্যাগ হিসাব",
    summaryEn:
      "Rain never causes dengue the same day. Standing water takes 2–4 weeks for Aedes larvae to mature, bite, and reach clinics — peaking at week 3 (r = 0.47 across 60 wards).",
    summaryBn:
      "বৃষ্টি হলেই সেদিন ডেঙ্গু বাড়ে না। জমে থাকা পানিতে এডিস মশা বড় হয়ে হাসপাতালে রোগী পৌঁছাতে ২–৪ সপ্তাহ লাগে — সর্বোচ্চ প্রভাব ৩য় সপ্তাহে (r = ০.৪৭)।",
    metricEn: "r 0.47 at +3w",
    metricBn: "r ০.৪৭ (+৩ সপ্তা.)",
    captionEn: "1–6w rain lags · zero leakage",
    captionBn: "১–৬ সপ্তা. ল্যাগ · লিকেজমুক্ত",
  },
  {
    index: 2,
    stepNum: "03",
    stepNumBn: "০৩",
    shortEn: "Predict & explain",
    shortBn: "পূর্বাভাস ও কারণ",
    titleEn: "Score expected cases, 80% range, and exact reasons",
    titleBn: "সম্ভাব্য রোগী, ৮০% পরিসর ও সুনির্দিষ্ট কারণ নির্ণয়",
    summaryEn:
      "Four LightGBM Poisson models score each ward 1–4 weeks ahead, wrap every forecast in an 80% conformal band, and attach exact TreeSHAP reasons so officers know why.",
    summaryBn:
      "চারটি LightGBM মডেল ১–৪ সপ্তাহের ঝুঁকি, ৮০% অনিশ্চয়তা পরিসর ও প্রতিটি কারণের TreeSHAP ব্যাখ্যা তৈরি করে যেন কর্মকর্তারা সহজেই আস্থা রাখতে পারেন।",
    metricEn: "MAE 1.01",
    metricBn: "MAE ১.০১",
    captionEn: "LightGBM · 80% band · SHAP",
    captionBn: "LightGBM · ৮০% সীমা · SHAP",
  },
  {
    index: 3,
    stepNum: "04",
    stepNumBn: "০৪",
    shortEn: "Dispatch action",
    shortBn: "মাঠ পর্যায়ে ব্যবস্থা",
    titleEn: "Alert supervisors 3 weeks before hospital beds fill",
    titleBn: "হাসপাতালের শয্যা ভরার ৩ সপ্তাহ আগেই সতর্কবার্তা",
    summaryEn:
      "One calculation turns into three field-ready outputs: a ranked 60-ward dashboard, a ≤160-character SMS alert, and a printable bilingual A4 brief with one clear action.",
    summaryBn:
      "একটি পূর্বাভাস থেকেই মেলে তিনটি মাঠ-উপযোগী ফলাফল: ৬০ ওয়ার্ডের অগ্রাধিকার তালিকা, ≤১৬০ অক্ষরের এসএমএস এবং বাংলা-ইংরেজি প্রিন্টযোগ্য এ৪ নোটিশ।",
    metricEn: "60 wards",
    metricBn: "৬০ ওয়ার্ড",
    captionEn: "Dashboard · SMS · A4 brief",
    captionBn: "ড্যাশবোর্ড · এসএমএস · এ৪",
  },
];

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4.5 3.15a.75.75 0 0 1 1.13-.65l7.5 4.85a.75.75 0 0 1 0 1.3l-7.5 4.85A.75.75 0 0 1 4.5 12.85V3.15Z" />
    </svg>
  );
}

function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="3.5" y="3" width="3.2" height="10" rx="1" />
      <rect x="9.3" y="3" width="3.2" height="10" rx="1" />
    </svg>
  );
}

/** Crisp horizontal animated connector between two pipeline columns on desktop. */
function ConduitLink({
  active,
  completed,
  reducedMotion,
}: {
  active: boolean;
  completed: boolean;
  reducedMotion: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <div
      aria-hidden="true"
      className="hidden lg:flex lg:w-12 lg:shrink-0 lg:items-center lg:justify-center"
    >
      <svg viewBox="0 0 48 24" fill="none" className="h-6 w-12 overflow-visible">
        <defs>
          <linearGradient id={`conduit-${uid}`} x1="0" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-royal)" stopOpacity="0.2" />
            <stop offset="55%" stopColor="var(--color-royal)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-white)" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Base precision track */}
        <path
          d="M 2 12 L 42 12"
          stroke={completed || active ? "var(--color-royal)" : "rgba(221, 227, 243, 0.22)"}
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
          className="transition-colors duration-300"
        />
        {/* Animated luminous comet packet traveling left -> right when active */}
        {active && !reducedMotion ? (
          <>
            <path
              d="M 2 12 L 42 12"
              stroke={`url(#conduit-${uid})`}
              strokeWidth={3}
              strokeLinecap="round"
              className="abhas-pipeline-pulse"
            />
            <circle cx="42" cy="12" r="3" fill="var(--color-white)" />
          </>
        ) : (
          <circle
            cx="42"
            cy="12"
            r={completed ? 3 : 2.25}
            fill={completed || active ? "var(--color-royal)" : "rgba(221, 227, 243, 0.35)"}
            className="transition-colors duration-300"
          />
        )}
        {/* Directional arrowhead */}
        <path
          d="M 37 7.5 L 43.5 12 L 37 16.5"
          stroke={active ? "var(--color-white)" : completed ? "var(--color-royal)" : "rgba(221, 227, 243, 0.35)"}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-300"
        />
      </svg>
    </div>
  );
}

export function HowItWorks() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const scope = useRef<HTMLElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);

  const [activeStage, setActiveStage] = useState<StageIndex>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPausedByHover, setIsPausedByHover] = useState(false);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);

  // Reuse already-cached live Ward 04 model forecast from the landing page query.
  const forecastQuery = useSpotlightForecast();
  const liveH3 = forecastQuery.data?.forecasts[0]?.horizons[0];

  const modelValues = useMemo(() => {
    const expected = liveH3 ? Number(liveH3.expected_cases.toFixed(1)) : VERIFIED_WARD.expectedCases;
    const p10 = liveH3 ? Math.round(liveH3.p10) : VERIFIED_WARD.p10;
    const p90 = liveH3 ? Math.round(liveH3.p90) : VERIFIED_WARD.p90;
    const tier: RiskTier = liveH3?.tier ?? VERIFIED_WARD.tier;
    const targetWeek = liveH3?.target_week ? formatShortDate(liveH3.target_week) : VERIFIED_WARD.targetDateEn;
    const drivers =
      liveH3?.drivers && liveH3.drivers.length > 0
        ? liveH3.drivers.slice(0, 4)
        : DEFAULT_DRIVERS;
    const maxDriver = Math.max(...drivers.map((d) => Math.abs(d.effect_pct)), 1);
    return { expected, p10, p90, tier, targetWeek, drivers, maxDriver };
  }, [liveH3]);

  // Respect prefers-reduced-motion cleanly.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(mql.matches);
      if (mql.matches) setIsPlaying(false);
    };
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  // Pause auto-advance whenever section leaves viewport (battery & CPU friendly).
  useEffect(() => {
    const el = scope.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Deterministic stage auto-progression when playing, in view, and not hovered.
  const activelyCycling = isPlaying && inView && !isPausedByHover && !reducedMotion;

  useEffect(() => {
    if (!activelyCycling) return;
    const timer = window.setTimeout(() => {
      setActiveStage((prev) => ((prev + 1) % 4) as StageIndex);
      setCycleKey((k) => k + 1);
    }, STAGE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activelyCycling, activeStage, cycleKey]);

  // Subtle initial arrival entrance for the console frame (never traps hidden).
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.fromTo(
          "[data-how-entrance]",
          { y: 20, opacity: 0.2 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: EASE_OUT,
            stagger: 0.08,
            clearProps: "transform,opacity",
            scrollTrigger: { trigger: stageShellRef.current, start: "top 86%", once: true },
          },
        );
      });
    },
    { scope },
  );

  function selectStage(idx: StageIndex) {
    setActiveStage(idx);
    setCycleKey((k) => k + 1);
  }

  function handleNodeKeyDown(e: KeyboardEvent, idx: StageIndex) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectStage(idx);
    }
  }

  function handleReplay() {
    setActiveStage(0);
    setCycleKey((k) => k + 1);
    if (!reducedMotion) setIsPlaying(true);
  }

  const current = STAGES[activeStage];
  const smsText = bn
    ? `আভাস · ওয়ার্ড ০৪: ৩ সপ্তাহে ${TIER_META[modelValues.tier].labelBn} ঝুঁকি। ${TIER_ACTIONS_BN[modelValues.tier]}`
    : `ABHAS · Ward 04: ${modelValues.tier} risk in 3 weeks. ${TIER_META[modelValues.tier].action}`;

  return (
    <section
      ref={scope}
      id="how"
      aria-labelledby="how-heading"
      lang={lang}
      className="relative bg-navy px-4 py-24 text-white sm:px-8 lg:py-32 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl">
        {/* Editorial header — no eyebrow above heading (Craft Floor rule) */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
          <h2
            id="how-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "এই সপ্তাহের বৃষ্টি থেকে আগামী মাসের ওয়ার্ড তালিকা।"
              : "From this week's rain to next month's ward list."}
          </h2>
          <p className={clsx("max-w-lg text-base leading-7 text-mist sm:text-lg sm:leading-8 lg:justify-self-end", bn && "font-bangla")}>
            {bn
              ? "দেখুন কীভাবে ঢাকা দক্ষিণ ওয়ার্ড ০৪-এর এক সপ্তাহের ভারী বৃষ্টি ধাপে ধাপে ৩ সপ্তাহের আগাম ডেঙ্গু সতর্কতায় রূপান্তরিত হয় — কোনো ক্লাউড সার্ভার ছাড়াই।"
              : "Watch one real storm in Dhaka South Ward 04 move step by step from raw rainfall to a ranked municipal dispatch sheet — zero cloud servers, runs in under three minutes."}
          </p>
        </div>

        {/* Interactive Prediction Simulator Console */}
        <div
          ref={stageShellRef}
          data-how-entrance
          onMouseEnter={() => setIsPausedByHover(true)}
          onMouseLeave={() => setIsPausedByHover(false)}
          onFocusCapture={() => setIsPausedByHover(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsPausedByHover(false);
            }
          }}
          className="mt-12 overflow-hidden rounded-[14px] bg-ink ring-1 ring-white/12"
        >
          {/* Top Telemetry & Playback Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist">
              <span className="inline-flex items-center gap-2 font-semibold text-white">
                <MapPin className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                <span className={bn ? "font-bangla" : undefined}>
                  {bn ? VERIFIED_WARD.wardBn : VERIFIED_WARD.wardEn}
                </span>
              </span>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <span className="tnum">
                {bn ? `বৃষ্টি: ${VERIFIED_WARD.originDateBn}` : `Storm week: ${VERIFIED_WARD.originDateEn}`}
              </span>
              <span aria-hidden="true" className="hidden text-white/25 sm:inline">
                →
              </span>
              <span className="hidden tnum sm:inline">
                {bn
                  ? `পূর্বাভাস: ${VERIFIED_WARD.targetDateBn} (+৩ সপ্তাহ)`
                  : `Forecast week: ${modelValues.targetWeek} (+3 wk)`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="how-play-toggle"
                aria-pressed={isPlaying}
                aria-label={isPlaying ? (bn ? "অ্যানিমেশন বিরতি" : "Pause walkthrough") : (bn ? "অ্যানিমেশন চালু" : "Play walkthrough")}
                onClick={() => {
                  setIsPlaying((p) => !p);
                  setCycleKey((k) => k + 1);
                }}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
              >
                {isPlaying ? (
                  <PauseGlyph className="h-3.5 w-3.5 text-mist" />
                ) : (
                  <PlayGlyph className="h-3.5 w-3.5 text-royal" />
                )}
                <span className={bn ? "font-bangla" : undefined}>
                  {isPlaying ? (bn ? "বিরতি" : "Pause") : (bn ? "চালান" : "Play")}
                </span>
              </button>
              <button
                type="button"
                data-testid="how-replay-btn"
                aria-label={bn ? "শুরু থেকে দেখুন" : "Replay from step 1"}
                onClick={handleReplay}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-mist ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span className={clsx("hidden sm:inline", bn && "font-bangla")}>
                  {bn ? "আবার দেখুন" : "Replay"}
                </span>
              </button>
            </div>
          </div>

          {/* Synchronized 4-Stage Interactive Stepper */}
          <div
            role="tablist"
            aria-label={bn ? "পূর্বাভাস প্রক্রিয়ার ৪টি ধাপ" : "Four prediction stages"}
            className="grid grid-cols-2 border-b border-white/10 lg:grid-cols-4"
          >
            {STAGES.map((stage, idx) => {
              const isActive = activeStage === idx;
              const isDone = idx < activeStage;
              return (
                <button
                  key={stage.stepNum}
                  type="button"
                  role="tab"
                  id={`how-tab-${idx}`}
                  aria-selected={isActive}
                  aria-controls={`how-panel-${idx}`}
                  data-testid={`how-stage-tab-${idx}`}
                  onClick={() => selectStage(idx as StageIndex)}
                  className={clsx(
                    "group relative flex min-h-14 cursor-pointer flex-col justify-between px-4 py-3.5 text-left transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-royal sm:px-5",
                    idx < 3 && "lg:border-r lg:border-white/10",
                    idx % 2 === 0 && "border-r border-white/10 lg:border-r",
                    idx < 2 && "border-b border-white/10 lg:border-b-0",
                    isActive ? "bg-navy/75 text-white" : "bg-transparent text-mist hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 text-xs font-semibold tnum",
                        isActive ? "text-white" : isDone ? "text-mist" : "text-mist/75",
                      )}
                    >
                      <span
                        className={clsx(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                          isActive
                            ? "bg-royal text-white"
                            : isDone
                              ? "bg-royal/25 text-white ring-1 ring-royal/50"
                              : "bg-white/8 text-mist",
                        )}
                      >
                        {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : bn ? stage.stepNumBn : stage.stepNum}
                      </span>
                      <span className={clsx("truncate", bn && "font-bangla")}>
                        {bn ? stage.shortBn : stage.shortEn}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-none text-white tnum">
                    {bn ? stage.metricBn : stage.metricEn}
                  </p>

                  {/* Bottom progress fill bar along active tab */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/8"
                  >
                    {isActive ? (
                      <span
                        key={`${activeStage}-${cycleKey}-${activelyCycling ? "run" : "hold"}`}
                        className={clsx(
                          "block h-full w-full bg-royal",
                          activelyCycling ? "abhas-stage-fill" : "scale-x-100",
                        )}
                        style={{ ["--stage-duration" as string]: `${STAGE_DURATION_MS}ms` }}
                      />
                    ) : isDone ? (
                      <span className="block h-full w-full bg-royal/55" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {/* UPPER STAGE: Animated 4-Node Pipeline Architecture */}
          <div className="relative px-4 py-6 sm:px-6 sm:py-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0">
              {/* NODE 1: Inputs (Rain + Ward History) */}
              <div
                data-flow-node
                role="button"
                tabIndex={0}
                aria-pressed={activeStage === 0}
                aria-label={bn ? "ধাপ ১: বৃষ্টি ও ওয়ার্ড তথ্য দেখুন" : "Step 1: Collect rain and ward data"}
                onClick={() => selectStage(0)}
                onKeyDown={(e) => handleNodeKeyDown(e, 0)}
                className={clsx(
                  "group relative flex flex-1 cursor-pointer flex-col justify-between rounded-[12px] p-4 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal",
                  activeStage === 0
                    ? "bg-navy text-white ring-1 ring-royal"
                    : "bg-white/[0.03] text-white ring-1 ring-white/10 hover:bg-white/[0.06] hover:ring-white/20",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mist">
                      <CloudRain className="h-4 w-4 text-royal" aria-hidden="true" />
                      <span className={bn ? "font-bangla" : undefined}>
                        {bn ? "ধাপ ১ · ইনপুট" : "Step 1 · Inputs"}
                      </span>
                    </span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-mist tnum">
                      {bn ? "৪ কল/দিন" : "4 calls/day"}
                    </span>
                  </div>

                  {/* Animated live rain bar + telemetry */}
                  <div className="mt-4 rounded-[10px] bg-ink/80 p-3 ring-1 ring-white/8">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="whitespace-nowrap text-xl font-extrabold leading-none text-white tnum sm:text-2xl">
                        216.4 mm
                      </span>
                      <span className={clsx("shrink-0 text-xs text-mist", bn && "font-bangla")}>
                        {bn ? "বৃষ্টি" : "weekly rain"}
                      </span>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full origin-left rounded-full bg-royal transition-transform duration-700 ease-out"
                        style={{ transform: `scaleX(${activeStage >= 0 ? 0.88 : 0.2})` }}
                      />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-mist tnum">
                      <span>29.7°C · 82% RH</span>
                      <span>{bn ? "জলাবদ্ধতা ০.৭৮" : "Logging 0.78"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-mist">
                  <span className="inline-flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-mist" aria-hidden="true" />
                    <span className="tnum font-semibold text-white">31,320</span>
                  </span>
                  <span className={bn ? "font-bangla" : undefined}>
                    {bn ? "৬০ ওয়ার্ড · ১০ বছর" : "60 wards · 10 yrs"}
                  </span>
                </div>
              </div>

              <ConduitLink active={activeStage === 1} completed={activeStage > 1} reducedMotion={reducedMotion} />

              {/* NODE 2: 3-Week Vector Breeding Clock */}
              <div
                data-flow-node
                role="button"
                tabIndex={0}
                aria-pressed={activeStage === 1}
                aria-label={bn ? "ধাপ ২: তিন সপ্তাহের প্রজনন চক্র দেখুন" : "Step 2: Apply 3-week breeding clock"}
                onClick={() => selectStage(1)}
                onKeyDown={(e) => handleNodeKeyDown(e, 1)}
                className={clsx(
                  "group relative flex flex-1 cursor-pointer flex-col justify-between rounded-[12px] p-4 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal",
                  activeStage === 1
                    ? "bg-navy text-white ring-1 ring-royal"
                    : "bg-white/[0.03] text-white ring-1 ring-white/10 hover:bg-white/[0.06] hover:ring-white/20",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mist">
                      <Clock3 className="h-4 w-4 text-royal" aria-hidden="true" />
                      <span className={bn ? "font-bangla" : undefined}>
                        {bn ? "ধাপ ২ · প্রজনন চক্র" : "Step 2 · Breeding clock"}
                      </span>
                    </span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-white tnum">
                      r 0.47
                    </span>
                  </div>

                  {/* Live animated 6-week lag correlation spectrum */}
                  <div className="mt-4 rounded-[10px] bg-ink/80 p-3 ring-1 ring-white/8">
                    <div className="flex h-16 items-end justify-between gap-1.5">
                      {LAG_CURVE.map((pt) => {
                        const isPeak = pt.lag === 3;
                        const pct = Math.max(12, Math.round((pt.r / 0.5) * 100));
                        const scale = activeStage >= 1 ? 1 : 0.35;
                        return (
                          <div key={pt.lag} className="flex flex-1 flex-col items-center gap-1">
                            <div className="flex h-12 w-full items-end">
                              <span
                                className={clsx(
                                  "block w-full origin-bottom rounded-t-[3px] transition-all duration-500 ease-out",
                                  isPeak
                                    ? "bg-royal"
                                    : activeStage === 1
                                      ? "bg-white/35"
                                      : "bg-white/20",
                                )}
                                style={{
                                  height: `${pct}%`,
                                  transform: `scaleY(${scale})`,
                                  transitionDelay: reducedMotion ? "0ms" : `${pt.lag * 45}ms`,
                                }}
                              />
                            </div>
                            <span
                              className={clsx(
                                "text-[10px] tnum leading-none",
                                isPeak ? "font-bold text-white" : "text-mist/80",
                              )}
                            >
                              {pt.lag}w
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-mist">
                  <span className={clsx("font-semibold text-white", bn && "font-bangla")}>
                    {bn ? "সর্বোচ্চ প্রভাব: ৩য় সপ্তাহ" : "Peak lag: week 3"}
                  </span>
                  <span className="tnum">k = 1–6w</span>
                </div>
              </div>

              <ConduitLink active={activeStage === 2} completed={activeStage > 2} reducedMotion={reducedMotion} />

              {/* NODE 3: LightGBM Forecast Model (Focal Royal Surface) */}
              <div
                data-flow-node
                role="button"
                tabIndex={0}
                aria-pressed={activeStage === 2}
                aria-label={bn ? "ধাপ ৩: LightGBM পূর্বাভাস ও কারণ দেখুন" : "Step 3: LightGBM forecast and SHAP reasons"}
                onClick={() => selectStage(2)}
                onKeyDown={(e) => handleNodeKeyDown(e, 2)}
                className={clsx(
                  "group relative flex flex-1 cursor-pointer flex-col justify-between rounded-[12px] p-4 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  activeStage === 2
                    ? "bg-royal text-white ring-1 ring-white/40"
                    : "bg-royal/22 text-white ring-1 ring-royal/60 hover:bg-royal/30",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                      <LineChart className="h-4 w-4 text-white" aria-hidden="true" />
                      <span className={bn ? "font-bangla" : undefined}>
                        {bn ? "ধাপ ৩ · পূর্বাভাস মডেল" : "Step 3 · LightGBM model"}
                      </span>
                    </span>
                    <span className="rounded-full bg-ink/35 px-2 py-0.5 text-[11px] font-semibold text-white tnum">
                      MAE {VERIFIED_WARD.mae}
                    </span>
                  </div>

                  {/* Animated 1-4 week forecast trajectory + 80% conformal band */}
                  <div className="mt-4 rounded-[10px] bg-ink/55 p-3 ring-1 ring-white/15">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-extrabold leading-none text-white tnum">
                        {modelValues.expected.toFixed(1)}
                      </span>
                      <span className={clsx("text-xs text-mist tnum", bn && "font-bangla")}>
                        {bn
                          ? `পরিসর ${modelValues.p10}–${modelValues.p90}`
                          : `80% band ${modelValues.p10}–${modelValues.p90}`}
                      </span>
                    </div>

                    {/* 4-week horizon trajectory mini bars */}
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      {HORIZON_CURVE.map((pt, i) => {
                        const isH3 = pt.h === 3;
                        const pct = Math.round((pt.cases / 24) * 100);
                        return (
                          <div key={pt.h} className="flex flex-col items-center gap-1">
                            <div className="flex h-9 w-full items-end rounded-[3px] bg-white/8 p-0.5">
                              <span
                                className={clsx(
                                  "block w-full origin-bottom rounded-[2px] transition-transform duration-500 ease-out",
                                  isH3 ? "bg-white" : "bg-white/45",
                                )}
                                style={{
                                  height: `${pct}%`,
                                  transform: `scaleY(${activeStage >= 2 ? 1 : 0.3})`,
                                  transitionDelay: reducedMotion ? "0ms" : `${i * 60}ms`,
                                }}
                              />
                            </div>
                            <span className={clsx("text-[10px] tnum leading-none", isH3 ? "font-bold text-white" : "text-mist/85")}>
                              +{pt.h}w
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/15 pt-3 text-xs text-white/90">
                  <span className={clsx("truncate", bn && "font-bangla")}>
                    {bn ? "৪টি মডেল + SHAP" : "4 horizons + SHAP"}
                  </span>
                  <span className="shrink-0 tnum font-semibold">+322% rain</span>
                </div>
              </div>

              <ConduitLink active={activeStage === 3} completed={false} reducedMotion={reducedMotion} />

              {/* NODE 4: Actionable Field Outputs */}
              <div
                data-flow-node
                role="button"
                tabIndex={0}
                aria-pressed={activeStage === 3}
                aria-label={bn ? "ধাপ ৪: মাঠ পর্যায়ে সতর্কবার্তা দেখুন" : "Step 4: Dispatch field alerts"}
                onClick={() => selectStage(3)}
                onKeyDown={(e) => handleNodeKeyDown(e, 3)}
                className={clsx(
                  "group relative flex flex-1 cursor-pointer flex-col justify-between rounded-[12px] p-4 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal",
                  activeStage === 3
                    ? "bg-navy text-white ring-1 ring-royal"
                    : "bg-white/[0.03] text-white ring-1 ring-white/10 hover:bg-white/[0.06] hover:ring-white/20",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mist">
                      <ShieldCheck className="h-4 w-4 text-royal" aria-hidden="true" />
                      <span className={bn ? "font-bangla" : undefined}>
                        {bn ? "ধাপ ৪ · মাঠ নির্দেশনা" : "Step 4 · Field dispatch"}
                      </span>
                    </span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-mist tnum">
                      {bn ? "৬০ ওয়ার্ড" : "60 wards"}
                    </span>
                  </div>

                  {/* Three deliverables lighting up cleanly */}
                  <ul className="mt-4 space-y-2">
                    <li
                      className={clsx(
                        "flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-xs ring-1 transition-colors duration-300",
                        activeStage === 3
                          ? "bg-ink text-white ring-white/18"
                          : "bg-ink/70 text-mist ring-white/8",
                      )}
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-white">
                        <ListOrdered className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                        <span className={bn ? "font-bangla" : undefined}>
                          {bn ? "অগ্রাধিকার তালিকা" : "Priority list"}
                        </span>
                      </span>
                      <span className="tnum text-[11px] text-mist">60 wards</span>
                    </li>
                    <li
                      className={clsx(
                        "flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-xs ring-1 transition-colors duration-300",
                        activeStage === 3
                          ? "bg-ink text-white ring-white/18"
                          : "bg-ink/70 text-mist ring-white/8",
                      )}
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-white">
                        <MessageSquareText className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                        <span className={bn ? "font-bangla" : undefined}>
                          {bn ? "এসএমএস সতর্কতা" : "SMS alert"}
                        </span>
                      </span>
                      <span className="tnum text-[11px] text-mist">≤ 160 chars</span>
                    </li>
                    <li
                      className={clsx(
                        "flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-xs ring-1 transition-colors duration-300",
                        activeStage === 3
                          ? "bg-ink text-white ring-white/18"
                          : "bg-ink/70 text-mist ring-white/8",
                      )}
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-white">
                        <Printer className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                        <span className={bn ? "font-bangla" : undefined}>
                          {bn ? "মাঠ নোটিশ" : "Field notice"}
                        </span>
                      </span>
                      <span className="tnum text-[11px] text-mist">A4 · EN + বাংলা</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-mist">
                  <span className={clsx("font-semibold text-white", bn && "font-bangla")}>
                    {bn ? "রোগী বাড়ার ৩ সপ্তাহ আগে" : "3 weeks before surge"}
                  </span>
                  <span className="tnum">{modelValues.targetWeek}</span>
                </div>
              </div>
            </div>
          </div>

          {/* LOWER STAGE: Plain-Language Live Inspection Panel (synchronized with activeStage) */}
          <div
            role="tabpanel"
            id={`how-panel-${activeStage}`}
            aria-labelledby={`how-tab-${activeStage}`}
            className="border-t border-white/10 bg-navy/45 px-4 py-6 sm:px-6 sm:py-7"
          >
            <div
              key={activeStage}
              className="abhas-stage-enter grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center"
            >
              {/* Left: Human-readable explanation of what is happening right now */}
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 items-center rounded-full bg-royal px-2.5 text-xs font-bold text-white tnum">
                    {bn ? `ধাপ ${current.stepNumBn} / ০৪` : `Step ${current.stepNum} of 04`}
                  </span>
                  <span className={clsx("text-xs font-medium text-mist tnum", bn && "font-bangla")}>
                    {bn ? current.captionBn : current.captionEn}
                  </span>
                </div>
                <h3
                  className={clsx(
                    "mt-3 text-xl font-bold leading-snug text-white sm:text-2xl",
                    bn && "font-bangla",
                  )}
                >
                  {bn ? current.titleBn : current.titleEn}
                </h3>
                <p
                  className={clsx(
                    "mt-2 max-w-prose text-sm leading-6 text-mist sm:text-[15px] sm:leading-7",
                    bn && "font-bangla",
                  )}
                >
                  {bn ? current.summaryBn : current.summaryEn}
                </p>

                {/* Direct stage navigation arrows */}
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="how-prev-btn"
                    onClick={() => selectStage(((activeStage + 3) % 4) as StageIndex)}
                    className={clsx(
                      "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white ring-1 ring-white/12 transition-colors hover:bg-white/12",
                      bn && "font-bangla",
                    )}
                  >
                    <span aria-hidden="true">←</span>
                    <span>{bn ? "পূর্ববর্তী" : "Previous"}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="how-next-btn"
                    onClick={() => selectStage(((activeStage + 1) % 4) as StageIndex)}
                    className={clsx(
                      "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-royal px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-royal",
                      bn && "font-bangla",
                    )}
                  >
                    <span>
                      {activeStage === 3
                        ? bn
                          ? "প্রথম ধাপে ফিরুন"
                          : "Back to Step 1"
                        : bn
                          ? "পরবর্তী ধাপ"
                          : "Next step"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <Link
                    href={bn ? "/dashboard?demo=1&lang=bn" : "/dashboard?demo=1"}
                    className={clsx(
                      "ml-auto inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-mist underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white",
                      bn && "font-bangla",
                    )}
                  >
                    <span>{bn ? "লাইভ ড্যাশবোর্ডে দেখুন" : "Inspect Ward 04 live"}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Right: Stage-Specific Visual Evidence Surface */}
              <div className="rounded-[12px] bg-ink p-4 ring-1 ring-white/10 sm:p-5">
                {activeStage === 0 ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-mist">
                      <span className={clsx("font-semibold text-white", bn && "font-bangla")}>
                        {bn ? "৫ আগস্ট ২০২৪ · ওয়ার্ড ০৪ ইনপুট স্ন্যাপশট" : "5 Aug 2024 · Ward 04 weekly snapshot"}
                      </span>
                      <span className={clsx("rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] tnum", bn && "font-bangla")}>
                        {bn ? "এখন রোগী মাত্র ৭ জন" : "Only 7 cases today"}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-[10px] bg-navy/60 p-3 ring-1 ring-white/8">
                        <dt className={clsx("text-[11px] text-mist", bn && "font-bangla")}>
                          {bn ? "সাপ্তাহিক বৃষ্টি" : "Rainfall"}
                        </dt>
                        <dd className="mt-1.5 text-lg font-bold text-white tnum">216.4 mm</dd>
                      </div>
                      <div className="rounded-[10px] bg-navy/60 p-3 ring-1 ring-white/8">
                        <dt className={clsx("text-[11px] text-mist", bn && "font-bangla")}>
                          {bn ? "তাপ ও আর্দ্রতা" : "Temp · Humidity"}
                        </dt>
                        <dd className="mt-1.5 text-lg font-bold text-white tnum">29.7° · 82%</dd>
                      </div>
                      <div className="rounded-[10px] bg-navy/60 p-3 ring-1 ring-white/8">
                        <dt className={clsx("text-[11px] text-mist", bn && "font-bangla")}>
                          {bn ? "জলাবদ্ধতা সূচক" : "Water-logging"}
                        </dt>
                        <dd className="mt-1.5 text-lg font-bold text-white tnum">0.78 / 1.0</dd>
                      </div>
                      <div className="rounded-[10px] bg-navy/60 p-3 ring-1 ring-white/8">
                        <dt className={clsx("text-[11px] text-mist", bn && "font-bangla")}>
                          {bn ? "জনঘনত্ব" : "Density / km²"}
                        </dt>
                        <dd className="mt-1.5 text-lg font-bold text-white tnum">74,252</dd>
                      </div>
                    </dl>
                    <p className={clsx("mt-3 text-xs leading-5 text-mist", bn && "font-bangla")}>
                      {bn
                        ? "হাসপাতালে এখনো শান্ত অবস্থা (৭ রোগী), কিন্তু ভারী বৃষ্টি ও উচ্চ জলাবদ্ধতা (০.৭৮) তিন সপ্তাহ পরের প্রাদুর্ভাবের বীজ বুনে দিয়েছে।"
                        : "Clinics still look quiet today (7 cases), but 216 mm of rain over 0.78 water-logging has already started the three-week countdown."}
                    </p>
                  </div>
                ) : null}

                {activeStage === 1 ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-mist">
                      <span className={clsx("inline-flex items-center gap-1.5 font-semibold text-white", bn && "font-bangla")}>
                        <Timer className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                        {bn ? "বৃষ্টি থেকে হাসপাতালে রোগী আসার সময়-সম্পর্ক (r)" : "Deseasonalized rain-to-cases lag correlation (r)"}
                      </span>
                      <span className="tnum text-[11px] text-white font-semibold">
                        {bn ? "শীর্ষ: সপ্তাহ ৩ (r 0.47)" : "Peak: Week 3 (r 0.47)"}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2.5">
                      {LAG_CURVE.slice(0, 5).map((pt) => {
                        const isPeak = pt.lag === 3;
                        const widthPct = Math.max(8, Math.round((pt.r / 0.5) * 100));
                        return (
                          <li key={pt.lag} className="grid grid-cols-[3.5rem_minmax(0,1fr)_8.5rem_3rem] items-center gap-2.5 text-xs">
                            <span className={clsx("tnum font-semibold", isPeak ? "text-white" : "text-mist", bn && "font-bangla")}>
                              {bn ? pt.labelBn : pt.labelEn}
                            </span>
                            <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-white/8">
                              <span
                                className={clsx("block h-full rounded-full", isPeak ? "bg-royal" : "bg-white/35")}
                                style={{ width: `${widthPct}%` }}
                              />
                            </span>
                            <span className={clsx("truncate text-[11px]", isPeak ? "font-semibold text-white" : "text-mist", bn && "font-bangla")}>
                              {bn ? pt.noteBn : pt.noteEn}
                            </span>
                            <span className={clsx("text-right tnum font-semibold", isPeak ? "text-white" : "text-mist")}>
                              {pt.r.toFixed(2)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {activeStage === 2 ? (
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl font-extrabold leading-none text-white tnum">
                          {modelValues.expected.toFixed(1)}
                        </span>
                        <span className={clsx("text-xs text-mist", bn && "font-bangla")}>
                          {bn ? "প্রত্যাশিত রোগী · ৮০% পরিসর " : "expected cases · 80% range "}
                          <strong className="font-semibold text-white tnum">
                            {modelValues.p10}–{modelValues.p90}
                          </strong>
                        </span>
                      </div>
                      <span className="rounded-full bg-royal/25 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-royal/60 tnum">
                        TreeSHAP · MAE {VERIFIED_WARD.mae}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2.5" aria-label={bn ? "প্রধান কারণসমূহ" : "Top SHAP forecast drivers"}>
                      {modelValues.drivers.map((driver) => {
                        const pct = Math.max(12, Math.round((Math.abs(driver.effect_pct) / modelValues.maxDriver) * 100));
                        return (
                          <li key={driver.key} className="grid grid-cols-[9rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
                            <span className={clsx("truncate text-mist", bn && "font-bangla")}>
                              {formatDriverLabel(driver, lang)}
                            </span>
                            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-white/8">
                              <span
                                className="block h-full rounded-full bg-royal"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="text-right font-semibold text-white tnum">
                              {driver.direction === "down" ? "−" : "+"}
                              {Math.round(Math.abs(driver.effect_pct))}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {activeStage === 3 ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={clsx("text-sm font-bold text-white", bn && "font-bangla")}>
                          {bn ? VERIFIED_WARD.wardBn : VERIFIED_WARD.wardEn}
                        </p>
                        <p className={clsx("mt-0.5 text-xs text-mist tnum", bn && "font-bangla")}>
                          {bn
                            ? `পূর্বাভাস সপ্তাহ: ${VERIFIED_WARD.targetDateBn} · প্রকৃত রোগী ছিল ${VERIFIED_WARD.actualPeakCases}`
                            : `Target week: ${modelValues.targetWeek} · actual observed surge: ${VERIFIED_WARD.actualPeakCases} cases`}
                        </p>
                      </div>
                      <RiskTierBadge tier={modelValues.tier} size="sm" lang={lang} />
                    </div>

                    {/* Ready-to-send SMS preview */}
                    <div className="mt-4 rounded-[10px] bg-navy/70 p-3.5 ring-1 ring-white/12">
                      <div className="flex items-center justify-between text-[11px] text-mist">
                        <span className={clsx("inline-flex items-center gap-1.5 font-semibold text-white", bn && "font-bangla")}>
                          <MessageSquareText className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                          {bn ? "মাঠকর্মীর এসএমএস বার্তা" : "Field supervisor SMS dispatch"}
                        </span>
                        <span className="tnum">{smsText.length} / 160</span>
                      </div>
                      <p className={clsx("mt-2 text-xs leading-5 text-white", bn && "font-bangla")}>
                        {smsText}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
