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
 * Counts up smoothly on first reveal and interpolates between subsequent updates
 * (e.g. when switching wards or cities) without snapping back to zero.
 * Renders the final value on the server and for prefers-reduced-motion.
 */
export function NumberTicker({ value, decimalPlaces = 0, suffix = "", className }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number | null>(null);
  const format = (n: number) => `${n.toFixed(decimalPlaces)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = format(value);
      prevRef.current = value;
      return;
    }

    let frame = 0;
    const animateFromTo = (from: number, to: number, durationMs: number) => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = format(from + (to - from) * eased);
        if (p < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          prevRef.current = to;
        }
      };
      frame = requestAnimationFrame(tick);
    };

    if (prevRef.current !== null) {
      if (prevRef.current !== value) {
        animateFromTo(prevRef.current, value, 460);
      }
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        el.textContent = format(0);
        animateFromTo(0, value, 720);
      },
      { threshold: 0.4 },
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
