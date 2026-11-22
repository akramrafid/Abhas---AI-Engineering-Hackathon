import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { clsx } from "clsx";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  reverse?: boolean;
  pauseOnHover?: boolean;
  repeat?: number;
  children: ReactNode;
}

/**
 * Infinite horizontal scroller, from Magic UI's `marquee` (magicui.design/r/marquee), using the
 * project's clsx instead of `cn`. Keyframes live in globals.css; reduced motion stops it.
 * Copies after the first are aria-hidden so screen readers read the list once.
 */
export function Marquee({ className, reverse = false, pauseOnHover = false, repeat = 3, children, ...props }: MarqueeProps) {
  return (
    <div {...props} className={clsx("group flex gap-(--gap) overflow-hidden [--duration:60s] [--gap:0.75rem]", className)}>
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0 ? true : undefined}
          className={clsx(
            "animate-marquee flex shrink-0 justify-around gap-(--gap)",
            pauseOnHover && "group-hover:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]",
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
