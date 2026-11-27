"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SQRT_5000 = Math.sqrt(5000);

export interface StaggerTestimonialItem {
  id: string;
  testimonial: string;
  by: string;
  role: string;
  org: string;
  cityShort: string;
  wardRef: string;
  metric: string;
  metricLabel: string;
  imgSrc: string;
}

interface InternalCardItem extends StaggerTestimonialItem {
  uid: number;
}

interface TestimonialCardProps {
  position: number;
  testimonial: InternalCardItem;
  handleMove: (steps: number) => void;
  cardSize: number;
  lang: "en" | "bn";
}

const TestimonialCard: React.FC<TestimonialCardProps> = ({
  position,
  testimonial,
  handleMove,
  cardSize,
  lang,
}) => {
  const isCenter = position === 0;
  const bn = lang === "bn";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleMove(position);
    }
  };

  return (
    <div
      role="button"
      tabIndex={Math.abs(position) <= 2 ? 0 : -1}
      aria-current={isCenter ? "true" : undefined}
      onClick={() => handleMove(position)}
      onKeyDown={handleKeyDown}
      className={cn(
        "absolute left-1/2 top-1/2 flex cursor-pointer flex-col justify-between border-2 p-6 transition-all duration-500 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal sm:p-7",
        isCenter
          ? "z-10 border-royal bg-royal text-white"
          : "z-0 border-mist bg-white text-ink hover:border-royal/55",
      )}
      style={{
        width: cardSize,
        height: cardSize,
        clipPath:
          "polygon(0% 0%, calc(100% - 50px) 0%, 100% 50px, 100% 100%, 0% 100%)",
        transform: `
          translate(-50%, -50%)
          translateX(${(cardSize / 1.48) * position}px)
          translateY(${isCenter ? -56 : position % 2 ? 16 : -14}px)
          rotate(${isCenter ? 0 : position % 2 ? 2.5 : -2.5}deg)
        `,
        boxShadow: isCenter
          ? "0px 8px 0px 4px var(--color-navy)"
          : "0px 2px 12px -4px rgba(11, 26, 92, 0.1)",
      }}
    >
      {/* Chamfered diagonal corner fold edge */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute block origin-top-right rotate-45",
          isCenter ? "bg-white/40" : "bg-mist",
        )}
        style={{
          right: -2,
          top: 48,
          width: SQRT_5000,
          height: 2,
        }}
      />

      {/* Top row: Portrait + City/Metric pill */}
      <div>
        <div className="flex items-start justify-between gap-3 pr-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={testimonial.imgSrc}
            alt={`${testimonial.by}, ${testimonial.role}`}
            className="h-14 w-12 shrink-0 bg-paper object-cover object-top"
            style={{
              boxShadow: isCenter
                ? "3px 3px 0px var(--color-navy)"
                : "3px 3px 0px var(--color-mist)",
            }}
          />
          <div className="text-right">
            <span
              className={cn(
                "inline-block rounded-sm px-2 py-0.5 text-[11px] font-bold tracking-wide tnum",
                isCenter ? "bg-navy text-white" : "bg-paper text-navy ring-1 ring-mist",
              )}
            >
              {testimonial.cityShort} · {testimonial.metric}
            </span>
            <p
              className={cn(
                "mt-1 text-[11px] font-medium",
                bn && "font-bangla",
                isCenter ? "text-white/95" : "text-slate",
              )}
            >
              {testimonial.wardRef}
            </p>
          </div>
        </div>

        {/* Quote body */}
        <h3
          className={cn(
            "mt-3.5 line-clamp-6 text-sm font-medium leading-relaxed sm:mt-4 sm:text-[15px] sm:leading-[1.52]",
            bn && "font-bangla",
            isCenter ? "text-white" : "text-ink",
          )}
        >
          &ldquo;{testimonial.testimonial}&rdquo;
        </h3>
      </div>

      {/* Bottom attribution + measured outcome */}
      <div
        className={cn(
          "border-t pt-3",
          isCenter ? "border-white/25" : "border-mist",
        )}
      >
        <p
          className={cn(
            "text-xs font-bold leading-snug sm:text-sm",
            bn && "font-bangla",
            isCenter ? "text-white" : "text-navy",
          )}
        >
          — {testimonial.by}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-[11px] font-medium",
            bn && "font-bangla",
            isCenter ? "text-white/95" : "text-slate",
          )}
        >
          {testimonial.role} · {testimonial.org}
        </p>
      </div>
    </div>
  );
};

