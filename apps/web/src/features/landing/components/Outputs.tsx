"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudRain,
  Copy,
  LineChart,
  ListOrdered,
  MapPin,
  MessageSquareText,
  Printer,
  Timer,
} from "@/components/icons";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { RiskTierBadge, TIER_META } from "@/components/brand/RiskTierBadge";
import { EASE_OUT, FULL_MOTION, gsap, SplitText, useGSAP } from "@/components/motion/gsap";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { useWardsQuery } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { TIER_ACTIONS_BN } from "@/lib/i18n";
import { useLandingLang } from "../lang-context";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";
import { useSpotlightForecast } from "./ForecastCard";

const CAPABILITIES = [
  {
    icon: LineChart,
    doesEn: "Per-ward 1–4w curve + 80% range",
    doesBn: "প্রতি ওয়ার্ডের ১–৪ সপ্তাহের গ্রাফ + ৮০% পরিসর",
    whyEn: "Stage beds, saline, and larvicide using upper-bound risk (P90) instead of a single guess.",
    whyBn: "একটি অনুমানের বদলে সর্বোচ্চ ঝুঁকির সীমা (P90) দেখে শয্যা, স্যালাইন ও লার্ভিসাইড প্রস্তুত রাখুন।",
    href: "/dashboard?demo=1",
    ctaEn: "Open Ward Forecast",
    ctaBn: "ওয়ার্ড পূর্বাভাস খুলুন",
  },
  {
    icon: Timer,
    doesEn: "SHAP driver waterfall",
    doesBn: "SHAP কারণ বিশ্লেষণ",
    whyEn: "Show council officers whether rainfall lag, humidity, or drainage drove a Critical flag.",
    whyBn: "বৃষ্টির ল্যাগ, আর্দ্রতা নাকি জলাবদ্ধতা সংকটপূর্ণ স্তর তৈরি করেছে তা পরিষ্কার দেখান।",
    href: "/dashboard?demo=1&tab=lags",
    ctaEn: "Explore Rain Lags",
    ctaBn: "বৃষ্টির ল্যাগ দেখুন",
  },
  {
    icon: CloudRain,
    doesEn: "What-if weather sandbox",
    doesBn: "আবহাওয়া সিমুলেটর",
    whyEn: "Simulate a 150 mm storm or heatwave before it hits and see the exact expected case delta.",
    whyBn: "১৫০ মিমি ঝড় বা তাপপ্রবাহ আসার আগেই সম্ভাব্য রোগী বৃদ্ধির সঠিক হিসাব দেখুন।",
    href: "/dashboard?demo=1&tab=scenario",
    ctaEn: "Try Scenario Sandbox",
    ctaBn: "সিমুলেটর চালু করুন",
  },
  {
    icon: ListOrdered,
    doesEn: "Priority list + safe CSV export",
    doesBn: "অগ্রাধিকার তালিকা ও নিরাপদ CSV",
    whyEn: "Rank all 60 wards worst-first and export clean spreadsheets for zonal dispatch sheets.",
    whyBn: "সব ৬০টি ওয়ার্ড সর্বোচ্চ ঝুঁকি অনুযায়ী সাজিয়ে আঞ্চলিক মাঠ-তালিকার জন্য CSV ডাউনলোড করুন।",
    href: "/dashboard?demo=1&tab=priority",
    ctaEn: "View Priority List",
    ctaBn: "অগ্রাধিকার তালিকা দেখুন",
  },
] as const;

