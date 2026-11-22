"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { gsap } from "@/components/motion/gsap";

export interface AnimatedBeamProps {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

/**
 * A pulse travelling along a curved path between two elements. From Magic UI's `animated-beam`
 * (magicui.design/r/animated-beam), with the `motion` gradient tween replaced by GSAP and colours
 * taken from the brand tokens (Royal track, Royal → White pulse). Static track under reduced motion.
 */
export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 3.2,
  delay = 0,
  className,
}: AnimatedBeamProps) {
  const id = useId().replace(/:/g, "");
  const gradientRef = useRef<SVGLinearGradientElement>(null);
  const [path, setPath] = useState({ d: "", width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      const container = containerRef.current?.getBoundingClientRect();
      const a = fromRef.current?.getBoundingClientRect();
      const b = toRef.current?.getBoundingClientRect();
      if (!container || !a || !b) return;
      const sx = a.right - container.left;
      const sy = a.top - container.top + a.height / 2;
      const ex = b.left - container.left;
      const ey = b.top - container.top + b.height / 2;
      setPath({
        d: `M ${sx},${sy} C ${(sx + ex) / 2},${sy - curvature} ${(sx + ex) / 2},${ey - curvature} ${ex},${ey}`,
        width: container.width,
        height: container.height,
      });
    };
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    update();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, curvature]);

  useEffect(() => {
    const gradient = gradientRef.current;
    if (!gradient || !path.d || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(
      gradient,
      { attr: { x1: "-20%", x2: "0%" } },
      { attr: { x1: "100%", x2: "120%" }, duration, delay, ease: "power2.inOut", repeat: -1, repeatDelay: 0.6 },
    );
    return () => {
      tween.kill();
    };
  }, [path.d, duration, delay]);

  return (
    <svg
      aria-hidden="true"
      fill="none"
      width={path.width}
      height={path.height}
      viewBox={`0 0 ${path.width} ${path.height}`}
      className={`pointer-events-none absolute left-0 top-0 ${className ?? ""}`}
    >
      <path d={path.d} stroke="var(--color-royal)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" />
      <path d={path.d} stroke={`url(#beam-${id})`} strokeWidth={2.5} strokeLinecap="round" />
      <defs>
        <linearGradient ref={gradientRef} id={`beam-${id}`} gradientUnits="objectBoundingBox" x1="-20%" x2="0%" y1="0" y2="0">
          <stop stopColor="var(--color-royal)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--color-royal)" />
          <stop offset="1" stopColor="var(--color-white)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
