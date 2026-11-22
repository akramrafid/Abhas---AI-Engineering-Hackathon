"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { Marquee } from "@/components/ui/Marquee";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { useWardsQuery } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { useLandingLang } from "../lang-context";
import { STORM_ORIGIN } from "../rain-clock-steps";

const CITY_BN: Record<string, string> = {
  "Dhaka South": "ঢাকা দক্ষিণ",
  "Dhaka North": "ঢাকা উত্তর",
  Chattogram: "চট্টগ্রাম",
  Gazipur: "গাজীপুর",
  Narayanganj: "নারায়ণগঞ্জ",
};

const HARD_STATS = [
  { value: "60", labelEn: "wards monitored", labelBn: "ওয়ার্ড পর্যবেক্ষণে" },
  { value: "5", labelEn: "city corporations", labelBn: "সিটি কর্পোরেশন" },
  { value: "31,320", labelEn: "ward-weeks analysed", labelBn: "ওয়ার্ড-সপ্তাহ বিশ্লেষিত" },
  { value: "~20%", labelEn: "lower 3w MAE vs baseline", labelBn: "কম ৩-সপ্তাহের MAE" },
  { value: "0.59 ms", labelEn: "CPU forecast per ward", labelBn: "প্রতি ওয়ার্ডে CPU পূর্বাভাস" },
] as const;

export function LiveStrip() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const wardsQuery = useWardsQuery();
  const storm = useAllCityHeatmaps(STORM_ORIGIN, "dataset");
  const ranked = useMemo(
    () =>
      buildMapWards(wardsQuery.data?.wards ?? [], storm.cellsByWard, 3, [3])
        .filter((w) => w.tier)
        .sort((a, b) => (b.expected_cases ?? 0) - (a.expected_cases ?? 0)),
    [wardsQuery.data, storm.cellsByWard],
  );
  const half = Math.ceil(ranked.length / 2);
  const target = ranked[0]?.target_week;

  return (
    <section
      aria-label={bn ? "পরিমাপকৃত কভারেজ ও সাপ্তাহিক ওয়ার্ড তালিকা" : "Measured coverage and this week's ward list"}
      className="bg-ink pb-20 pt-10 text-white sm:pb-28"
    >
      {/* Hard-number social proof bar */}
      <div className="mx-auto mb-14 max-w-6xl px-4 sm:px-8">
        <dl className="grid grid-cols-2 gap-6 border-y border-white/10 py-7 sm:grid-cols-3 lg:grid-cols-5">
          {HARD_STATS.map((stat) => (
            <div key={stat.labelEn}>
              <dt lang={lang} className={clsx("text-xs text-mist", bn && "font-bangla")}>
                {bn ? stat.labelBn : stat.labelEn}
              </dt>
              <dd className="mt-1 text-2xl font-extrabold tracking-tight text-white tnum sm:text-3xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {ranked.length ? (
        <div data-testid="ward-marquee">
          <p
            lang={lang}
            className={clsx("mx-auto max-w-6xl px-4 text-sm text-mist sm:px-8", bn && "font-bangla")}
          >
            {bn ? (
              <>
                <span className="text-white tnum">{target ? formatShortDate(target) : "…"}</span> সপ্তাহের পূর্বাভাস,
                তৈরি হয়েছে <span className="text-white tnum">{formatShortDate(STORM_ORIGIN)}</span> তারিখে — ৬০টি ওয়ার্ডের
                ৩১,৩২০ ওয়ার্ড-সপ্তাহের ইতিহাস থেকে সর্বোচ্চ ঝুঁকিপূর্ণ ওয়ার্ডগুলো আগে সাজানো।
              </>
            ) : (
              <>
                Forecast for the week of <span className="font-mono text-white tnum">{target ? formatShortDate(target) : "…"}</span>,
                made <span className="font-mono text-white tnum">{formatShortDate(STORM_ORIGIN)}</span>, from 31,320 ward-weeks of history across 60 wards. Every ward, highest expected cases first.
              </>
            )}
          </p>
          <div className="mt-5 space-y-3 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            {[ranked.slice(0, half), ranked.slice(half)].map((row, i) => (
              <Marquee key={i} reverse={i === 1} pauseOnHover>
                {row.map((ward) => (
                  <span
                    key={ward.ward_id}
                    className="inline-flex items-center gap-3 rounded-[10px] bg-navy/70 py-2 pl-3.5 pr-2 ring-1 ring-white/10"
                  >
                    <span className={clsx("text-sm font-semibold", bn && "font-bangla")}>
                      {bn ? `ওয়ার্ড ${wardNumber(ward.ward_id)}` : wardLabel(ward.ward_id)}
                    </span>
                    <span className={clsx("text-xs text-mist", bn && "font-bangla")}>
                      {bn ? (CITY_BN[ward.city] ?? ward.city) : ward.city}
                    </span>
                    <span className="text-sm font-semibold text-white tnum">{ward.expected_cases?.toFixed(1)}</span>
                    {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" lang={lang} /> : null}
                  </span>
                ))}
              </Marquee>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
