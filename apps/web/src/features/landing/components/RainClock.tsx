"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { WardRiskMap } from "@/components/ward-map/WardRiskMap";
import { fetchWardHistory, useWardsQuery } from "@/lib/api/client";
import { addDaysIso, formatShortDate } from "@/lib/dates";
import { useLandingLang, type LandingLang } from "../lang-context";
import {
  countTiers,
  DHAKA_AREA,
  DRY_ORIGIN,
  RAIN_CLOCK_STEPS,
  SPOTLIGHT_WARD,
  STORM_ORIGIN,
  type RainClockStep,
  type StepId,
} from "../rain-clock-steps";

const SPOTLIGHT_PEAK_WEEK = addDaysIso(STORM_ORIGIN, 21) ?? STORM_ORIGIN;

const CLOCK_LABEL_BN: Record<StepId, string> = {
  rain: "বৃষ্টি",
  h1: "+১ সপ্তাহ",
  h2: "+২ সপ্তাহ",
  h3: "+৩ সপ্তাহ",
  h4: "+৪ সপ্তাহ",
  dry: "শুষ্ক সপ্তাহ",
};

function weekOf(iso: string | null | undefined): string {
  return iso ? formatShortDate(iso) : "—";
}

export function RainClock() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const sectionRef = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<StepId>("rain");
  const stepRefs = useRef(new Map<StepId, HTMLElement>());

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.to("[data-rail-fill]", {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: sectionRef.current, start: "top top", end: "bottom bottom", scrub: 0.4 },
        });
        gsap.utils.toArray<HTMLElement>("[data-step-panel]").forEach((panel) => {
          gsap.from(panel, {
            y: 48,
            autoAlpha: 0,
            ease: "power3.out",
            scrollTrigger: { trigger: panel, start: "top 85%", end: "top 55%", scrub: 0.5 },
          });
        });
      });
    },
    { scope: sectionRef },
  );

  const wardsQuery = useWardsQuery();
  const storm = useAllCityHeatmaps(STORM_ORIGIN, "dataset");
  const dry = useAllCityHeatmaps(DRY_ORIGIN, "dataset");
  const spotlightHistory = useQuery({
    queryKey: ["ward-history", SPOTLIGHT_WARD, STORM_ORIGIN, SPOTLIGHT_PEAK_WEEK],
    queryFn: ({ signal }) =>
      fetchWardHistory(SPOTLIGHT_WARD, { start: STORM_ORIGIN, end: SPOTLIGHT_PEAK_WEEK }, signal),
    staleTime: Infinity,
  });

  const wards = useMemo(() => wardsQuery.data?.wards ?? [], [wardsQuery.data]);
  const stepWards = useMemo(() => {
    const byStep = new Map<StepId, ReturnType<typeof buildMapWards>>();
    for (const step of RAIN_CLOCK_STEPS) {
      const source = step.origin === "storm" ? storm.cellsByWard : dry.cellsByWard;
      byStep.set(step.id, buildMapWards(wards, source, step.horizon ?? 1, [step.horizon ?? 1]));
    }
    return byStep;
  }, [wards, storm.cellsByWard, dry.cellsByWard]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.getAttribute("data-step") as StepId);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of stepRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const active = RAIN_CLOCK_STEPS.find((s) => s.id === activeId) ?? RAIN_CLOCK_STEPS[0];
  const activeWards = stepWards.get(active.id) ?? [];
  const apiDown = wardsQuery.isError || (storm.isError && !storm.isPending);
  const stampWeek =
    active.horizon === null
      ? STORM_ORIGIN
      : activeWards.find((w) => w.target_week)?.target_week ?? null;
  const observedPeak = spotlightHistory.data?.weeks.find((w) => w.week === SPOTLIGHT_PEAK_WEEK);
  const mapLabel = describeMap(active, activeWards);

  return (
    <section ref={sectionRef} id="rain-clock" aria-labelledby="rain-clock-heading" className="relative bg-ink text-white scroll-mt-20">
      <div className="sticky top-0 h-[100svh] w-full">
        <WardRiskMap
          wards={activeWards}
          view={active.view}
          mode={active.mode}
          label={mapLabel}
          highlightWardId={active.id === "h3" ? SPOTLIGHT_WARD : null}
          reserveForCopy
          className="h-full w-full"
        />
        <MapLegend mode={active.mode} lang={lang} />
        {active.horizon !== null ? (
          <p
            lang={lang}
            className={clsx(
              "pointer-events-none absolute bottom-5 left-8 z-10 hidden rounded-md bg-ink/80 px-2.5 py-1.5 text-xs text-mist sm:block lg:left-14 tnum",
              bn && "font-bangla",
            )}
          >
            {bn ? (
              <>
                {weekOf(stampWeek)} সপ্তাহের পূর্বাভাস · তৈরি {weekOf(active.origin === "storm" ? STORM_ORIGIN : DRY_ORIGIN)}
              </>
            ) : (
              <>
                Forecast for the week of {weekOf(stampWeek)} · made{" "}
                {weekOf(active.origin === "storm" ? STORM_ORIGIN : DRY_ORIGIN)}
              </>
            )}
          </p>
        ) : null}
        <ClockRail activeId={active.id} stepRefs={stepRefs} lang={lang} />
        {apiDown ? (
          <p role="alert" className={clsx("absolute inset-x-5 top-24 z-20 mx-auto max-w-md rounded-lg bg-white p-4 text-sm text-ink shadow-xl shadow-ink/40", bn && "font-bangla")}>
            {bn
              ? "পূর্বাভাস এপিআই পাওয়া যাচ্ছে না। npm run dev চালিয়ে পেজ রিলোড করুন।"
              : "The forecast API is not reachable, so the wards cannot be placed. Start it with npm run dev and reload."}
          </p>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 -mt-[100svh]">
        {RAIN_CLOCK_STEPS.map((step) => (
          <article
            key={step.id}
            data-step={step.id}
            id={`step-${step.id}`}
            ref={(el) => {
              if (el) stepRefs.current.set(step.id, el);
              else stepRefs.current.delete(step.id);
            }}
            className="flex min-h-[100svh] items-end px-4 pb-20 sm:items-center sm:px-8 sm:pb-0 lg:px-14"
          >
            {step.id === "rain" ? (
              <StepPanel>
                <h2
                  id="rain-clock-heading"
                  lang={lang}
                  className={clsx(
                    "text-balance text-3xl font-extrabold leading-tight tracking-[-0.03em]",
                    bn && "font-bangla tracking-normal",
                  )}
                >
                  {bn ? "একটি বর্ষার সপ্তাহ, সামনে এগিয়ে দেখুন।" : "One monsoon week, played forward."}
                </h2>
                <p lang={lang} className={clsx("mt-2 text-xs text-mist", bn && "font-bangla")}>
                  {bn ? "বৃষ্টির সপ্তাহ · " : "Rain week · "}
                  <span className="tnum">{formatShortDate(STORM_ORIGIN)}</span>
                </p>
                <p lang={lang} className={clsx("mt-3 text-mist max-sm:text-sm sm:text-body", bn && "font-bangla")}>
                  {bn
                    ? `ঢাকা দক্ষিণ ওয়ার্ড ${wardNumber(SPOTLIGHT_WARD)}-এ ২১৬ মিমি বৃষ্টি এবং পাশের পাঁচটি ওয়ার্ডে ২০০ মিমির বেশি বৃষ্টি হয়েছে। প্রতিটি তরঙ্গ একটি ভেজা ওয়ার্ডের চিহ্ন। নিচে স্ক্রল করে পরবর্তী চার সপ্তাহের পূর্বাভাস দেখুন।`
                    : `216 mm of rain fell on ${wardLabel(SPOTLIGHT_WARD)}, Dhaka South, and over 200 mm on five of its neighbours. Every ripple is a ward that got wet. Scroll to watch the model's forecast for the next four weeks.`}
                </p>
              </StepPanel>
            ) : (
              <StepPanel>
                <StepBody
                  step={step}
                  wards={stepWards.get(step.id) ?? []}
                  observedPeakCases={observedPeak?.dengue_cases ?? null}
                  isLoading={storm.isPending || dry.isPending || wardsQuery.isPending}
                  lang={lang}
                />
              </StepPanel>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function StepPanel({ children }: { children: ReactNode }) {
  return (
    <div data-step-panel className="pointer-events-auto w-full max-w-md rounded-[14px] bg-ink/90 p-5 ring-1 ring-white/10 sm:p-7">
      {children}
    </div>
  );
}

function describeMap(step: RainClockStep, wards: ReturnType<typeof buildMapWards>): string {
  if (step.mode === "rain") return `Map of ${wards.length} wards around Dhaka in the rain week of ${formatShortDate(STORM_ORIGIN)}.`;
  const c = countTiers(wards);
  return `Map of ${c.total} wards, forecast ${step.horizon} weeks ahead: ${c.Critical} Critical, ${c.High} High, ${c.Medium} Medium, ${c.Low} Low.`;
}

interface StepBodyProps {
  step: RainClockStep;
  wards: ReturnType<typeof buildMapWards>;
  observedPeakCases: number | null;
  isLoading: boolean;
  lang: LandingLang;
}

function StepBody({ step, wards, observedPeakCases, isLoading, lang }: StepBodyProps) {
  const bn = lang === "bn";
  const dhaka = countTiers(wards, DHAKA_AREA);
  const all = countTiers(wards);
  const target = weekOf(wards.find((w) => w.target_week)?.target_week);
  const n = (value: number) => (isLoading ? "…" : String(value));
  const spotlight = wards.find((w) => w.ward_id === SPOTLIGHT_WARD);

  switch (step.id) {
    case "h1":
      return (
        <StepText
          lang={lang}
          kicker={bn ? `+১ সপ্তাহ · ${target}` : `+1 week · ${target}`}
          title={bn ? "রোগী এখনো বাড়েনি, কিন্তু পূর্বাভাস নড়ে উঠেছে।" : "Nothing has spiked yet. The forecast already moves."}
        >
          <p>
            {bn
              ? `${target} সপ্তাহের জন্য মডেল ঢাকার আশেপাশে ${n(dhaka.total)}টি ওয়ার্ডের মধ্যে ${n(dhaka.High + dhaka.Critical)}টিকে উচ্চ বা সংকটপূর্ণ দেখাচ্ছে। ড্রেন, টায়ার ও পাত্রে এখনো বৃষ্টির পানি জমে আছে।`
              : `For the week of ${target}, the model puts ${n(dhaka.High + dhaka.Critical)} of ${n(dhaka.total)} wards around Dhaka at High or Critical. The rain is still standing in drains, tyres and containers.`}
          </p>
          <TierTally counts={dhaka} lang={lang} />
        </StepText>
      );
    case "h2":
      return (
        <StepText
          lang={lang}
          kicker={bn ? `+২ সপ্তাহ · ${target}` : `+2 weeks · ${target}`}
          title={bn ? "জমা পানিতে জন্মানো মশা এখন কামড়াচ্ছে।" : "The mosquitoes that hatched in that water are biting."}
        >
          <p>
            {bn ? (
              <>
                এডিস মশা পূর্ণাঙ্গ হতে ৭ থেকে ১৪ দিন সময় নেয়। {target} তারিখের মধ্যে ঢাকার আশেপাশে {n(dhaka.Critical)}টি
                ওয়ার্ড সংকটপূর্ণ এবং {n(dhaka.High)}টি উচ্চ ঝুঁকিতে।
              </>
            ) : (
              <>
                <i lang="la">Aedes aegypti</i> mature in 7 to 14 days. By {target}, {n(dhaka.Critical)} wards around
                Dhaka are Critical and {n(dhaka.High)} are High.
              </>
            )}
          </p>
          <TierTally counts={dhaka} lang={lang} />
        </StepText>
      );
    case "h3":
      return (
        <StepText
          lang={lang}
          kicker={bn ? `+৩ সপ্তাহ · ${target}` : `+3 weeks · ${target}`}
          title={
            bn
              ? `ওয়ার্ড ${wardNumber(SPOTLIGHT_WARD)}, ঢাকা দক্ষিণ: মডেল যে চূড়াটি আগেই দেখেছিল।`
              : `${wardLabel(SPOTLIGHT_WARD)}, Dhaka South: the peak the model saw coming.`
          }
        >
          <p>
            {bn ? (
              <>
                {formatShortDate(STORM_ORIGIN)} সপ্তাহে ওয়ার্ড {wardNumber(SPOTLIGHT_WARD)}-এ ২১৬ মিমি বৃষ্টি হয়েছিল। তিন
                সপ্তাহ পরের পূর্বাভাস{" "}
                <strong className="font-semibold text-white">
                  {spotlight?.expected_cases != null ? `${spotlight.expected_cases.toFixed(1)} জন প্রত্যাশিত রোগী` : "…"}
                </strong>
                {observedPeakCases !== null ? `; বাস্তবে ${observedPeakCases} জন রেকর্ড হয়েছিল।` : "।"}
              </>
            ) : (
              <>
                216 mm of rain fell on {wardLabel(SPOTLIGHT_WARD)} in the week of {formatShortDate(STORM_ORIGIN)}. Three
                weeks later the forecast is{" "}
                <strong className="font-semibold text-white">
                  {spotlight?.expected_cases != null ? `${spotlight.expected_cases.toFixed(1)} expected cases` : "…"}
                </strong>
                {observedPeakCases !== null ? `; ${observedPeakCases} were recorded.` : "."}
              </>
            )}
          </p>
          <p className="text-sm font-semibold text-white">
            {bn
              ? `${weekOf(addDaysIso(STORM_ORIGIN, 7))} সপ্তাহেই ব্যবস্থা নিন: চূড়ার আগেই ড্রেন পরিষ্কার ও লার্ভিসাইড ছিটান।`
              : `Act in the week of ${weekOf(addDaysIso(STORM_ORIGIN, 7))}: clear drains and larvicide before the peak.`}
          </p>
          {spotlight?.tier ? (
            <>
              <RiskTierBadge tier={spotlight.tier} size="sm" lang={lang} className="sm:hidden" />
              <RiskTierBadge tier={spotlight.tier} size="sm" lang={lang} showAction className="max-sm:hidden" />
            </>
          ) : null}
        </StepText>
      );
    case "h4":
      return (
        <StepText
          lang={lang}
          kicker={bn ? `+৪ সপ্তাহ · ${target}` : `+4 weeks · ${target}`}
          title={bn ? "পাঁচটি সিটি কর্পোরেশন, একটি মডেল।" : "All five city corporations, one model."}
        >
          <p>
            {bn
              ? `গাজীপুর থেকে চট্টগ্রাম পর্যন্ত: ${target} সপ্তাহের জন্য ${n(all.total)}টি ওয়ার্ডের মধ্যে ${n(all.Critical)}টি সংকটপূর্ণ। প্রতিটি বিন্দু একটি ওয়ার্ড; বড় বিন্দু মানে বেশি প্রত্যাশিত রোগী।`
              : `Zoomed out from Gazipur to Chattogram: ${n(all.Critical)} of ${n(all.total)} wards Critical for the week of ${target}. Each dot is a ward; a bigger dot means more expected cases.`}
          </p>
          <TierTally counts={all} lang={lang} />
        </StepText>
      );
    case "dry":
      return (
        <StepText
          lang={lang}
          kicker={bn ? `পূর্বাভাসের তারিখ ${formatShortDate(DRY_ORIGIN)}` : `Forecast made ${formatShortDate(DRY_ORIGIN)}`}
          title={bn ? "আর শুষ্ক সপ্তাহ শান্তই থাকে।" : "And a dry week stays quiet."}
        >
          <p>
            {bn
              ? `বর্ষার আগে ${target} সপ্তাহের জন্য একই মডেল চালানো হলে ${n(all.total)}টি ওয়ার্ডের মধ্যে ${n(all.Low)}টিই কম ঝুঁকিতে থাকে। বৃষ্টিপাত ঝুঁকি তৈরি করলেই কেবল আভাস সতর্ক করে।`
              : `The same model, run before the monsoon for the week of ${target}: ${n(all.Low)} of ${n(all.total)} wards Low. Abhas raises the alarm when the rain warrants it.`}
          </p>
          <TierTally counts={all} lang={lang} />
        </StepText>
      );
    default:
      return null;
  }
}

function StepText({ lang, kicker, title, children }: { lang: LandingLang; kicker: string; title: string; children: ReactNode }) {
  const bn = lang === "bn";
  return (
    <div lang={lang} className={bn ? "font-bangla" : undefined}>
      <h2 className={clsx("text-balance text-2xl font-bold leading-tight tracking-[-0.02em]", bn && "tracking-normal")}>
        {title}
      </h2>
      <p className="mt-2 text-xs font-semibold text-mist tnum">{kicker}</p>
      <div className="mt-3 space-y-3 text-mist max-sm:text-sm sm:text-body">{children}</div>
    </div>
  );
}

function TierTally({ counts, lang }: { counts: ReturnType<typeof countTiers>; lang: LandingLang }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label={lang === "bn" ? "স্তর অনুযায়ী ওয়ার্ড সংখ্যা" : "Wards per risk tier"}>
      {[...TIER_ORDER].reverse().map((tier) =>
        counts[tier] > 0 ? (
          <li key={tier} className="inline-flex items-center gap-1.5">
            <RiskTierBadge tier={tier} size="sm" lang={lang} />
            <span className="text-sm font-semibold text-white tnum">{counts[tier]}</span>
          </li>
        ) : null,
      )}
    </ul>
  );
}

function MapLegend({ mode, lang }: { mode: RainClockStep["mode"]; lang: LandingLang }) {
  const bn = lang === "bn";
  return (
    <div
      lang={lang}
      className={clsx(
        "pointer-events-none absolute bottom-12 right-5 z-10 hidden max-w-[15rem] rounded-lg bg-ink/85 p-3 text-xs text-mist ring-1 ring-white/10 md:block",
        bn && "font-bangla",
      )}
    >
      {mode === "rain" ? (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-royal" />
          {bn
            ? "এই সপ্তাহে প্রতিটি ওয়ার্ডে বৃষ্টি হয়েছে। তরঙ্গগুলো বৃষ্টির অবস্থান দেখাচ্ছে।"
            : "Every ward got rain this week. Ripples mark where it fell."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...TIER_ORDER].reverse().map((tier) => (
            <li key={tier}>
              <RiskTierBadge tier={tier} size="sm" lang={lang} />
            </li>
          ))}
          <li className="pt-1">
            {bn ? "বড় বিন্দু: বেশি প্রত্যাশিত রোগী।" : "Bigger dot: more expected cases (relative to the wards shown)."}
          </li>
        </ul>
      )}
      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-4 text-mist/80">
        {bn
          ? "ওয়ার্ডের অবস্থান আনুমানিক: ডেটাসেটে ওয়ার্ড সীমানা নেই।"
          : "Ward positions are approximate: the dataset has no ward boundaries."}
      </p>
    </div>
  );
}

function ClockRail({
  activeId,
  stepRefs,
  lang,
}: {
  activeId: StepId;
  stepRefs: React.RefObject<Map<StepId, HTMLElement>>;
  lang: LandingLang;
}) {
  const bn = lang === "bn";
  return (
    <nav aria-label={bn ? "বৃষ্টি ঘড়ির সপ্তাহসমূহ" : "Rain clock weeks"} className="absolute right-10 top-1/2 z-20 hidden -translate-y-1/2 lg:block">
      <ol className="relative flex flex-col gap-3 rounded-[14px] bg-ink/80 py-4 pl-8 pr-5 ring-1 ring-white/10 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-white/15">
        <span
          aria-hidden="true"
          data-rail-fill
          className="absolute bottom-6 left-[19px] top-6 w-px origin-top scale-y-0 bg-royal"
        />
        {RAIN_CLOCK_STEPS.map((step) => {
          const isActive = step.id === activeId;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={isActive ? "step" : undefined}
                onClick={() =>
                  stepRefs.current
                    ?.get(step.id)
                    ?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
                }
                className={clsx(
                  "group relative flex min-h-8 cursor-pointer items-center text-xs transition-colors duration-300",
                  bn && "font-bangla",
                  isActive ? "text-white font-semibold" : "text-mist/70 hover:text-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute -left-[17px] h-2.5 w-2.5 rounded-full transition-all duration-300",
                    isActive ? "scale-125 bg-royal ring-4 ring-royal/30" : "bg-white/30 group-hover:bg-white/60",
                  )}
                />
                {bn ? CLOCK_LABEL_BN[step.id] : step.clockLabel}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
