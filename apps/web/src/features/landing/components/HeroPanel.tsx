import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";

/** First viewport copy, set over the live map. Lime appears once here: the primary action. */
export function HeroPanel() {
  return (
    <div>
      <h1 className="text-balance text-[clamp(2.25rem,5.4vw,5rem)] font-light leading-[1.02] tracking-[-0.03em]">
        Rain today.
        <br />
        Risk in three weeks.
        <br />
        <span className="font-extrabold">Act now.</span>
      </h1>
      <p lang="bn" className="mt-5 font-bangla text-lg text-mist">
        আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।
      </p>
      <p className="mt-4 text-base leading-7 text-mist sm:hidden">
        Ward-level dengue forecasts for 60 wards, 1 to 4 weeks ahead, from this week&apos;s rain.
      </p>
      <p className="mt-3 font-mono text-xs text-mist sm:hidden tnum">Map: rain week of 5 Aug 2024</p>
      <p className="mt-6 hidden max-w-[34rem] text-lg leading-8 text-mist sm:block">
        Abhas forecasts dengue risk for each of 60 wards across five city corporations, Gazipur to Chattogram,
        1 to 4 weeks ahead, from the rain that falls this week. Health officers see which ward surges and when, while there is still time
        to clear the water.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
        <Link
          href="/dashboard?demo=1"
          data-testid="hero-cta"
          className="group inline-flex min-h-12 items-center gap-2 rounded-md bg-lime px-6 text-base font-bold text-ink transition-transform duration-200 hover:-translate-y-0.5"
        >
          Open the dashboard
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
        <a
          href="#step-h1"
          className="inline-flex min-h-12 items-center gap-2 rounded-md px-4 text-base font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10"
        >
          Watch one monsoon week
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
        </a>
      </div>
      <p className="mt-8 hidden font-mono text-xs text-mist sm:block tnum">
        On the map: week of 5 Aug 2024 · 216 mm of rain on Ward 4, Dhaka South
      </p>
    </div>
  );
}
