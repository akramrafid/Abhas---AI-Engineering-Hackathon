"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";
import { EASE_OUT, FULL_MOTION, gsap, SplitText, useGSAP } from "@/components/motion/gsap";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { WardRiskMap } from "@/components/ward-map/WardRiskMap";
import { useWardsQuery } from "@/lib/api/client";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";
import { ContainerScroll } from "@/components/ui/ContainerScroll";
import { ForecastCard } from "./ForecastCard";

const WINDOW_TABS = ["Ward Forecast", "Risk Map", "Lags", "Scenario", "Priority List", "Validation"] as const;
const TAB_VIEW_MAP: Record<string, string> = {
  "Ward Forecast": "forecast",
  "Risk Map": "risk-map",
  "Lags": "lags",
  "Scenario": "scenario",
  "Priority List": "priority",
  "Validation": "validation",
};

export function Hero() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        const split = SplitText.create("[data-hero-title]", { type: "lines,words", mask: "lines" });
        const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
        tl.from(split.words, { yPercent: 110, duration: 1.1, stagger: 0.045 })
          .from("[data-hero-fade]", { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, "-=0.75")
          .from("[data-hero-ribbon]", { autoAlpha: 0, duration: 1.6, ease: "power2.out" }, 0);
        return () => split.revert();
      });
    },
    { scope },
  );

  return (
    <section ref={scope} aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink pt-32 text-white sm:pt-40">
      <div data-hero-ribbon className="absolute inset-x-0 top-0 -z-10 h-[48rem] [mask-image:linear-gradient(to_right,transparent_5%,black_45%)] max-md:opacity-40">
        <RibbonCanvas className="h-full w-full" from={0.9} to={0.08} />
      </div>
      <SignalPattern />

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <h1
          id="hero-title"
          data-hero-title
          className="max-w-4xl text-balance text-[clamp(2.6rem,6.4vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.035em]"
        >
          Know which wards will rise, three weeks before they do.
        </h1>
        <p data-hero-fade className="mt-7 text-[clamp(1.25rem,2.2vw,1.75rem)] font-light leading-snug tracking-[-0.01em] text-mist">
          Rain today. Risk in three weeks. <span className="whitespace-nowrap font-extrabold text-lime">Act now.</span>
        </p>
        <p data-hero-fade lang="bn" className="mt-2 font-bangla text-base text-mist/80">
          আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।
        </p>
        <p data-hero-fade className="mt-7 max-w-[38rem] text-lg leading-8 text-mist">
          Abhas turns this week&apos;s rain into a ward-by-ward dengue forecast for 60 wards across five city
          corporations: the risk tier, the likely cases with their range, and the reasons behind it, in time to clear
          breeding sites and prepare beds.
        </p>
        <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard?demo=1"
            data-testid="hero-cta"
            className="group inline-flex min-h-12 items-center gap-2 rounded-md bg-royal px-6 text-base font-bold text-white transition-colors duration-300 hover:bg-white hover:text-royal"
          >
            Open the dashboard
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#rain-clock"
            onClick={(e) => {
              const target = document.getElementById("rain-clock");
              if (!target) return;
              e.preventDefault();
              const targetY = target.getBoundingClientRect().top + window.scrollY;
              window.history.replaceState(null, "", "#rain-clock");
              if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                window.scrollTo({ top: targetY, behavior: "instant" });
                return;
              }
              const proxy = { y: window.scrollY };
              gsap.to(proxy, {
                y: targetY,
                duration: 0.9,
                ease: "power3.inOut",
                onUpdate: () => window.scrollTo({ top: proxy.y, behavior: "instant" }),
              });
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-md px-5 text-base font-semibold text-white ring-1 ring-white/20 transition-colors duration-300 hover:bg-white/10"
          >
            Watch one monsoon week
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>

      <ProductWindow />
    </section>
  );
}

/** The Λ signal pattern from the guidelines, at low contrast (backgrounds of notices and slides). */
function SignalPattern() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 -z-20 h-[32rem] bg-royal/[0.16] [mask-image:url(/brand/signal-pattern.svg),linear-gradient(to_top,black,transparent)] [mask-composite:intersect] [mask-size:28px_16px,100%_100%]"
    />
  );
}

function ProductWindow() {
  const wardsQuery = useWardsQuery();
  const storm = useAllCityHeatmaps(STORM_ORIGIN, "dataset");
  const wards = useMemo(
    () => buildMapWards(wardsQuery.data?.wards ?? [], storm.cellsByWard, 3, [3]),
    [wardsQuery.data, storm.cellsByWard],
  );

  return (
    <ContainerScroll
      title={
        <>
          <h2 className="text-balance text-[clamp(2rem,4.4vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">
            Every ward, three weeks ahead.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-mist">
            Live model output: the forecast made on <span className="font-mono tnum">5 Aug 2024</span> for the week
            of <span className="font-mono tnum">26 Aug</span>, after 216 mm of rain on Ward 4, Dhaka South.
          </p>
        </>
      }
    >
        <figure
          aria-label="The Abhas dashboard: Ward 4, Dhaka South, forecast three weeks after the 5 Aug 2024 rain"
          className="overflow-hidden bg-navy"
        >
          <div className="flex items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
            <AbhasLogo variant="reverse" size="sm" />
            <nav aria-label="Demo tabs" className="hidden items-center gap-1 text-xs text-mist/80 md:flex">
              {WINDOW_TABS.map((tab, i) => (
                <Link
                  key={tab}
                  href={`/dashboard?demo=1&tab=${TAB_VIEW_MAP[tab] || "forecast"}`}
                  className={clsx(
                    "rounded-md px-2.5 py-1 transition-colors hover:bg-white/20 hover:text-white",
                    i === 1 ? "bg-white/10 font-semibold text-white" : "text-mist",
                  )}
                  title={`Open ${tab} in dashboard`}
                >
                  {tab}
                </Link>
              ))}
            </nav>
            <span className="ml-auto whitespace-nowrap text-xs text-mist"><span className="max-sm:hidden">Dhaka South · week of </span><span className="font-mono tnum">26 Aug 2024</span></span>
          </div>
          <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <WardRiskMap
              wards={wards}
              view="dhaka"
              mode="risk"
              label="Forecast map: wards around Dhaka three weeks after the 5 Aug 2024 rain."
              highlightWardId={SPOTLIGHT_WARD}
              testId="hero-ward-map"
              className="h-[22rem] sm:h-[28rem]"
            />
            <div className="bg-paper p-4 sm:p-5">
              <ForecastCard />
            </div>
          </div>
        </figure>
    </ContainerScroll>
  );
}
