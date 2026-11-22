import {
  RiskTierBadge,
  TIER_META,
  TIER_ORDER,
} from "@/components/brand/RiskTierBadge";
import { contrastRatio, formatRatio, wcagLevel } from "../contrast";
import type { BrandTokensSpec } from "../types";

export function RiskScaleSection({ tokens }: { tokens: BrandTokensSpec }) {
  const whiteHex = tokens.color.brand.white.value;

  const riskRows = [
    {
      tier: "Low" as const,
      entry: tokens.color.risk.low,
      bgVar: "--color-risk-low",
      onVar: "--color-risk-low-on",
      extraBorder: tokens.color.risk.lowCellBorder.value,
    },
    {
      tier: "Medium" as const,
      entry: tokens.color.risk.medium,
      bgVar: "--color-risk-medium",
      onVar: "--color-risk-medium-on",
    },
    {
      tier: "High" as const,
      entry: tokens.color.risk.high,
      bgVar: "--color-risk-high",
      onVar: "--color-risk-high-on",
    },
    {
      tier: "Critical" as const,
      entry: tokens.color.risk.critical,
      bgVar: "--color-risk-critical",
      onVar: "--color-risk-critical-on",
    },
  ];

  return (
    <section id="risk-scale" aria-labelledby="risk-heading" className="scroll-mt-8">
      <div className="flex flex-col gap-2 border-b border-mist pb-4">
        <h2 id="risk-heading" className="font-sans text-h1 font-bold text-navy">
          4-Tier Risk Scale &amp; Colour-Vision Accessibility
        </h2>
        <p className="max-w-3xl text-body text-slate">
          Risk colours run strictly light-to-dark from Low to Critical and are reserved
          exclusively for risk communication. Every tier always renders both English and
          Bangla labels alongside a 1–4 accessible bar meter.
        </p>
      </div>

      <div className="mt-8 grid gap-4">
        {riskRows.map(({ tier, entry, bgVar, onVar, extraBorder }) => {
          const meta = TIER_META[tier];
          const ratio = contrastRatio(entry.on ?? whiteHex, entry.value);
          return (
            <div
              key={tier}
              className="grid gap-4 rounded-lg border border-mist bg-white p-5 sm:grid-cols-[240px_1fr_auto] sm:items-center"
            >
              <div>
                <RiskTierBadge tier={tier} size="lg" />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-ink">{meta.action}</p>
                <p className="font-mono text-xs text-slate tnum">
                  bg: {bgVar} ({entry.value}) · fg: {onVar} ({entry.on})
                  {extraBorder
                    ? ` · border: --color-risk-low-border (${extraBorder})`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                <span className="rounded-sm bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-navy tnum">
                  Meter {meta.meter} / {TIER_ORDER.length}
                </span>
                <span className="font-mono text-xs text-slate tnum">
                  Contrast {formatRatio(ratio)} · {wcagLevel(ratio)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
