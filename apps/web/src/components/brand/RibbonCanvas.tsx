"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";

export interface RibbonCanvasProps {
  /** Number of fine lines per ribbon (brand ribbons are dense rain curtains). */
  lines?: number;
  /** 0..1 vertical position of the ribbon's centre at the left and right edges. */
  from?: number;
  to?: number;
  /** Seconds per full drift cycle. */
  period?: number;
  className?: string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The brand's fine-line ribbon ("rain curtains in wind", guidelines p.14), drawn live on canvas:
 * a band of thin strokes twisting between two drifting curves, shaded along the signal gradient
 * Navy → Royal → Lime → White. Decorative only (aria-hidden); never placed behind data.
 * Pauses off-screen; draws one still frame under reduced motion.
 */
export function RibbonCanvas({
  lines = 96,
  from = 0.82,
  to = 0.12,
  period = 18,
  className,
}: RibbonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const palette = {
      navy: cssVar("--color-navy"),
      royal: cssVar("--color-royal"),
      lime: cssVar("--color-lime"),
      white: cssVar("--color-white"),
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let lastDraw = 0;
    let gradient: CanvasGradient | null = null;
    let activeLines = lines;
    let activeSteps = 64;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, palette.navy);
      gradient.addColorStop(0.35, palette.royal);
      gradient.addColorStop(0.72, palette.lime);
      gradient.addColorStop(1, palette.white);
      const compact = width < 768;
      activeLines = compact ? Math.min(lines, 42) : Math.min(lines, 72);
      activeSteps = compact ? 44 : 64;
    };

    const draw = (time: number) => {
      if (!width || !height || !gradient) return;
      const t = (time / 1000 / period) * Math.PI * 2;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 0.65;

      const steps = activeSteps;
      // Two strands, like the cover: a wide main ribbon and a thinner one crossing below it.
      const strands = [
        { a: from, b: to, phase: 0, scale: 1, count: activeLines },
        { a: Math.min(from + 0.18, 1.05), b: to + 0.42, phase: 2.2, scale: 0.6, count: Math.round(activeLines * 0.68) },
      ];
      for (const strand of strands) {
        for (let i = 0; i < strand.count; i++) {
          const u = i / (strand.count - 1); // position across the ribbon
          ctx.globalAlpha = (0.22 + 0.55 * Math.sin(Math.PI * u) ** 2) * (strand.scale === 1 ? 1 : 0.75);
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const p = s / steps;
            const x = -0.05 * width + p * width * 1.1;
            // Centre falls from a to b on a slow S-curve; the band swells and twists along x.
            const centre = (strand.a + (strand.b - strand.a) * (p * p * (3 - 2 * p))) * height;
            const swell = Math.sin(p * Math.PI * 1.6 + t + strand.phase) * 0.08 * height;
            const twist = Math.sin(p * Math.PI * 2.2 - t * 0.7 + 1.3 + strand.phase);
            const thickness = (0.1 + 0.3 * Math.sin(p * Math.PI)) * height * strand.scale;
            const y = centre + swell + (u - 0.5) * thickness * twist;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const stopLoop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const loop = (time: number) => {
      if (!visible || document.hidden) {
        frame = 0;
        return;
      }
      // Ambient 18s drift needs ~30fps max — saves ~50% GPU/CPU main-thread work.
      if (time - lastDraw >= 32) {
        lastDraw = time;
        draw(time);
      }
      frame = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (reduced || frame || !visible || document.hidden) return;
      frame = requestAnimationFrame(loop);
    };

    resize();
    draw(0);
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    resizeObserver.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) startLoop();
      else stopLoop();
    });
    io.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    startLoop();

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lines, from, to, period]);

  return <canvas ref={canvasRef} aria-hidden="true" className={clsx("pointer-events-none block", className)} />;
}
