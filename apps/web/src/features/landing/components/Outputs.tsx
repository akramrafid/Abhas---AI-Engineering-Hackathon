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
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { RiskTierBadge, TIER_META } from "@/components/brand/RiskTierBadge";
import { EASE_OUT, FULL_MOTION, gsap, SplitText, useGSAP } from "@/components/motion/gsap";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { useWardsQuery } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { TIER_ACTIONS_BN } from "@/lib/i18n";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";
import { useSpotlightForecast } from "./ForecastCard";

const CAPABILITIES = [
  {
    icon: LineChart,
    does: "Per-ward 1–4w curve + 80% range",
    why: "Stage beds, saline, and larvicide using upper-bound risk (P90) instead of a single guess.",
    href: "/dashboard?demo=1",
    cta: "Open Ward Forecast",
  },
  {
    icon: Timer,
    does: "SHAP driver waterfall",
    why: "Show council officers whether rainfall lag, humidity, or drainage drove a Critical flag.",
    href: "/dashboard?demo=1&tab=lags",
    cta: "Explore Rain Lags",
  },
  {
    icon: CloudRain,
    does: "What-if weather sandbox",
    why: "Simulate a 150 mm storm or heatwave before it hits and see the exact expected case delta.",
    href: "/dashboard?demo=1&tab=scenario",
    cta: "Try Scenario Sandbox",
  },
  {
    icon: ListOrdered,
    does: "Priority list + safe CSV export",
    why: "Rank all 60 wards worst-first and export clean spreadsheets for zonal dispatch sheets.",
    href: "/dashboard?demo=1&tab=priority",
    cta: "View Priority List",
  },
] as const;

