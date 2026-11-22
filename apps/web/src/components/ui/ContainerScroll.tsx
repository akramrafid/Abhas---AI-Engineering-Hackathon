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
          { rotateX: 20, scale: mobile ? 0.7 : 1.05 },
          { rotateX: 0, scale: mobile ? 0.9 : 1, ease: "none", scrollTrigger: trigger },
        );
        gsap.fromTo("[data-cs-title], [data-cs-card]", { y: 0 }, { y: -100, ease: "none", scrollTrigger: trigger });
      });
    },
    { scope },
  );

  return (
    <div ref={scope} className="relative flex items-center justify-center px-2 py-10 md:px-20 md:py-28">
      <div className="w-full [perspective:1000px]">
        <div data-cs-title className="mx-auto max-w-5xl text-center">
          {title}
        </div>
        <div
          data-cs-card
          className="mx-auto mt-10 w-full max-w-6xl rounded-[30px] bg-navy p-2 shadow-[0_9px_20px_color-mix(in_srgb,var(--color-ink)_29%,transparent),0_37px_37px_color-mix(in_srgb,var(--color-ink)_26%,transparent),0_84px_50px_color-mix(in_srgb,var(--color-ink)_15%,transparent)] ring-1 ring-white/15 md:p-4"
        >
          <div className="overflow-hidden rounded-[22px] bg-ink">{children}</div>
        </div>
      </div>
    </div>
  );
}