export interface StaggerTestimonialsProps {
  items: readonly StaggerTestimonialItem[];
  lang?: "en" | "bn";
  className?: string;
}

/**
 * Interactive staggered chamfered-card testimonial deck modeled on the 21st.dev StaggerTestimonials
 * component, styled with Abhas's brand palette (Royal active card, Mist/White side cards, Navy shadow)
 * and deterministic cycling keys.
 */
export const StaggerTestimonials: React.FC<StaggerTestimonialsProps> = ({
  items,
  lang = "en",
  className,
}) => {
  const bn = lang === "bn";
  const [cardSize, setCardSize] = useState(375);
  const nextUidRef = useRef(100);

  // Repeat source items once so 12 cards fill wide viewports cleanly on both sides of center.
  const buildDeck = (source: readonly StaggerTestimonialItem[]): InternalCardItem[] => {
    const doubled = source.length >= 10 ? source : [...source, ...source];
    return doubled.map((item, i) => ({ ...item, uid: i + 1 }));
  };

  const [deckOrder, setDeckOrder] = useState<Array<{ id: string; uid: number }>>(() =>
    buildDeck(items).map(({ id, uid }) => ({ id, uid })),
  );

  // Resolve latest localized item copy by id so switching EN/বাংলা updates in place without resetting position.
  const itemById = new Map(items.map((item) => [item.id, item]));
  const testimonialsList: InternalCardItem[] = deckOrder
    .map((slot) => {
      const data = itemById.get(slot.id);
      return data ? { ...data, uid: slot.uid } : null;
    })
    .filter((x): x is InternalCardItem => x !== null);

  const handleMove = (steps: number) => {
    if (steps === 0) return;
    setDeckOrder((prev) => {
      const next = [...prev];
      if (steps > 0) {
        for (let i = steps; i > 0; i--) {
          const item = next.shift();
          if (!item) break;
          nextUidRef.current += 1;
          next.push({ id: item.id, uid: nextUidRef.current });
        }
      } else {
        for (let i = steps; i < 0; i++) {
          const item = next.pop();
          if (!item) break;
          nextUidRef.current += 1;
          next.unshift({ id: item.id, uid: nextUidRef.current });
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const updateSize = () => {
      const { matches } = window.matchMedia("(min-width: 640px)");
      setCardSize(matches ? 375 : 300);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return (
    <div
      data-testid="stagger-testimonials"
      className={cn(
        "relative w-full overflow-hidden rounded-[16px] border border-mist bg-paper/70",
        className,
      )}
      style={{ height: cardSize >= 365 ? 580 : 520 }}
    >
      {testimonialsList.map((testimonial, index) => {
        const position =
          testimonialsList.length % 2
            ? index - (testimonialsList.length + 1) / 2
            : index - testimonialsList.length / 2;
        return (
          <TestimonialCard
            key={testimonial.uid}
            testimonial={testimonial}
            handleMove={handleMove}
            position={position}
            cardSize={cardSize}
            lang={lang}
          />
        );
      })}

      {/* Square Prev / Next controls */}
      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2.5">
        <button
          type="button"
          data-testid="stagger-prev"
          onClick={() => handleMove(-1)}
          className={cn(
            "flex h-12 w-12 cursor-pointer items-center justify-center border-2 border-mist bg-white text-navy transition-colors",
            "hover:border-royal hover:bg-royal hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 sm:h-14 sm:w-14",
          )}
          aria-label={bn ? "আগের মতামত দেখুন" : "Previous testimonial"}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="stagger-next"
          onClick={() => handleMove(1)}
          className={cn(
            "flex h-12 w-12 cursor-pointer items-center justify-center border-2 border-mist bg-white text-navy transition-colors",
            "hover:border-royal hover:bg-royal hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 sm:h-14 sm:w-14",
          )}
          aria-label={bn ? "পরবর্তী মতামত দেখুন" : "Next testimonial"}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
