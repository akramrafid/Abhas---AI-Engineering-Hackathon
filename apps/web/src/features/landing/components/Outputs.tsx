"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareText } from "@/components/icons";
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

export function Outputs() {
  const scope = useRef<HTMLElement>(null);
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

  const tier = h?.tier ?? "Critical";
  const ward = String(wardNumber(SPOTLIGHT_WARD)).padStart(2, "0");
  const sms = `ABHAS · Ward ${ward}: ${tier} risk in 3 weeks. ${TIER_META[tier].action} Details on the ward dashboard.`;

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.from("[data-output]", {
          y: 40,
          autoAlpha: 0,
          duration: 1,
          ease: EASE_OUT,
          stagger: 0.12,
          scrollTrigger: { trigger: scope.current, start: "top 70%" },
        });
        // The SMS writes itself in once the tile is on screen.
        const split = SplitText.create("[data-sms-text]", { type: "words,chars" });
        gsap.from(split.chars, {
          autoAlpha: 0,
          duration: 0.01,
          stagger: 0.018,
          scrollTrigger: { trigger: "[data-sms-text]", start: "top 80%" },
        });
        return () => split.revert();
      });
    },
    { scope, dependencies: [sms] },
  );

  return (
    <section ref={scope} id="outputs" aria-labelledby="outputs-heading" className="bg-paper px-4 py-24 text-ink sm:px-8 lg:py-32 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2 id="outputs-heading" className="text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy">
            One forecast. Three ways to act on it.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-slate lg:justify-self-end">
            The same tier, meter and calm voice everywhere: on the dashboard, in an SMS to the ward officer and on a
            printed notice for the field team, in Bangla and English.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr]">
          {/* Field notice: A4 portrait ward brief from the brand guidelines (p.15). */}
          <article data-output className="overflow-hidden rounded-[14px] bg-white ring-1 ring-mist lg:row-span-2">
            <header className="bg-navy px-6 py-5 text-white">
              <AbhasLogo variant="reverse" size="sm" />
              <p lang="bn" className="mt-3 font-bangla text-xl font-bold">ডেঙ্গু ঝুঁকি সতর্কতা</p>
              <p className="text-sm text-mist">Dengue risk notice</p>
            </header>
            <div className="space-y-6 p-6">
              <div>
                <p className="text-sm font-bold text-navy">
                  {wardLabel(SPOTLIGHT_WARD)}, Dhaka South · next 3 weeks
                </p>
                <div className="mt-3">
                  <RiskTierBadge tier={tier} size="md" lang="bn" />
                </div>
                <p className="mt-4 text-sm text-slate">
                  <span className="font-mono font-semibold text-ink tnum">{h ? h.expected_cases.toFixed(1) : "…"}</span> expected cases ·
                  range <span className="font-mono text-ink tnum">{h ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "…"}</span>
                </p>
              </div>
              <ul className="space-y-2.5 border-t border-mist pt-5 text-sm leading-6">
                <li lang="bn" className="font-bangla">• {TIER_ACTIONS_BN[tier]}</li>
                <li lang="bn" className="font-bangla">• ড্রেন ও পাত্রের জমা পানি পরিষ্কার করুন</li>
                <li>• {TIER_META[tier].action}</li>
                <li>• Clear standing water in drains and containers</li>
              </ul>
            </div>
            <p className="border-t border-mist px-6 py-4 text-xs text-slate">
              Field notice · A4 portrait · printable from any ward page of the dashboard
            </p>
          </article>

          {/* SMS alert: 160 characters, ward and window first. */}
          <article data-output className="rounded-[14px] bg-ink p-6 text-white ring-1 ring-ink">
            <p className="flex items-center gap-2 text-sm font-semibold text-mist">
              <MessageSquareText aria-hidden="true" className="h-4 w-4" /> SMS alert · {sms.length} of 160 characters
            </p>
            <p data-sms-text className="mt-4 rounded-[14px] rounded-tl-sm bg-navy p-4 text-[15px] leading-6">
              {sms}
            </p>
          </article>

          {/* Weekly priority list. */}
          <article data-output className="rounded-[14px] bg-white p-6 ring-1 ring-mist">
            <p className="text-sm font-bold text-navy">
              Priority list · Dhaka South · week of {h ? formatShortDate(h.target_week) : "…"}
            </p>
            <ol className="mt-4 divide-y divide-mist">
              {priority.map((w, i) => (
                <li key={w.ward_id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="w-5 font-mono text-xs text-slate tnum">{i + 1}</span>
                    <span className="text-sm font-semibold">{wardLabel(w.ward_id)}</span>
                    <span className="font-mono text-xs text-slate tnum">{w.expected_cases?.toFixed(1)}</span>
                  </span>
                  {w.tier ? <RiskTierBadge tier={w.tier} size="sm" /> : null}
                </li>
              ))}
            </ol>
          </article>
        </div>

        {/* Features framed as What it does -> Why it matters, each deep-linking to its live view */}
        <dl className="mt-14 grid gap-px overflow-hidden rounded-[14px] border border-mist bg-mist sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              does: "Per-ward 1–4w curve + 80% range",
              why: "Stage beds, saline, and larvicide using upper-bound risk (P90) instead of a single guess.",
              href: "/dashboard?demo=1",
              cta: "Open Ward Forecast",
            },
            {
              does: "SHAP driver waterfall",
              why: "Show council officers whether rainfall lag, humidity, or drainage drove a Critical flag.",
              href: "/dashboard?demo=1&tab=lags",
              cta: "Explore Rain Lags",
            },
            {
              does: "What-if weather sandbox",
              why: "Simulate a 150 mm storm or heatwave before it hits and see the exact expected case delta.",
              href: "/dashboard?demo=1&tab=scenario",
              cta: "Try Scenario Sandbox",
            },
            {
              does: "Priority list + safe CSV export",
              why: "Rank all 60 wards worst-first and export clean spreadsheets for zonal dispatch sheets.",
              href: "/dashboard?demo=1&tab=priority",
              cta: "View Priority List",
            },
          ].map((feat) => (
            <div key={feat.does} className="flex flex-col justify-between bg-white p-5">
              <div>
                <dt className="text-sm font-bold text-navy">{feat.does}</dt>
                <dd className="mt-2 text-sm leading-6 text-slate">{feat.why}</dd>
              </div>
              <Link
                href={feat.href}
                className="group mt-4 inline-flex items-center gap-1 text-xs font-semibold text-royal hover:text-navy"
              >
                {feat.cta}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