export function Outputs() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const scope = useRef<HTMLElement>(null);
  const capRowRef = useRef<HTMLDivElement>(null);
  const [copiedSms, setCopiedSms] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const forecast = useSpotlightForecast();
  const h = forecast.data?.forecasts[0]?.horizons[0];
  const wardsQuery = useWardsQuery();
  const storm = useAllCityHeatmaps(STORM_ORIGIN, "dataset");

  const priority = useMemo(
    () =>
      buildMapWards(wardsQuery.data?.wards ?? [], storm.cellsByWard, 3, [3])
        .filter((w) => w.city === "Dhaka South" && w.tier)
        .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0))
        .slice(0, 5),
    [wardsQuery.data, storm.cellsByWard],
  );

  const maxPriorityCases = useMemo(
    () => Math.max(...priority.map((w) => w.expected_cases ?? 0), 1),
    [priority],
  );

  const tier = h?.tier ?? "Critical";
  const ward = String(wardNumber(SPOTLIGHT_WARD)).padStart(2, "0");
  const sms = bn
    ? `আভাস · ওয়ার্ড ${ward}: ৩ সপ্তাহে ${TIER_META[tier].labelBn} ঝুঁকি। ${TIER_ACTIONS_BN[tier]} বিস্তারিত ড্যাশবোর্ডে।`
    : `ABHAS · Ward ${ward}: ${tier} risk in 3 weeks. ${TIER_META[tier].action} Details on the ward dashboard.`;
  const smsPct = Math.min(100, Math.round((sms.length / 160) * 100));
  const issueWeek = h ? formatShortDate(h.target_week) : formatShortDate(STORM_ORIGIN);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopySms() {
    try {
      await navigator.clipboard.writeText(sms);
      setCopiedSms(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedSms(false), 2000);
    } catch {
      // Clipboard API unavailable in restricted contexts; ignore silently.
    }
  }

  // Animate the three primary output cards and four capability cards once with explicit fromTo targets
  // (never tied to async `sms` updates, so staggered cards can never freeze at opacity 0).
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.fromTo(
          "[data-output]",
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: EASE_OUT,
            stagger: 0.08,
            clearProps: "transform,opacity",
            scrollTrigger: { trigger: scope.current, start: "top 82%", once: true },
          },
        );
        if (capRowRef.current) {
          gsap.fromTo(
            "[data-output-cap]",
            { y: 20, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.6,
              ease: EASE_OUT,
              stagger: 0.06,
              clearProps: "transform,opacity",
              scrollTrigger: { trigger: capRowRef.current, start: "top 90%", once: true },
            },
          );
        }
      });
    },
    { scope },
  );

  // Separate SMS typewriter effect with revertOnUpdate so switching EN/বাংলা cleanly resets only the SMS text.
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        const split = SplitText.create("[data-sms-text]", { type: "words,chars" });
        gsap.fromTo(
          split.chars,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.01,
            stagger: 0.014,
            clearProps: "opacity",
            scrollTrigger: { trigger: "[data-sms-text]", start: "top 88%", once: true },
          },
        );
        return () => split.revert();
      });
    },
    { scope, dependencies: [sms], revertOnUpdate: true },
  );

  return (
    <section
      ref={scope}
      id="outputs"
      aria-labelledby="outputs-heading"
      lang={lang}
      className="relative overflow-hidden bg-paper px-4 pt-24 pb-16 text-ink sm:px-8 lg:pt-28 lg:pb-20 scroll-mt-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(47,91,255,0.06),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2
            id="outputs-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "একটি পূর্বাভাস। কাজ করার তিনটি স্পষ্ট উপায়।"
              : "One forecast. Three ways to act on it."}
          </h2>
          <p className={clsx("max-w-lg text-lg leading-8 text-slate lg:justify-self-end", bn && "font-bangla")}>
            {bn
              ? "সবখানে একই ঝুঁকির স্তর ও স্পষ্ট নির্দেশনা: ড্যাশবোর্ডে, ওয়ার্ড কর্মকর্তার মোবাইলে এসএমএস-এ, এবং মাঠকর্মীদের প্রিন্ট করা নোটিশে।"
              : "The same tier, meter and calm voice everywhere: on the dashboard, in an SMS to the ward officer and on a printed notice for the field team, in Bangla and English."}
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr]">
          {/* 1. Field notice: tactile A4 portrait ward brief */}
          <article
            data-output
            className="flex flex-col justify-between overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(11,26,92,0.05),0_20px_44px_-20px_rgba(11,26,92,0.16)] ring-1 ring-mist/90 transition-shadow duration-300 hover:shadow-[0_4px_14px_rgba(11,26,92,0.07),0_26px_52px_-20px_rgba(11,26,92,0.2)] lg:row-span-2"
          >
            <div>
              <header className="relative overflow-hidden bg-[linear-gradient(135deg,#0B1A5C_0%,#11277F_62%,#1D3CB8_100%)] px-6 py-6 text-white">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-royal/35 blur-2xl"
                />
                <div className="relative flex items-center justify-between gap-3">
                  <AbhasLogo variant="reverse" size="sm" />
                  <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-white/95 ring-1 ring-white/15 backdrop-blur-sm">
                    {bn ? "এ৪ · বাংলা নোটিশ" : "A4 · Field Brief"}
                  </span>
                </div>
                <p className={clsx("relative mt-5 text-2xl font-bold leading-snug tracking-tight", bn && "font-bangla")}>
                  {bn ? "ডেঙ্গু ঝুঁকি সতর্কতা" : "Dengue risk notice"}
                </p>
                <p className={clsx("relative mt-0.5 text-sm text-mist/90", bn && "font-bangla")}>
                  {bn ? `সাপ্তাহিক মাঠ নির্দেশিকা · ${issueWeek}` : `Weekly field directive · Week of ${issueWeek}`}
                </p>
              </header>

              <div className="space-y-5 p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={clsx("inline-flex items-center gap-1.5 text-sm font-bold text-navy", bn && "font-bangla")}>
                      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-royal" />
                      {bn ? `ওয়ার্ড ${wardNumber(SPOTLIGHT_WARD)}, ঢাকা দক্ষিণ` : `${wardLabel(SPOTLIGHT_WARD)}, Dhaka South`}
                    </p>
                    <span className={clsx("rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-mist", bn && "font-bangla")}>
                      {bn ? "আগামী ৩ সপ্তাহ" : "Next 3 weeks"}
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <RiskTierBadge tier={tier} size="md" lang={lang} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-paper/85 p-3.5 ring-1 ring-mist/80">
                      <p className={clsx("text-[11px] font-medium text-slate", bn && "font-bangla")}>
                        {bn ? "প্রত্যাশিত রোগী" : "Expected cases"}
                      </p>
                      <p className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tracking-tight text-navy tnum">
                          {h ? h.expected_cases.toFixed(1) : "…"}
                        </span>
                        <span className={clsx("text-xs font-medium text-slate", bn && "font-bangla")}>
                          {bn ? "/ সপ্তাহ" : "/ wk"}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-paper/85 p-3.5 ring-1 ring-mist/80">
                      <p className={clsx("text-[11px] font-medium text-slate", bn && "font-bangla")}>
                        {bn ? "৮০% পরিসর (P10–P90)" : "80% range (P10–P90)"}
                      </p>
                      <p className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tracking-tight text-navy tnum">
                          {h ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "…"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <ul className="space-y-2.5 border-t border-mist/80 pt-5">
                  <li className="flex items-start gap-3 rounded-xl bg-paper/65 px-3.5 py-3 ring-1 ring-mist/60">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
                    <p className={clsx("text-sm font-semibold leading-snug text-navy", bn && "font-bangla")}>
                      {bn ? TIER_ACTIONS_BN[tier] : TIER_META[tier].action}
                    </p>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl bg-paper/65 px-3.5 py-3 ring-1 ring-mist/60">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
                    <p className={clsx("text-sm font-semibold leading-snug text-navy", bn && "font-bangla")}>
                      {bn
                        ? "ড্রেন ও পাত্রের জমা পানি পরিষ্কার করুন"
                        : "Clear standing water in drains and containers"}
                    </p>
                  </li>
                </ul>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-mist/80 bg-paper/75 px-6 py-3.5">
              <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium text-slate", bn && "font-bangla")}>
                <Printer aria-hidden="true" className="h-4 w-4 text-slate" />
                {bn ? "এ৪ পোর্ট্রেট · প্রিন্টযোগ্য ব্রিফ" : "A4 portrait · printable brief"}
              </span>
              <Link
                href={`/dashboard?demo=1&lang=${lang}`}
                className={clsx(
                  "group inline-flex items-center gap-1 text-xs font-semibold text-royal transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 rounded",
                  bn && "font-bangla",
                )}
              >
                {bn ? "ব্রিফ খুলুন" : "Open brief"}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </footer>
          </article>

          {/* 2. SMS alert */}
          <article
            data-output
            className="relative overflow-hidden rounded-[20px] bg-[linear-gradient(145deg,#0B0F14_0%,#0B1A5C_72%,#132B8C_100%)] p-6 text-white shadow-[0_1px_2px_rgba(11,15,20,0.2),0_20px_44px_-20px_rgba(11,26,92,0.4)] ring-1 ring-white/10"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-royal/30 blur-3xl"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <MessageSquareText aria-hidden="true" className="h-4.5 w-4.5 text-white" />
                </span>
                <div>
                  <p className={clsx("text-sm font-semibold text-white", bn && "font-bangla")}>
                    {bn ? "এসএমএস সতর্কতা" : "SMS alert"}
                  </p>
                  <p className={clsx("text-xs text-mist/80", bn && "font-bangla")}>
                    {bn ? "একক এসএমএস বার্তা · ওয়ার্ড কর্মকর্তার জন্য" : "Single GSM-7 segment · ward officer dispatch"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopySms}
                className={clsx(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  bn && "font-bangla",
                )}
              >
                {copiedSms ? (
                  <>
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    {bn ? "কপি হয়েছে" : "Copied"}
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                    {bn ? "এসএমএস কপি" : "Copy SMS"}
                  </>
                )}
              </button>
            </div>

            <div className="relative mt-5 rounded-2xl rounded-tl-sm bg-white/[0.08] p-4 ring-1 ring-white/15 backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-mist/80">
                <span className={clsx("font-semibold tracking-wide text-white/90", bn && "font-bangla")}>
                  {bn ? "আভাস সতর্কতা" : "ABHAS ALERT"}
                </span>
                <span className="tnum">{bn ? "সোমবার · ০৮:০০ BST" : "Mon · 08:00 BST"}</span>
              </div>
              <p data-sms-text className={clsx("mt-2 text-[15px] font-medium leading-6 text-white", bn && "font-bangla")}>
                {sms}
              </p>
            </div>

            <div className="relative mt-4 flex items-center gap-3">
              <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2F5BFF_0%,#7C9BFF_100%)] transition-all duration-500"
                  style={{ width: `${smsPct}%` }}
                />
              </div>
              <span className={clsx("shrink-0 text-xs font-medium text-mist/90 tnum", bn && "font-bangla")}>
                {sms.length} / 160 {bn ? "অক্ষর" : "chars"}
              </span>
            </div>
          </article>

          {/* 3. Weekly priority list */}
          <article
            data-output
            className="flex flex-col justify-between rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(11,26,92,0.05),0_20px_44px_-20px_rgba(11,26,92,0.14)] ring-1 ring-mist/90 transition-shadow duration-300 hover:shadow-[0_4px_14px_rgba(11,26,92,0.07),0_26px_52px_-20px_rgba(11,26,92,0.18)]"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-mist/80 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15">
                  <ListOrdered aria-hidden="true" className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className={clsx("text-sm font-bold text-navy", bn && "font-bangla")}>
                    {bn ? "অগ্রাধিকার তালিকা · ঢাকা দক্ষিণ" : "Priority list · Dhaka South"}
                  </p>
                  <p className={clsx("text-xs text-slate", bn && "font-bangla")}>
                    {bn ? `সপ্তাহ ${issueWeek} · সর্বোচ্চ ঝুঁকি অনুযায়ী` : `Week of ${issueWeek} · ranked worst-first`}
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard?demo=1&tab=priority&lang=${lang}`}
                className={clsx(
                  "group inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-royal ring-1 ring-mist transition-colors hover:bg-royal hover:text-white hover:ring-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2",
                  bn && "font-bangla",
                )}
              >
                {bn ? "সব ৬০টি ওয়ার্ড" : "All 60 wards"}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </header>

            <ol className="mt-3 space-y-1">
              {priority.map((w, i) => {
                const cases = w.expected_cases ?? 0;
                const barWidth = Math.max(14, Math.round((cases / maxPriorityCases) * 100));
                const rankLabel = String(i + 1).padStart(2, "0");

                return (
                  <li key={w.ward_id}>
                    <Link
                      href={`/dashboard?demo=1&ward=${encodeURIComponent(w.ward_id)}&lang=${lang}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                    >
                      <span
                        className={
                          i === 0
                            ? "flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-xs font-bold text-white tnum"
                            : "flex h-7 w-7 items-center justify-center rounded-lg bg-paper text-xs font-semibold text-slate ring-1 ring-mist transition-colors group-hover:bg-white tnum"
                        }
                      >
                        {rankLabel}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={clsx("truncate text-sm font-semibold text-navy transition-colors group-hover:text-royal", bn && "font-bangla")}>
                            {bn ? `ওয়ার্ড ${wardNumber(w.ward_id)}` : wardLabel(w.ward_id)}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-navy tnum">
                            {cases.toFixed(1)}{" "}
                            <span className={clsx("font-normal text-slate", bn && "font-bangla")}>
                              {bn ? "রোগী" : "cases"}
                            </span>
                          </span>
                        </div>
                        <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-mist/75">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#0B1A5C_0%,#2F5BFF_100%)]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {w.tier ? <RiskTierBadge tier={w.tier} size="sm" lang={lang} /> : null}
                        <ChevronRight
                          aria-hidden="true"
                          className="hidden h-4 w-4 text-slate/60 transition-transform group-hover:translate-x-0.5 group-hover:text-royal sm:block"
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </article>
        </div>

        {/* Bottom 4-column capabilities */}
        <div ref={capRowRef} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((feat) => {
            const Icon = feat.icon;
            return (
              <Link
                key={feat.doesEn}
                href={`${feat.href}&lang=${lang}`}
                data-output-cap
                className="group flex flex-col justify-between rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-16px_rgba(11,26,92,0.12)] ring-1 ring-mist/90 transition-all duration-200 hover:-translate-y-0.5 hover:ring-royal/35 hover:shadow-[0_10px_28px_-14px_rgba(47,91,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
              >
                <div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors duration-200 group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className={clsx("mt-4 text-[15px] font-bold leading-snug tracking-tight text-navy", bn && "font-bangla")}>
                    {bn ? feat.doesBn : feat.doesEn}
                  </h3>
                  <p className={clsx("mt-1.5 text-sm leading-6 text-slate", bn && "font-bangla")}>
                    {bn ? feat.whyBn : feat.whyEn}
                  </p>
                </div>
                <span className={clsx("mt-5 flex items-center justify-between border-t border-mist/75 pt-3.5 text-xs font-semibold text-royal transition-colors group-hover:text-navy", bn && "font-bangla")}>
                  {bn ? feat.ctaBn : feat.ctaEn}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
