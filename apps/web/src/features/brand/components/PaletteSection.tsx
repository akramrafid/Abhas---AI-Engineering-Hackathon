import { clsx } from "clsx";
import { contrastRatio, formatRatio, wcagLevel } from "../contrast";
import type { BrandTokensSpec } from "../types";

interface SwatchCardConfig {
  id: string;
  name: string;
  cssVar: string;
  value: string;
  role: string;
  bgClass: string;
  textClass: string;
  borderClass?: string;
  contrastGroundHex: string;
  contrastGroundName: string;
  compareHex: string;
}

export function PaletteSection({ tokens }: { tokens: BrandTokensSpec }) {
  const whiteHex = tokens.color.brand.white.value;
  const inkHex = tokens.color.brand.ink.value;
  const navyHex = tokens.color.brand.navy.value;

  const brandSwatches: SwatchCardConfig[] = [
    {
      id: "ink",
      name: "Ink",
      cssVar: "--color-ink",
      value: tokens.color.brand.ink.value,
      role: tokens.color.brand.ink.role ?? "",
      bgClass: "bg-ink",
      textClass: "text-white",
      contrastGroundHex: whiteHex,
      contrastGroundName: "White",
      compareHex: tokens.color.brand.ink.value,
    },
    {
      id: "navy",
      name: "Navy",
      cssVar: "--color-navy",
      value: tokens.color.brand.navy.value,
      role: tokens.color.brand.navy.role ?? "",
      bgClass: "bg-navy",
      textClass: "text-white",
      contrastGroundHex: whiteHex,
      contrastGroundName: "White",
      compareHex: tokens.color.brand.navy.value,
    },
    {
      id: "royal",
      name: "Royal",
      cssVar: "--color-royal",
      value: tokens.color.brand.royal.value,
      role: tokens.color.brand.royal.role ?? "",
      bgClass: "bg-royal",
      textClass: "text-white",
      contrastGroundHex: whiteHex,
      contrastGroundName: "White",
      compareHex: tokens.color.brand.royal.value,
    },
    {
      id: "white",
      name: "White",
      cssVar: "--color-white",
      value: tokens.color.brand.white.value,
      role: tokens.color.brand.white.role ?? "",
      bgClass: "bg-white",
      textClass: "text-ink",
      borderClass: "border border-mist",
      contrastGroundHex: inkHex,
      contrastGroundName: "Ink",
      compareHex: tokens.color.brand.white.value,
    },
  ];

  const neutralSwatches: SwatchCardConfig[] = [
    {
      id: "slate",
      name: "Slate",
      cssVar: "--color-slate",
      value: tokens.color.neutral.slate.value,
      role: tokens.color.neutral.slate.role ?? "",
      bgClass: "bg-slate",
      textClass: "text-white",
      contrastGroundHex: whiteHex,
      contrastGroundName: "White",
      compareHex: tokens.color.neutral.slate.value,
    },
    {
      id: "mist",
      name: "Mist",
      cssVar: "--color-mist",
      value: tokens.color.neutral.mist.value,
      role: tokens.color.neutral.mist.role ?? "",
      bgClass: "bg-mist",
      textClass: "text-ink",
      contrastGroundHex: inkHex,
      contrastGroundName: "Ink",
      compareHex: tokens.color.neutral.mist.value,
    },
    {
      id: "paper",
      name: "Paper",
      cssVar: "--color-paper",
      value: tokens.color.neutral.paper.value,
      role: tokens.color.neutral.paper.role ?? "",
      bgClass: "bg-paper",
      textClass: "text-ink",
      borderClass: "border border-mist",
      contrastGroundHex: inkHex,
      contrastGroundName: "Ink",
      compareHex: tokens.color.neutral.paper.value,
    },
  ];

  const limeHex = tokens.color.brand.lime.value;
  const limeOnInk = contrastRatio(limeHex, inkHex);
  const limeOnNavy = contrastRatio(limeHex, navyHex);
  const limeOnWhite = contrastRatio(limeHex, whiteHex);

  return (
    <section id="palette" aria-labelledby="palette-heading" className="scroll-mt-8">
      <div className="flex flex-col gap-2 border-b border-mist pb-4">
        <h2 id="palette-heading" className="font-sans text-h1 font-bold text-navy">
          Colour Palette &amp; Token Contract
        </h2>
        <p className="max-w-3xl text-body text-slate">
          Every surface and text token comes from generated CSS variables in{" "}
          <code className="font-mono text-xs text-navy">tokens.css</code>. Zero
          hardcoded hex values appear in components.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {brandSwatches.map((swatch) => {
          const ratio = contrastRatio(swatch.compareHex, swatch.contrastGroundHex);
          return (
            <article
              key={swatch.id}
              className="flex flex-col overflow-hidden rounded-lg border border-mist bg-white"
            >
              <div
                className={clsx(
                  "flex h-28 flex-col justify-between p-4",
                  swatch.bgClass,
                  swatch.textClass,
                  swatch.borderClass,
                )}
              >
                <span className="font-sans text-base font-bold">{swatch.name}</span>
                <span className="font-mono text-xs tnum">{swatch.value}</span>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                <div>
                  <p className="font-mono text-xs font-medium text-navy">
                    {swatch.cssVar}
                  </p>
                  <p className="mt-1.5 text-sm leading-snug text-slate">
                    {swatch.role}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-mist pt-2.5 font-mono text-xs text-ink tnum">
                  <span>vs {swatch.contrastGroundName}</span>
                  <span className="font-semibold text-navy">
                    {formatRatio(ratio)} · {wcagLevel(ratio)}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Dedicated Lime Accent Rule Card — rendered strictly on Navy/Ink grounds */}
      <div className="mt-6 overflow-hidden rounded-lg border border-navy bg-navy text-white">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-lime px-3 py-1 font-mono text-xs font-semibold text-ink">
                --color-lime · {limeHex}
              </span>
              <span className="font-mono text-xs text-mist">
                Strict Accent Rule
              </span>
            </div>
            <h3 className="mt-3 font-sans text-h2 font-bold text-white">
              Lime appears only on Ink, Navy, or Royal — never in data views
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
              {tokens.color.brand.lime.role} On light backgrounds it fails legibility,
              and in charts or tables it collides with Low and Medium risk indicators.
              Use it at most once per view as a signal accent on dark surfaces.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="flex items-center justify-between rounded-md bg-ink px-4 py-2.5 font-mono text-xs tnum">
              <span className="text-lime font-semibold">Lime on Ink</span>
              <span className="text-white">
                {formatRatio(limeOnInk)} · {wcagLevel(limeOnInk)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/15 bg-navy px-4 py-2.5 font-mono text-xs tnum">
              <span className="text-lime font-semibold">Lime on Navy</span>
              <span className="text-white">
                {formatRatio(limeOnNavy)} · {wcagLevel(limeOnNavy)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-4 py-2.5 font-mono text-xs text-ink tnum">
              <span className="font-semibold">Lime on White (Banned)</span>
              <span className="font-semibold text-risk-high">
                {formatRatio(limeOnWhite)} · Fail
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting Neutrals & Chart Forecast Band */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {neutralSwatches.map((swatch) => {
          const ratio = contrastRatio(swatch.compareHex, swatch.contrastGroundHex);
          return (
            <article
              key={swatch.id}
              className="flex flex-col overflow-hidden rounded-lg border border-mist bg-white"
            >
              <div
                className={clsx(
                  "flex h-20 items-end justify-between p-4",
                  swatch.bgClass,
                  swatch.textClass,
                  swatch.borderClass,
                )}
              >
                <span className="font-sans text-sm font-bold">{swatch.name}</span>
                <span className="font-mono text-xs tnum">{swatch.value}</span>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-2 p-4">
                <div>
                  <p className="font-mono text-xs font-medium text-navy">
                    {swatch.cssVar}
                  </p>
                  <p className="mt-1 text-sm text-slate">{swatch.role}</p>
                </div>
                <p className="font-mono text-xs text-ink tnum">
                  {formatRatio(ratio)} vs {swatch.contrastGroundName} ·{" "}
                  {wcagLevel(ratio)}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-mist bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-sm font-bold text-navy">
              Forecast Uncertainty Band
            </span>
            <span className="font-mono text-xs text-slate">
              --color-forecast-band
            </span>
          </div>
          <div className="mt-3 flex h-12 items-center rounded-md border border-royal/25 bg-forecast-band px-4">
            <div className="h-0.5 w-full bg-royal" />
          </div>
          <p className="mt-2.5 text-sm text-slate">
            <code className="font-mono text-xs text-ink">
              {tokens.color.risk.forecastBand.value}
            </code>{" "}
            — {tokens.color.risk.forecastBand.role}.
          </p>
        </div>

        <div className="rounded-lg border border-mist bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-sm font-bold text-navy">
              Signal Gradient
            </span>
            <span className="font-mono text-xs text-slate">
              --gradient-signal
            </span>
          </div>
          <div className="bg-signal-gradient mt-3 h-12 rounded-md border border-mist" />
          <p className="mt-2.5 text-sm text-slate">
            {tokens.color.gradient.role}. Never applied inside charts, risk badges,
            or ward rows.
          </p>
        </div>
      </div>
    </section>
  );
}
