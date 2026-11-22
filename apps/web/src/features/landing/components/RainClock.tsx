"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import { wardLabel } from "@/components/ward-map/geo";
import { buildMapWards, useAllCityHeatmaps } from "@/components/ward-map/hooks";
import { WardRiskMap } from "@/components/ward-map/WardRiskMap";
import { fetchWardHistory, useWardsQuery } from "@/lib/api/client";
import { addDaysIso, formatShortDate } from "@/lib/dates";
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

function weekOf(iso: string | null | undefined): string {
  return iso ? formatShortDate(iso) : "—";
}

export function RainClock() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<StepId>("rain");
  const stepRefs = useRef(new Map<StepId, HTMLElement>());

  // The rail fills with scroll progress through the tour (scrubbed, so it tracks the reader exactly).
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
    <section ref={sectionRef} id="rain-clock" aria-labelledby="rain-clock-heading" className="relative bg-ink text-white">
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
        <MapLegend mode={active.mode} />
        {active.horizon !== null ? (
          <p className="pointer-events-none absolute bottom-5 left-8 z-10 hidden rounded-md bg-ink/80 px-2.5 py-1.5 font-mono text-xs text-mist sm:block lg:left-14 tnum">
            Forecast for the week of {weekOf(stampWeek)} · made{" "}
            {weekOf(active.origin === "storm" ? STORM_ORIGIN : DRY_ORIGIN)}
          </p>
        ) : null}
        <ClockRail activeId={active.id} stepRefs={stepRefs} />
        {apiDown ? (
          <p role="alert" className="absolute inset-x-5 top-24 z-20 mx-auto max-w-md rounded-lg bg-white p-4 text-sm text-ink shadow-xl shadow-ink/40">
            The forecast API is not reachable, so the wards cannot be placed. Start it with{" "}
            <code className="font-mono">npm run dev</code> and reload.
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
                <h2 id="rain-clock-heading" className="text-balance text-3xl font-extrabold leading-tight tracking-[-0.03em]">
                  One monsoon week, played forward.
                </h2>
                <p className="mt-2 font-mono text-xs text-mist tnum">Rain week · {formatShortDate(STORM_ORIGIN)}</p>
                <p className="mt-3 text-mist max-sm:text-sm sm:text-body">
                  216 mm of rain fell on {wardLabel(SPOTLIGHT_WARD)}, Dhaka South, and over 200 mm on five of its
                  neighbours. Every ripple is a ward that got wet. Scroll to watch the model&apos;s forecast for the
                  next four weeks.
                </p>
              </StepPanel>
            ) : (
              <StepPanel>
                <StepBody
                  step={step}
                  wards={stepWards.get(step.id) ?? []}
                  observedPeakCases={observedPeak?.dengue_cases ?? null}
                  isLoading={storm.isPending || dry.isPending || wardsQuery.isPending}
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
}

function StepBody({ step, wards, observedPeakCases, isLoading }: StepBodyProps) {
  const dhaka = countTiers(wards, DHAKA_AREA);
  const all = countTiers(wards);
  const target = weekOf(wards.find((w) => w.target_week)?.target_week);
  const n = (value: number) => (isLoading ? "…" : String(value));
  const spotlight = wards.find((w) => w.ward_id === SPOTLIGHT_WARD);

  switch (step.id) {
    case "h1":
      return (
        <StepText kicker={`+1 week · ${target}`} title="Nothing has spiked yet. The forecast already moves.">
          <p>
            For the week of {target}, the model puts {n(dhaka.High + dhaka.Critical)} of {n(dhaka.total)} wards
            around Dhaka at High or Critical. The rain is still standing in drains, tyres and containers.
          </p>
          <TierTally counts={dhaka} />
        </StepText>
      );
    case "h2":
      return (
        <StepText kicker={`+2 weeks · ${target}`} title="The mosquitoes that hatched in that water are biting.">
          <p>
            <i lang="la">Aedes aegypti</i> mature in 7 to 14 days. By {target}, {n(dhaka.Critical)} wards around
            Dhaka are Critical and {n(dhaka.High)} are High.
          </p>
          <TierTally counts={dhaka} />
        </StepText>
      );
    case "h3":
      return (
        <StepText kicker={`+3 weeks · ${target}`} title={`${wardLabel(SPOTLIGHT_WARD)}, Dhaka South: the peak the model saw coming.`}>
          <p>
            216 mm of rain fell on {wardLabel(SPOTLIGHT_WARD)} in the week of {formatShortDate(STORM_ORIGIN)}. Three
            weeks later the forecast is{" "}
            <strong className="font-semibold text-white">
              {spotlight?.expected_cases != null ? `${spotlight.expected_cases.toFixed(1)} expected cases` : "…"}
            </strong>
            {observedPeakCases !== null ? `; ${observedPeakCases} were recorded.` : "."}
          </p>
          <p className="text-sm font-semibold text-white">
            Act in the week of {weekOf(addDaysIso(STORM_ORIGIN, 7))}: clear drains and larvicide before the peak.
          </p>
          {spotlight?.tier ? (
            <>
              <RiskTierBadge tier={spotlight.tier} size="sm" className="sm:hidden" />
              <RiskTierBadge tier={spotlight.tier} size="sm" showAction className="max-sm:hidden" />
            </>
          ) : null}
        </StepText>
      );
    case "h4":
      return (
        <StepText kicker={`+4 weeks · ${target}`} title="All five city corporations, one model.">
          <p>
            Zoomed out from Gazipur to Chattogram: {n(all.Critical)} of {n(all.total)} wards Critical for the week
            of {target}. Each dot is a ward; a bigger dot means more expected cases.
          </p>
          <TierTally counts={all} />
        </StepText>
      );
    case "dry":
      return (
        <StepText kicker={`Forecast made ${formatShortDate(DRY_ORIGIN)}`} title="And a dry week stays quiet.">
          <p>
            The same model, run before the monsoon for the week of {target}: {n(all.Low)} of {n(all.total)} wards
            Low. Abhas raises the alarm when the rain warrants it.
          </p>
          <TierTally counts={all} />
        </StepText>
      );
    default:
      return null;
  }
}

function StepText({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="text-balance text-2xl font-bold leading-tight tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 font-mono text-xs text-mist tnum">{kicker}</p>
      <div className="mt-3 space-y-3 text-mist max-sm:text-sm sm:text-body">{children}</div>
    </>
  );
}

function TierTally({ counts }: { counts: ReturnType<typeof countTiers> }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Wards per risk tier">
      {[...TIER_ORDER].reverse().map((tier) =>
        counts[tier] > 0 ? (
          <li key={tier} className="inline-flex items-center gap-1.5">
            <RiskTierBadge tier={tier} size="sm" />
            <span className="font-mono text-sm text-white tnum">{counts[tier]}</span>
          </li>
        ) : null,
      )}
    </ul>
  );
}

