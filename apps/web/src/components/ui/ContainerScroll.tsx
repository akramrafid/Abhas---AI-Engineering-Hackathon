"use client";

import { useRef, type ReactNode } from "react";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";

export interface ContainerScrollProps {
  title: ReactNode;
  children: ReactNode;
}

/**
 * Scroll-driven device frame, after Aceternity's `container-scroll-animation`
 * (ui.aceternity.com), rebuilt on GSAP ScrollTrigger instead of framer-motion: the frame starts
 * tilted back 20° and settles flat as the section scrolls, while the title lifts away.
 * Brand bezel (Navy, hairline ring, Ink-tinted depth) replaces the grey #222 frame.
 * Reduced motion: frame and title render flat and still.
 */
export function ContainerScroll({ title, children }: ContainerScrollProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ full: FULL_MOTION, mobile: "(max-width: 768px)" }, (context) => {
        const { full, mobile } = context.conditions as { full: boolean; mobile: boolean };
        if (!full) return;
        const trigger = { trigger: scope.current, start: "top bottom", end: "center center", scrub: 0.6 };
        gsap.fromTo(
          "[data-cs-card]",
          { rotateX: mobile ? 10 : 18, scale: mobile ? 0.94 : 1.0 },
          { rotateX: 0, scale: 1, ease: "none", scrollTrigger: trigger },
        );
        gsap.fromTo(
          "[data-cs-title], [data-cs-card]",
          { y: 0 },
          { y: mobile ? -24 : -72, ease: "none", scrollTrigger: trigger },
        );
      });
    },
    { scope },
  );

  return (
    <div ref={scope} className="relative flex items-center justify-center overflow-x-clip px-3 py-10 sm:px-6 md:px-14 md:py-24 lg:px-20">
      <div className="w-full [perspective:1000px]">
        <div data-cs-title className="mx-auto max-w-5xl text-center">
          {title}
        </div>
        <div
          data-cs-card
          className="mx-auto mt-8 w-full max-w-6xl rounded-[22px] bg-navy p-2 shadow-[0_9px_20px_color-mix(in_srgb,var(--color-ink)_29%,transparent),0_37px_37px_color-mix(in_srgb,var(--color-ink)_26%,transparent),0_84px_50px_color-mix(in_srgb,var(--color-ink)_15%,transparent)] ring-1 ring-white/15 sm:mt-10 sm:rounded-[30px] md:p-4"
        >
          <div className="overflow-hidden rounded-[16px] bg-ink sm:rounded-[22px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
