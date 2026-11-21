import type { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { TIER_ACTIONS_BN, type Lang } from "@/lib/i18n";

export type RiskTier = "Low" | "Medium" | "High" | "Critical";

export interface TierMeta {
  tier: RiskTier;
  labelEn: string;
  labelBn: string;
  meter: 1 | 2 | 3 | 4;
  action: string;
  bgVar: string;
  fgVar: string;
  borderVar: string;
  badgeClasses: string;
}

export const TIER_ORDER: readonly RiskTier[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
] as const;

export const TIER_META: Record<RiskTier, TierMeta> = {
  Low: {
    tier: "Low",
    labelEn: "Low",
    labelBn: "নিম্ন",
    meter: 1,
    action: "Routine surveillance.",
    bgVar: "var(--color-risk-low)",
    fgVar: "var(--color-risk-low-on)",
    borderVar: "var(--color-risk-low-border)",
    badgeClasses:
      "bg-risk-low text-risk-low-on border-risk-low-border",
  },
  Medium: {
    tier: "Medium",
    labelEn: "Medium",
    labelBn: "মাঝারি",
    meter: 2,
    action: "Inspect breeding sites this week.",
    bgVar: "var(--color-risk-medium)",
    fgVar: "var(--color-risk-medium-on)",
    borderVar: "var(--color-risk-medium)",
    badgeClasses:
      "bg-risk-medium text-risk-medium-on border-risk-medium",
  },
  High: {
    tier: "High",
    labelEn: "High",
    labelBn: "উচ্চ",
    meter: 3,
    action: "Larvicide hotspots; alert clinics.",
    bgVar: "var(--color-risk-high)",
    fgVar: "var(--color-risk-high-on)",
    borderVar: "var(--color-risk-high)",
    badgeClasses:
      "bg-risk-high text-risk-high-on border-risk-high",
  },
  Critical: {
    tier: "Critical",
    labelEn: "Critical",
    labelBn: "সংকটপূর্ণ",
    meter: 4,
    action: "Deploy teams now; ready beds and saline.",
    bgVar: "var(--color-risk-critical)",
    fgVar: "var(--color-risk-critical-on)",
    borderVar: "var(--color-risk-critical)",
    badgeClasses:
      "bg-risk-critical text-risk-critical-on border-risk-critical",
  },
};

export function isRiskTier(value: string): value is RiskTier {
  return value === "Low" || value === "Medium" || value === "High" || value === "Critical";
}

export type RiskTierBadgeSize = "sm" | "md" | "lg";

export interface RiskTierBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tier: RiskTier;
  size?: RiskTierBadgeSize;
  /** Optionally render the recommended public-health action beneath the badge label. */
  showAction?: boolean;
  /** Active display language for action copy and primary label ordering. */
  lang?: Lang;
}

const SIZE_CLASSES: Record<
  RiskTierBadgeSize,
  { pill: string; text: string; barWidth: string; barHeights: readonly [string, string, string, string] }
> = {
  sm: {
    pill: "gap-2 px-2.5 py-1 text-xs",
    text: "text-xs",
    barWidth: "w-1",
    barHeights: ["h-1.5", "h-2", "h-2.5", "h-3"],
  },
  md: {
    pill: "gap-2.5 px-3 py-1.5 text-sm",
    text: "text-sm",
    barWidth: "w-1.5",
    barHeights: ["h-2", "h-2.5", "h-3", "h-3.5"],
  },
  lg: {
    pill: "gap-3 px-4 py-2 text-base",
    text: "text-base",
    barWidth: "w-1.5",
    barHeights: ["h-2", "h-3", "h-3.5", "h-4"],
  },
};

export function RiskTierBadge({
  tier,
  size = "md",
  showAction = false,
  lang = "en",
  className,
  ...props
}: RiskTierBadgeProps) {
  const meta = TIER_META[tier];
  const s = SIZE_CLASSES[size];
  const actionText = lang === "bn" ? TIER_ACTIONS_BN[tier] : meta.action;

  return (
    <span
      {...props}
      className={clsx(
        "inline-flex flex-col items-start rounded-md border font-semibold",
        meta.badgeClasses,
        s.pill,
        className,
      )}
    >
      <span className="inline-flex items-center gap-2.5">
        <span
          role="img"
          aria-label={`Risk level ${meta.meter} of 4: ${meta.labelEn}`}
          className="inline-flex items-end gap-0.5 shrink-0"
        >
          {s.barHeights.map((heightClass, index) => {
            const active = index < meta.meter;
            return (
              <span
                key={heightClass}
                aria-hidden="true"
                className={clsx(
                  "rounded-[1px]",
                  s.barWidth,
                  heightClass,
                  active
                    ? "bg-current"
                    : "border border-current/60 bg-transparent",
                )}
              />
            );
          })}
        </span>
        <span className={clsx("inline-flex items-baseline gap-1.5 leading-none", s.text)}>
          {lang === "bn" ? (
            <>
              <span lang="bn" className="font-bangla font-semibold">
                {meta.labelBn}
              </span>
              <span aria-hidden="true" className="opacity-65">
                /
              </span>
              <span className="text-[0.85em] opacity-90">{meta.labelEn}</span>
            </>
          ) : (
            <>
              <span>{meta.labelEn}</span>
              <span aria-hidden="true" className="opacity-65">
                /
              </span>
              <span lang="bn" className="font-bangla font-semibold">
                {meta.labelBn}
              </span>
            </>
          )}
        </span>
      </span>
      {showAction ? (
        <span
          lang={lang}
          className={clsx(
            "text-xs font-normal leading-snug opacity-95",
            lang === "bn" && "font-bangla",
          )}
        >
          {actionText}
        </span>
      ) : null}
    </span>
  );
}
