"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";

export interface NumberTickerProps {
  value: number;
  decimalPlaces?: number;
  suffix?: string;
  className?: string;
}

/**
 * Counts up to `value` once it scrolls into view. Adapted from Magic UI's number-ticker
 * (magicui.design/r/number-ticker), rewritten on requestAnimationFrame so it needs no `motion` dependency.
 * The final value is rendered on the server, so it is correct without JavaScript and for reduced motion.
 */
export function NumberTicker({ value, decimalPlaces = 0, suffix = "", className }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => `${n.toFixed(decimalPlaces)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / 1200, 1);
          el.textContent = `${(value * (1 - Math.pow(1 - p, 4))).toFixed(decimalPlaces)}${suffix}`;
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        el.textContent = format(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // format is derived from the same props listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimalPlaces, suffix]);

  return (
    <span ref={ref} className={clsx("tnum", className)}>
      {format(value)}
    </span>
  );
}
