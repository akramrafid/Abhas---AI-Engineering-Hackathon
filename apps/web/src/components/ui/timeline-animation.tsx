"use client";

import React, {
  forwardRef,
  useRef,
  useState,
  useEffect,
  type ElementType,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { clsx } from "clsx";

export interface TimelineContentProps<T extends ElementType = "div"> {
  as?: T;
  animationNum?: number;
  customVariants?: {
    visible?: (i: number) => {
      y?: number | string;
      opacity?: number;
      filter?: string;
      transition?: { delay?: number; duration?: number };
    };
    hidden?: {
      y?: number | string;
      opacity?: number;
      filter?: string;
    };
  };
  timelineRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  children?: ReactNode;
}

export type TimelineContentComponentProps<T extends ElementType> =
  TimelineContentProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TimelineContentProps<T>>;

export const TimelineContent = forwardRef(
  <T extends ElementType = "div">(
    {
      as,
      animationNum = 0,
      customVariants,
      timelineRef,
      className,
      children,
      style,
      ...restProps
    }: TimelineContentComponentProps<T>,
    forwardedRef: React.ForwardedRef<HTMLElement>,
  ) => {
    const Component = as || "div";
    const localRef = useRef<HTMLElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      // If window reduces motion, show immediately
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setIsVisible(true);
        return;
      }

      const target = localRef.current;
      if (!target) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(target);
          }
        },
        {
          root: timelineRef ? timelineRef.current : null,
          threshold: 0.1,
          rootMargin: "0px 0px -50px 0px",
        },
      );

      observer.observe(target);
      return () => observer.disconnect();
    }, [timelineRef]);

    const delay = customVariants?.visible?.(animationNum)?.transition?.delay ?? animationNum * 0.15;
    const duration = customVariants?.visible?.(animationNum)?.transition?.duration ?? 0.5;

    const dynamicStyle: React.CSSProperties = {
      ...style,
      transitionProperty: "opacity, transform, filter",
      transitionDuration: `${duration}s`,
      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      transitionDelay: `${delay}s`,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? "translateY(0)" : "translateY(-16px)",
      filter: isVisible ? "blur(0px)" : "blur(8px)",
      willChange: "transform, opacity, filter",
    };

    return (
      <Component
        ref={(node: HTMLElement | null) => {
          localRef.current = node;
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef) {
            (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
          }
        }}
        className={clsx(className)}
        style={dynamicStyle}
        {...restProps}
      >
        {children}
      </Component>
    );
  },
);

TimelineContent.displayName = "TimelineContent";
