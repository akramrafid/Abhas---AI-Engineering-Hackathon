"use client";

import { AlertTriangle, Check } from "@/components/icons";
import { clsx } from "clsx";
import type { Lang } from "@/lib/i18n";

export type DeficitLevel = "none" | "deficit" | "critical";

export interface DeficitBadgeProps {
  level: DeficitLevel;
  lang?: Lang;
  testId?: string;
}

const LABELS: Record<DeficitLevel, Record<Lang, string>> = {
  critical: { en: "Critical deficit", bn: "সংকটপূর্ণ ঘাটতি" },
  deficit: { en: "Deficit", bn: "ঘাটতি" },
  none: { en: "Covered", bn: "পর্যাপ্ত" },
};

/**
 * Operational supply-deficit status badge.
 * Uses Ink/Navy/Paper tokens exclusively (never Lime, never risk-tier colors).
 */
export function DeficitBadge({ level, lang = "en", testId }: DeficitBadgeProps) {
  return (
    <span
      data-testid={testId}
      data-deficit-level={level}
      lang={lang}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        lang === "bn" && "font-bangla",
        level === "critical" && "border-ink bg-ink text-white",
        level === "deficit" && "border-navy bg-paper text-navy",
        level === "none" && "border-mist bg-white text-slate",
      )}
    >
      {level === "none" ? (
        <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-navy" />
      ) : (
        <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
      )}
      <span>{LABELS[level][lang]}</span>
    </span>
  );
}
