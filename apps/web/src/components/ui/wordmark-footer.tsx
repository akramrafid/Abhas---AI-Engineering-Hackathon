"use client";

import * as React from "react";
import { Plus } from "@/components/icons";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// At least 44px touch targets on mobile / coarse pointers (WCAG 2.5.5 / 2.5.8)
const tap =
  "max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

export type FooterColumn = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

export interface WordmarkFooterProps extends React.HTMLAttributes<HTMLElement> {
  /** The product name: the wordmark top left and the large background watermark. */
  name: string;
  /** Optional secondary or localized wordmark (e.g. "আভাস"). */
  localizedName?: string;
  /** The name in the © legal line. */
  legalName?: string;
  year: number;
  description?: string;
  email?: string;
  /** A short status line next to a green status pulse, e.g. "Live Open-Meteo data synced". */
  status?: string;
  /** What screen readers call the footer navigation. */
  navLabel?: string;
  columns: FooterColumn[];
  /** Optional credit or attribution link at the end of the bottom line. */
  credit?: { label: string; href: string };
  /** Color theme variant: 'dark' (Ink/Navy background per Abhas brand) or 'light' (Paper background). */
  variant?: "dark" | "light";
}

/**
 * WordmarkFooter — A clean, production-grade footer following Abhas Brand Guidelines.
 * Features folding columns on mobile, accessibility focus rings, touch targets, and
 * a large fading brand watermark across the base.
 */
export function WordmarkFooter({
  name,
  localizedName,
  legalName,
  year,
  description,
  email,
  status,
  navLabel = "Footer",
  columns,
  credit,
  variant = "dark",
  className,
  ...props
}: WordmarkFooterProps) {
  const isDark = variant === "dark";

  return (
    <footer
      className={cn(
        "relative overflow-hidden transition-colors",
        isDark
          ? "border-t border-navy/40 bg-ink text-white"
          : "border-t border-mist bg-paper text-ink",
        className
      )}
      {...props}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 pt-16 pb-10 max-md:gap-8 max-md:pt-12 max-md:pb-6 md:grid-cols-12 md:px-10">
        {/* Brand identity & status column */}
        <div className="md:col-span-5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-sans text-[26px] font-extrabold tracking-tight text-white">
              {name}
            </span>
            {localizedName && (
              <span className="font-bangla text-[20px] font-bold text-mist/90">
                ({localizedName})
              </span>
            )}
          </div>

          {description && (
            <p
              className={cn(
                "mt-4 max-w-sm text-[14px] leading-[22px]",
                isDark ? "text-mist" : "text-slate"
              )}
            >
              {description}
            </p>
          )}

          {status && (
            <div
              className={cn(
                "mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium",
                isDark
                  ? "border-royal/30 bg-navy/40 text-mist"
                  : "border-mist bg-white text-slate"
              )}
            >
              <span
                className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                aria-hidden="true"
              />
              <span>{status}</span>
            </div>
          )}
        </div>

        {/* Desktop navigation columns */}
        <nav
          aria-label={navLabel}
          className="grid grid-cols-2 gap-8 max-md:hidden md:col-span-7 md:grid-cols-3"
        >
          {columns.map((col) => (
            <div key={col.title}>
              <p
                className={cn(
                  "font-mono text-[11px] font-semibold tracking-[0.14em] uppercase",
                  isDark ? "text-mist/70" : "text-slate"
                )}
              >
                {col.title}
              </p>
              <ul className="mt-4 grid gap-2.5 pointer-coarse:mt-2 pointer-coarse:gap-1">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      className={cn(
                        "text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-royal",
                        isDark
                          ? "text-mist hover:text-white"
                          : "text-slate hover:text-ink",
                        tap
                      )}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Mobile accordion navigation (accessible details/summary) */}
        <nav aria-label={navLabel} className="-mx-2 grid gap-1.5 md:hidden">
          {columns.map((col) => (
            <details
              key={col.title}
              className={cn(
                "group rounded-xl border transition-colors open:bg-white/[0.04]",
                isDark ? "border-slate/30" : "border-mist bg-white"
              )}
            >
              <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
                <span
                  className={cn(
                    "font-mono text-[12px] font-semibold tracking-[0.14em] uppercase",
                    isDark ? "text-mist" : "text-slate"
                  )}
                >
                  {col.title}
                </span>
                <Plus
                  className={cn(
                    "size-4 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none",
                    isDark ? "text-mist" : "text-slate"
                  )}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </summary>
              <ul className="px-4 pb-4 pt-1">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      className={cn(
                        "block py-2 text-[15px] transition-colors",
                        isDark
                          ? "text-mist hover:text-white"
                          : "text-slate hover:text-ink",
                        tap
                      )}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>
      </div>

      {/* Sub-footer copyright & attribution */}
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl flex-col gap-2 border-t px-6 py-6 text-[13px] sm:flex-row sm:items-center sm:gap-6 md:px-10",
          isDark ? "border-navy/60 text-mist/70" : "border-mist text-slate"
        )}
      >
        <p className="font-mono tabular-nums">
          © {year} {legalName ?? name}. All rights reserved.
        </p>

        {email && (
          <a
            href={`mailto:${email}`}
            className={cn(
              "transition-colors",
              isDark ? "hover:text-white" : "hover:text-ink",
              tap
            )}
          >
            {email}
          </a>
        )}

        {credit && (
          <a
            href={credit.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "transition-colors sm:ml-auto",
              isDark ? "hover:text-white" : "hover:text-ink",
              tap
            )}
          >
            {credit.label}
          </a>
        )}
      </div>

      {/* Giant faded brand wordmark across base */}
      <p
        aria-hidden="true"
        className={cn(
          "pointer-events-none -mb-[0.2em] text-center text-[clamp(80px,22vw,320px)] font-black leading-[0.85] tracking-[-0.04em] text-transparent select-none [background-clip:text] [-webkit-background-clip:text]",
          isDark
            ? "[background-image:linear-gradient(to_bottom,rgba(47,91,255,0.22),transparent_85%)]"
            : "[background-image:linear-gradient(to_bottom,rgba(11,26,92,0.12),transparent_85%)]"
        )}
      >
        {name.toUpperCase()}
      </p>
    </footer>
  );
}

export default WordmarkFooter;
