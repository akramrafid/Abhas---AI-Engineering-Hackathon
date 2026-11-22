"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { AnimatedBeam } from "@/components/ui/AnimatedBeam";

interface NodeProps {
  nodeRef: RefObject<HTMLDivElement | null>;
  title: string;
  detail: string;
  /** One real measured value per node, set in Plex Mono. */
  measure: ReactNode;
  emphasis?: boolean;
}

function FlowNode({ nodeRef, title, detail, measure, emphasis = false }: NodeProps) {
  return (
    <div
      ref={nodeRef}
      data-flow-node
      className={clsx(
        "relative z-10 rounded-[14px] p-4 ring-1",
        emphasis ? "bg-royal text-white ring-royal" : "bg-ink text-white ring-white/10",
      )}
    >
      <p className="font-mono text-lg font-semibold leading-none tnum">{measure}</p>
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className={clsx("mt-0.5 text-xs leading-5", emphasis ? "text-white" : "text-mist")}>{detail}</p>
    </div>
  );
}

export function HowItWorks() {
  const scope = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const dataset = useRef<HTMLDivElement>(null);
  const meteo = useRef<HTMLDivElement>(null);
  const lags = useRef<HTMLDivElement>(null);
  const model = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLDivElement>(null);
  const sms = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.from("[data-flow-node]", {
          y: 24,
          autoAlpha: 0,
          duration: 0.9,
          ease: EASE_OUT,
          stagger: 0.08,
          scrollTrigger: { trigger: container.current, start: "top 78%" },
        });
      });
    },
    { scope },
  );

  return (
    <section ref={scope} id="how" aria-labelledby="how-heading" className="bg-navy px-4 py-24 text-white sm:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <h2 id="how-heading" className="text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            From this week&apos;s rain to next month&apos;s ward list.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-mist lg:justify-self-end">
            Rain sets a clock: one to two weeks for mosquitoes to breed, then incubation. Abhas reads that clock for
            every ward on its own timeline and hands officers one action per ward.
          </p>
        </div>

        <div ref={container} className="relative mt-16 grid gap-6 lg:grid-cols-4 lg:items-center lg:gap-x-16">
          <div className="space-y-4">
            <FlowNode nodeRef={dataset} measure="31,320" title="Ward history" detail="60 wards · 522 weeks of rain, heat, humidity, cases, drainage, crowding, sanitation." />
            <FlowNode nodeRef={meteo} measure="4 calls/day" title="Weather feed" detail="Dataset by default; Open-Meteo for live weeks, all five cities in one call." />
          </div>
          <FlowNode nodeRef={lags} measure="r 0.47 at 3 wk" title="Breeding clock" detail="Rain lagged 1 to 6 weeks, grouped by ward_id, nothing after the forecast week." />
          <FlowNode nodeRef={model} emphasis measure="MAE 1.01" title="Forecast model" detail="LightGBM, Poisson, one model per horizon, 80% ranges, cost-based tiers." />
          <div className="space-y-4">
            <FlowNode nodeRef={dashboard} measure="60 wards" title="Dashboard" detail="Tier, range and drivers for each ward; map, priority list, what-if rain." />
            <FlowNode nodeRef={sms} measure="≤ 160 chars" title="SMS alert" detail="Ward and window first, then one action." />
            <FlowNode nodeRef={notice} measure="A4 · EN + BN" title="Field notice" detail="Printable A4 ward brief in Bangla and English." />
          </div>

          <div className="hidden lg:contents">
            <AnimatedBeam containerRef={container} fromRef={dataset} toRef={lags} curvature={-20} />
            <AnimatedBeam containerRef={container} fromRef={meteo} toRef={lags} curvature={30} delay={0.4} />
            <AnimatedBeam containerRef={container} fromRef={lags} toRef={model} curvature={0} delay={0.8} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={dashboard} curvature={40} delay={1.2} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={sms} curvature={0} delay={1.4} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={notice} curvature={-40} delay={1.6} />
          </div>
        </div>
      </div>
    </section>
  );
}
