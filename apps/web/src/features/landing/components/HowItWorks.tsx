"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { BrainCircuit, CloudRain, Database, LayoutDashboard, MessageSquareText, Timer, FileText } from "lucide-react";
import { clsx } from "clsx";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { AnimatedBeam } from "@/components/ui/AnimatedBeam";

interface NodeProps {
  nodeRef: RefObject<HTMLDivElement | null>;
  icon: ReactNode;
  title: string;
  detail: string;
  emphasis?: boolean;
}

function FlowNode({ nodeRef, icon, title, detail, emphasis = false }: NodeProps) {
  return (
    <div
      ref={nodeRef}
      data-flow-node
      className={clsx(
        "relative z-10 flex items-start gap-3 rounded-[14px] p-4 ring-1",
        emphasis ? "bg-royal text-white ring-royal" : "bg-ink text-white ring-white/10",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-[10px]",
          emphasis ? "bg-white/15" : "bg-navy",
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className={clsx("mt-0.5 block text-xs leading-5", emphasis ? "text-white/85" : "text-mist")}>{detail}</span>
      </span>
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

  const icon = "h-[18px] w-[18px]";
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
            <FlowNode nodeRef={dataset} icon={<Database className={icon} />} title="Ward history" detail="31,320 ward-weeks: rain, heat, humidity, cases, drainage, crowding, sanitation." />
            <FlowNode nodeRef={meteo} icon={<CloudRain className={icon} />} title="Weather feed" detail="Dataset by default; Open-Meteo for live weeks, one call per 6 hours for all five cities." />
          </div>
          <FlowNode nodeRef={lags} icon={<Timer className={icon} />} title="Breeding clock" detail="Rain lagged 1 to 6 weeks, grouped by ward_id, nothing after the forecast week." />
          <FlowNode nodeRef={model} emphasis icon={<BrainCircuit className={icon} />} title="Forecast model" detail="LightGBM, Poisson, one model per horizon (1–4 weeks), 80% ranges, cost-based tiers." />
          <div className="space-y-4">
            <FlowNode nodeRef={dashboard} icon={<LayoutDashboard className={icon} />} title="Dashboard" detail="Tier, range and drivers for each ward; map, priority list, what-if rain." />
            <FlowNode nodeRef={sms} icon={<MessageSquareText className={icon} />} title="SMS alert" detail="Ward and window first, then one action, in 160 characters." />
            <FlowNode nodeRef={notice} icon={<FileText className={icon} />} title="Field notice" detail="Printable A4 ward brief in Bangla and English." />
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