export function Outputs() {
  const scope = useRef<HTMLElement>(null);
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
  const sms = `ABHAS · Ward ${ward}: ${tier} risk in 3 weeks. ${TIER_META[tier].action} Details on the ward dashboard.`;
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

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.from("[data-output]", {
          y: 36,
          autoAlpha: 0,
          duration: 0.9,
          ease: EASE_OUT,
          stagger: 0.1,
          scrollTrigger: { trigger: scope.current, start: "top 72%" },
        });
        // The SMS writes itself in once the tile is on screen.
        const split = SplitText.create("[data-sms-text]", { type: "words,chars" });
        gsap.from(split.chars, {
          autoAlpha: 0,
          duration: 0.01,
          stagger: 0.018,
          scrollTrigger: { trigger: "[data-sms-text]", start: "top 82%" },
        });
        return () => split.revert();
      });
    },
    { scope, dependencies: [sms] },
  );

  return (
    <section
      ref={scope}
      id="outputs"
      aria-labelledby="outputs-heading"
      className="relative overflow-hidden bg-paper px-4 py-24 text-ink sm:px-8 lg:py-32 scroll-mt-20"
    >
      {/* Subtle architectural canvas sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(47,91,255,0.06),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2
            id="outputs-heading"
            className="text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy"
          >
            One forecast. Three ways to act on it.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-slate lg:justify-self-end">
            The same tier, meter and calm voice everywhere: on the dashboard, in an SMS to the ward officer and on a
            printed notice for the field team, in Bangla and English.
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
                    A4 · EN + বাংলা
                  </span>
                </div>
                <p lang="bn" className="relative mt-5 font-bangla text-2xl font-bold leading-snug tracking-tight">
                  ডেঙ্গু ঝুঁকি সতর্কতা
                </p>
                <p className="relative mt-0.5 text-sm text-mist/90">
                  Dengue risk notice · Week of {issueWeek}
                </p>
              </header>

              <div className="space-y-5 p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-sm font-bold text-navy">
                      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-royal" />
                      {wardLabel(SPOTLIGHT_WARD)}, Dhaka South
                    </p>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-mist">
                      Next 3 weeks
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <RiskTierBadge tier={tier} size="md" lang="bn" />
                  </div>

                  {/* Two-column structured telemetry well */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-paper/85 p-3.5 ring-1 ring-mist/80">
                      <p className="text-[11px] font-medium text-slate">Expected cases</p>
                      <p className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tracking-tight text-navy tnum">
                          {h ? h.expected_cases.toFixed(1) : "…"}
                        </span>
                        <span className="text-xs font-medium text-slate">/ wk</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-paper/85 p-3.5 ring-1 ring-mist/80">
                      <p className="text-[11px] font-medium text-slate">80% range (P10–P90)</p>
                      <p className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tracking-tight text-navy tnum">
                          {h ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "…"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Paired bilingual field checklist */}
                <ul className="space-y-2.5 border-t border-mist/80 pt-5">
                  <li className="flex items-start gap-3 rounded-xl bg-paper/65 px-3.5 py-3 ring-1 ring-mist/60">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
                    <div className="min-w-0 space-y-0.5">
                      <p lang="bn" className="font-bangla text-sm font-semibold leading-snug text-navy">
                        {TIER_ACTIONS_BN[tier]}
                      </p>
                      <p className="text-xs leading-relaxed text-slate">{TIER_META[tier].action}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl bg-paper/65 px-3.5 py-3 ring-1 ring-mist/60">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
                    <div className="min-w-0 space-y-0.5">
                      <p lang="bn" className="font-bangla text-sm font-semibold leading-snug text-navy">
                        ড্রেন ও পাত্রের জমা পানি পরিষ্কার করুন
                      </p>
                      <p className="text-xs leading-relaxed text-slate">
                        Clear standing water in drains and containers
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-mist/80 bg-paper/75 px-6 py-3.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate">
                <Printer aria-hidden="true" className="h-4 w-4 text-slate" />
                A4 portrait · printable brief
              </span>
              <Link
                href="/dashboard?demo=1"
                className="group inline-flex items-center gap-1 text-xs font-semibold text-royal transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 rounded"
              >
                Open brief
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </footer>
          </article>

          {/* 2. SMS alert: dark dispatch preview with character gauge & copy action */}
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
                  <p className="text-sm font-semibold text-white">SMS alert</p>
                  <p className="text-xs text-mist/80">Single GSM-7 segment · ward officer dispatch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopySms}
                aria-label="Copy sample SMS text"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {copiedSms ? (
                  <>
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                    Copy SMS
                  </>
                )}
              </button>
            </div>

            <div className="relative mt-5 rounded-2xl rounded-tl-sm bg-white/[0.08] p-4 ring-1 ring-white/15 backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-mist/80">
                <span className="font-semibold tracking-wide text-white/90">ABHAS ALERT</span>
                <span className="tnum">Mon · 08:00 BST</span>
              </div>
              <p data-sms-text className="mt-2 text-[15px] font-medium leading-6 text-white">
                {sms}
              </p>
            </div>

            <div className="relative mt-4 flex items-center gap-3">
              <div
                aria-hidden="true"
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12"
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2F5BFF_0%,#7C9BFF_100%)] transition-all duration-500"
                  style={{ width: `${smsPct}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium text-mist/90 tnum">
                {sms.length} / 160 chars
              </span>
            </div>
          </article>

          {/* 3. Weekly priority list: ranked rows with proportional surge intensity bars */}
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
                  <p className="text-sm font-bold text-navy">Priority list · Dhaka South</p>
                  <p className="text-xs text-slate">Week of {issueWeek} · ranked worst-first</p>
                </div>
              </div>
              <Link
                href="/dashboard?demo=1&tab=priority"
                className="group inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-royal ring-1 ring-mist transition-colors hover:bg-royal hover:text-white hover:ring-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
              >
                All 60 wards
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
                      href={`/dashboard?demo=1&ward=${encodeURIComponent(w.ward_id)}`}
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
                          <span className="truncate text-sm font-semibold text-navy transition-colors group-hover:text-royal">
                            {wardLabel(w.ward_id)}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-navy tnum">
                            {cases.toFixed(1)}{" "}
                            <span className="font-normal text-slate">cases</span>
                          </span>
                        </div>
                        <div
                          aria-hidden="true"
                          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-mist/75"
                        >
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#0B1A5C_0%,#2F5BFF_100%)]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {w.tier ? <RiskTierBadge tier={w.tier} size="sm" /> : null}
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

        {/* Features framed as What it does -> Why it matters, each deep-linking to its live view */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((feat) => {
            const Icon = feat.icon;
            return (
              <Link
                key={feat.does}
                href={feat.href}
                data-output
                className="group flex flex-col justify-between rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-16px_rgba(11,26,92,0.12)] ring-1 ring-mist/90 transition-all duration-200 hover:-translate-y-0.5 hover:ring-royal/35 hover:shadow-[0_10px_28px_-14px_rgba(47,91,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
              >
                <div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors duration-200 group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold leading-snug tracking-tight text-navy">
                    {feat.does}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate">{feat.why}</p>
                </div>
                <span className="mt-5 flex items-center justify-between border-t border-mist/75 pt-3.5 text-xs font-semibold text-royal transition-colors group-hover:text-navy">
                  {feat.cta}
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
