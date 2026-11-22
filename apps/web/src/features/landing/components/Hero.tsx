"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "@/components/icons";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";
import { EASE_OUT, FULL_MOTION, gsap, SplitText, useGSAP } from "@/components/motion/gsap";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { WardRiskMap } from "@/components/ward-map/WardRiskMap";
import { useWardsQuery } from "@/lib/api/client";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";
import { ContainerScroll } from "@/components/ui/ContainerScroll";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";
import { ForecastCard } from "./ForecastCard";

const WINDOW_TABS = [
  { id: "ward-risk", en: "Ward Forecast", bn: "ওয়ার্ড পূর্বাভাস" },
  { id: "map", en: "Risk Map", bn: "ঝুঁকি মানচিত্র" },
  { id: "lags", en: "Lags", bn: "বৃষ্টির ল্যাগ" },
  { id: "scenario", en: "Scenario", bn: "দৃশ্যপট" },
  { id: "priority", en: "Priority List", bn: "অগ্রাধিকার তালিকা" },
  { id: "validation", en: "Validation", bn: "যাচাই" },
] as const;

export function Hero() {
  const scope = useRef<HTMLElement>(null);
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        const split = SplitText.create("[data-hero-title]", { type: "lines,words", mask: "lines" });
        const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
        tl.from(split.words, { yPercent: 35, duration: 0.55, stagger: 0.025 })
          .from("[data-hero-fade]", { y: 12, autoAlpha: 0, duration: 0.45, stagger: 0.05 }, "-=0.35")
          .from("[data-hero-ribbon]", { autoAlpha: 0, duration: 0.9, ease: "power2.out" }, 0);
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
          lang={lang}
          className={clsx(
            "max-w-4xl text-balance text-[clamp(2.45rem,6vw,5.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em]",
            bn && "font-bangla leading-[1.12] tracking-normal",
          )}
        >
          {bn
            ? "কোন ওয়ার্ডে ডেঙ্গু বাড়বে তা জানুন — প্রাদুর্ভাবের তিন সপ্তাহ আগেই।"
            : "Know which wards will rise, three weeks before they do."}
        </h1>

        <p
          data-hero-fade
          lang={lang}
          className={clsx(
            "mt-7 text-[clamp(1.25rem,2.2vw,1.75rem)] font-light leading-snug tracking-[-0.01em] text-mist",
            bn && "font-bangla",
          )}
        >
          {bn ? (
            <>
              আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি।{" "}
              <span className="whitespace-nowrap font-extrabold text-lime">এখনই ব্যবস্থা নিন।</span>
            </>
          ) : (
            <>
              Rain today. Risk in three weeks.{" "}
              <span className="whitespace-nowrap font-extrabold text-lime">Act now.</span>
            </>
          )}
        </p>

        <p
          data-hero-fade
          lang={lang}
          className={clsx("mt-7 max-w-[38rem] text-lg leading-8 text-mist", bn && "font-bangla")}
        >
          {bn
            ? "আভাস এই সপ্তাহের বৃষ্টিপাতকে পাঁচটি সিটি কর্পোরেশনের ৬০টি ওয়ার্ডের ডেঙ্গু পূর্বাভাসে রূপান্তর করে: ঝুঁকির স্তর, সম্ভাব্য রোগীর সংখ্যা ও অনিশ্চয়তার পরিসর, এবং কারণসমূহ—যাতে আগেই প্রজননস্থল ধ্বংস ও শয্যা প্রস্তুত করা যায়।"
            : "Abhas turns this week's rain into a ward-by-ward dengue forecast for 60 wards across five city corporations: the risk tier, the likely cases with their range, and the reasons behind it, in time to clear breeding sites and prepare beds."}
        </p>

        <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href={bn ? "/dashboard?demo=1&lang=bn" : "/dashboard?demo=1"}
            data-testid="hero-cta"
            onClick={() => trackEvent({ event: "cta_open_dashboard", location: "hero", lang })}
            className={clsx(
              "group inline-flex min-h-12 items-center gap-2 rounded-md bg-royal px-6 text-base font-bold text-white transition-colors duration-300 hover:bg-white hover:text-royal",
              bn && "font-bangla",
            )}
          >
            {bn ? "ড্যাশবোর্ড খুলুন" : "Open the dashboard"}
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#rain-clock"
            onClick={(e) => {
              trackEvent({ event: "cta_watch_tour", location: "hero", lang });
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
            className={clsx(
              "inline-flex min-h-12 items-center gap-2 rounded-md px-5 text-base font-semibold text-white ring-1 ring-white/20 transition-colors duration-300 hover:bg-white/10",
              bn && "font-bangla",
            )}
          >
            {bn ? "একটি বর্ষার সপ্তাহ দেখুন" : "Watch one monsoon week"}
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>

        {/* Above-the-fold CRO trust & proof strip */}
        <ul
          data-hero-fade
          lang={lang}
          aria-label={bn ? "মূল যাচাইকৃত বৈশিষ্ট্য" : "Verified platform highlights"}
          className={clsx(
            "mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-mist/85 tnum",
            bn && "font-bangla",
          )}
        >
          <li className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            {bn ? "৬০টি ওয়ার্ড · ৫ সিটি কর্পোরেশন" : "60 wards · 5 city corporations"}
          </li>
          <li className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            {bn ? "২০% কম ত্রুটি (২০২৪–২৫ যাচাই)" : "~20% lower MAE (2024–25 hold-out)"}
          </li>
          <li className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            {bn ? "$০ লাইসেন্স · অফলাইনে চলে · ০ PII" : "$0 license · Runs offline · 0 patient PII"}
          </li>
        </ul>
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
  const { lang } = useLandingLang();
  const bn = lang === "bn";
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
          <h2
            lang={lang}
            className={clsx(
              "text-balance text-[clamp(2rem,4.4vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn ? "প্রতিটি ওয়ার্ড, তিন সপ্তাহ আগেই।" : "Every ward, three weeks ahead."}
          </h2>
          <p lang={lang} className={clsx("mx-auto mt-4 max-w-xl text-lg text-mist", bn && "font-bangla")}>
            {bn ? (
              <>
                লাইভ মডেল ফলাফল: <span className="tnum">৫ আগস্ট ২০২৪</span>-এ ঢাকা দক্ষিণ ওয়ার্ড ৪-এ ২১৬ মিমি বৃষ্টির পর{" "}
                <span className="tnum">২৬ আগস্ট</span> সপ্তাহের পূর্বাভাস।
              </>
            ) : (
              <>
                Live model output: the forecast made on <span className="font-mono tnum">5 Aug 2024</span> for the week
                of <span className="font-mono tnum">26 Aug</span>, after 216 mm of rain on Ward 4, Dhaka South.
              </>
            )}
          </p>
        </>
      }
    >
      <figure
        aria-label={
          bn
            ? "আভাস ড্যাশবোর্ড: ঢাকা দক্ষিণ ওয়ার্ড ৪, ৫ আগস্ট ২০২৪ বৃষ্টির তিন সপ্তাহ পরের পূর্বাভাস"
            : "The Abhas dashboard: Ward 4, Dhaka South, forecast three weeks after the 5 Aug 2024 rain"
        }
        className="overflow-hidden bg-navy"
      >
        <div className="flex items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
          <AbhasLogo variant="reverse" size="sm" />
          <nav aria-label="Demo tabs" className="hidden items-center gap-1 text-xs text-mist/80 md:flex">
            {WINDOW_TABS.map((tab, i) => (
              <Link
                key={tab.id}
                href={`/dashboard?demo=1&tab=${tab.id}&lang=${lang}`}
                className={clsx(
                  "rounded-md px-2.5 py-1 transition-colors hover:bg-white/20 hover:text-white",
                  i === 1 ? "bg-white/10 font-semibold text-white" : "text-mist",
                  bn && "font-bangla",
                )}
              >
                {bn ? tab.bn : tab.en}
              </Link>
            ))}
          </nav>
          <span className={clsx("ml-auto whitespace-nowrap text-xs text-mist", bn && "font-bangla")}>
            <span className="max-sm:hidden">{bn ? "ঢাকা দক্ষিণ · সপ্তাহ " : "Dhaka South · week of "}</span>
            <span className="tnum">26 Aug 2024</span>
          </span>
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