function MapLegend({ mode }: { mode: RainClockStep["mode"] }) {
  return (
    <div className="pointer-events-none absolute bottom-12 right-5 z-10 hidden max-w-[15rem] rounded-lg bg-ink/85 p-3 text-xs text-mist ring-1 ring-white/10 md:block">
      {mode === "rain" ? (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-royal" />
          Every ward got rain this week. Ripples mark where it fell.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...TIER_ORDER].reverse().map((tier) => (
            <li key={tier}>
              <RiskTierBadge tier={tier} size="sm" />
            </li>
          ))}
          <li className="pt-1">Bigger dot: more expected cases (relative to the wards shown).</li>
        </ul>
      )}
      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-4 text-mist/80">
        Ward positions are approximate: the dataset has no ward boundaries.
      </p>
    </div>
  );
}

function ClockRail({
  activeId,
  stepRefs,
}: {
  activeId: StepId;
  stepRefs: React.RefObject<Map<StepId, HTMLElement>>;
}) {
  return (
    <nav aria-label="Rain clock weeks" className="absolute right-10 top-1/2 z-20 hidden -translate-y-1/2 lg:block">
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
                  "group relative flex min-h-8 cursor-pointer items-center font-mono text-xs transition-colors duration-300",
                  isActive ? "text-white" : "text-mist/70 hover:text-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute -left-[17px] h-2.5 w-2.5 rounded-full transition-all duration-300",
                    isActive ? "scale-125 bg-royal ring-4 ring-royal/30" : "bg-white/30 group-hover:bg-white/60",
                  )}
                />
                {step.clockLabel}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
