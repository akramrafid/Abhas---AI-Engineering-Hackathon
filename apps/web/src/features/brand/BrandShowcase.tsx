import Link from "next/link";
import Image from "next/image";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { BrandRibbon } from "@/components/brand/BrandRibbon";
import {
  RiskTierBadge,
  TIER_META,
  TIER_ORDER,
} from "@/components/brand/RiskTierBadge";

export interface BrandTokenColorEntry {
  value: string;
  role?: string;
  on?: string;
  label?: { en: string; bn: string };
  meter?: number;
  action?: string;
}

export interface BrandTokensSpec {
  name: string;
  nameBangla: string;
  version: string;
  color: {
    brand: Record<"ink" | "navy" | "royal" | "lime" | "white", BrandTokenColorEntry>;
    neutral: Record<"slate" | "mist" | "paper" | "white", BrandTokenColorEntry>;
    risk: {
      low: BrandTokenColorEntry;
      medium: BrandTokenColorEntry;
      high: BrandTokenColorEntry;
      critical: BrandTokenColorEntry;
      lowCellBorder: { value: string };
      forecastBand: { value: string; role?: string };
    };
    gradient: {
      signal: string;
      role: string;
    };
  };
  font: Record<
    "sans" | "mono" | "bangla",
    { family: string; fallback: string; weights: number[]; npm: string }
  >;
  type: Record<
    "display" | "h1" | "h2" | "body" | "caption" | "data",
    { font: string; weight: number; size: number; line: number; features?: string }
  >;
  radius: Record<"sm" | "md" | "lg" | "pill", number>;
  space: number[];
  logo: {
    grid: number;
    construction: string;
    versions: Record<"primary" | "reverse" | "mono", string>;
    clearSpace: string;
    minSize: {
      lockupPx: number;
      lockupMm: number;
      symbolPx: number;
      symbolMm: number;
      faviconPx: number;
    };
    wordmark: string;
    lockup: string;
    banglaLockup: string;
    cityEdition: string;
  };
  graphics: {
    ribbons: string[];
    rule: string;
  };
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const parts = clean.match(/../g);
  if (!parts || parts.length !== 3) return 0;
  const [r, g, b] = parts.map((channel) => {
    const v = parseInt(channel, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

function wcagLevel(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Decorative only";
}

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

export function BrandShowcase({ tokens }: { tokens: BrandTokensSpec }) {
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

  const typeRows: Array<{
    key: keyof BrandTokensSpec["type"];
    label: string;
    sample: string;
    className: string;
  }> = [
    {
      key: "display",
      label: "Display",
      sample: "Rain today. Risk in three weeks.",
      className: "font-sans text-display font-light text-ink",
    },
    {
      key: "h1",
      label: "Heading 1",
      sample: "Dhaka South — 2 to 4 week ward outlook",
      className: "font-sans text-h1 font-bold text-navy",
    },
    {
      key: "h2",
      label: "Heading 2",
      sample: "Rainfall lag evidence (0–8 weeks)",
      className: "font-sans text-h2 font-bold text-navy",
    },
    {
      key: "body",
      label: "Body",
      sample:
        "Water trapped in drains needs 7 to 14 days to breed Aedes aegypti before symptoms follow.",
      className: "font-sans text-body font-normal text-ink max-w-2xl",
    },
    {
      key: "caption",
      label: "Caption",
      sample: "Model v1.0 · LightGBM Poisson · 80% conformal prediction band",
      className: "font-sans text-caption font-medium text-slate",
    },
    {
      key: "data",
      label: "Data (tnum)",
      sample: "DSCC_Ward_07   118.4 mm   lag-3 r=0.47   14.2 [9.8–19.6] cases",
      className: "font-mono text-data font-medium text-ink tnum",
    },
  ];

  const tabularSamples = [
    { ward: "DSCC_Ward_07", rain: "118.4", cases: "14.2", band: "09.8–19.6", tier: "Critical" as const },
    { ward: "DNCC_Ward_19", rain: "084.0", cases: "08.7", band: "05.4–12.9", tier: "High" as const },
    { ward: "CCC_Ward_12", rain: "041.5", cases: "03.9", band: "01.8–06.4", tier: "Medium" as const },
    { ward: "GCC_Ward_03", rain: "012.2", cases: "00.6", band: "00.0–01.9", tier: "Low" as const },
  ];

  const sections = [
    { href: "#palette", label: "Palette" },
    { href: "#risk-scale", label: "Risk Scale" },
    { href: "#typography", label: "Typography" },
    { href: "#logo", label: "Logo" },
    { href: "#graphics", label: "Ribbon & Voice" },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Hero Band — Ink surface with ribbon artwork and single Lime accent */}
      <header className="relative overflow-hidden bg-ink text-white">
        <BrandRibbon variant="hero" surface="ink" />

        <div className="relative z-10 mx-auto max-w-6xl px-6 pb-14 pt-6 sm:px-8">
          <nav
            aria-label="Brand showcase navigation"
            className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5"
          >
            <AbhasLogo
              variant="reverse"
              size="md"
              showBangla
              city={`Brand Kit v${tokens.version}`}
            />

            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              {sections.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-10 items-center rounded-sm px-2.5 text-sm font-medium text-mist transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ))}
              <Link
                href="/"
                className="inline-flex min-h-10 items-center rounded-md border border-white/25 bg-navy/70 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy"
              >
                Open Dashboard
              </Link>
            </div>
          </nav>

          <div className="mt-12 max-w-3xl">
            <p className="font-mono text-xs tracking-wider text-mist">
              {tokens.name} · {tokens.nameBangla} · Source of truth: docs/brand/tokens.json
            </p>
            <h1 className="mt-4 font-sans text-display font-light tracking-tight text-white">
              Rain today. Risk in three weeks. Act now.
            </h1>
            <p lang="bn" className="mt-3 font-bangla text-h2 font-semibold text-lime">
              আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist">
              Dengue early warning, ward by ward ·{" "}
              <span lang="bn" className="font-bangla">
                ওয়ার্ড-ভিত্তিক ডেঙ্গু আগাম সতর্কতা
              </span>
              . Every colour, typographic proportion, and risk indicator on this page
              is generated directly from the Abhas design tokens.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-14 sm:px-8">
        {/* 1. Colour Palette & Contrast Rules */}
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

        {/* 2. 4-Tier Risk Scale */}
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

        {/* 3. Typography & Numeric Precision */}
        <section id="typography" aria-labelledby="type-heading" className="scroll-mt-8">
          <div className="flex flex-col gap-2 border-b border-mist pb-4">
            <h2 id="type-heading" className="font-sans text-h1 font-bold text-navy">
              Typography, Tabular Numerals &amp; Scale
            </h2>
            <p className="max-w-3xl text-body text-slate">
              Self-hosted via <code className="font-mono text-xs text-navy">@fontsource</code>{" "}
              with zero external font network requests: Manrope for headings and UI, IBM
              Plex Mono for data and codes, and Noto Sans Bengali for Bangla copy.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(["sans", "mono", "bangla"] as const).map((fontKey) => {
              const f = tokens.font[fontKey];
              return (
                <div
                  key={fontKey}
                  className="rounded-lg border border-mist bg-white p-5"
                >
                  <p className="font-mono text-xs text-royal">--font-{fontKey}</p>
                  <p
                    className={clsx(
                      "mt-2 text-2xl font-bold text-navy",
                      fontKey === "mono" && "font-mono",
                      fontKey === "bangla" && "font-bangla",
                    )}
                  >
                    {fontKey === "bangla" ? `${f.family} · আভাস` : f.family}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate tnum">
                    Weights: {f.weights.join(" · ")}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate">{f.npm}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 divide-y divide-mist overflow-hidden rounded-lg border border-mist bg-white">
            {typeRows.map((row) => {
              const spec = tokens.type[row.key];
              return (
                <div
                  key={row.key}
                  className="grid gap-3 p-5 md:grid-cols-[200px_1fr] md:items-baseline"
                >
                  <div>
                    <p className="text-sm font-bold text-navy">{row.label}</p>
                    <p className="font-mono text-xs text-slate tnum">
                      {spec.size}px / {spec.line}px · w{spec.weight}
                    </p>
                  </div>
                  <p className={row.className}>{row.sample}</p>
                </div>
              );
            })}
          </div>

          {/* Tabular Numerals Verification Table */}
          <div className="mt-6 overflow-hidden rounded-lg border border-mist bg-white">
            <div className="border-b border-mist bg-paper px-5 py-3">
              <h3 className="font-sans text-sm font-bold text-navy">
                Tabular Numerals Specimen (.tnum) — Ward Forecast Alignment
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-mist text-xs font-semibold text-slate">
                    <th className="px-5 py-3">Ward ID</th>
                    <th className="px-5 py-3 text-right">Lag-3 Rain (mm)</th>
                    <th className="px-5 py-3 text-right">Expected Cases</th>
                    <th className="px-5 py-3 text-right">80% Band</th>
                    <th className="px-5 py-3">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {tabularSamples.map((row) => (
                    <tr key={row.ward}>
                      <td className="px-5 py-3 font-mono text-data font-medium text-navy tnum">
                        {row.ward}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-data text-ink tnum">
                        {row.rain}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-data font-semibold text-ink tnum">
                        {row.cases}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-data text-slate tnum">
                        {row.band}
                      </td>
                      <td className="px-5 py-3">
                        <RiskTierBadge tier={row.tier} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Radii & Spacing */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-mist bg-white p-5">
              <h3 className="font-sans text-sm font-bold text-navy">
                Corner Radius Scale
              </h3>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {(["sm", "md", "lg", "pill"] as const).map((rKey) => {
                  const rClass =
                    rKey === "sm"
                      ? "rounded-sm"
                      : rKey === "md"
                        ? "rounded-md"
                        : rKey === "lg"
                          ? "rounded-lg"
                          : "rounded-pill";
                  return (
                    <div key={rKey} className="flex flex-col items-center gap-2">
                      <div
                        className={clsx(
                          "h-12 w-20 border-2 border-royal bg-paper",
                          rClass,
                        )}
                      />
                      <span className="font-mono text-xs text-slate tnum">
                        {rKey}: {tokens.radius[rKey]}px
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-mist bg-white p-5">
              <h3 className="font-sans text-sm font-bold text-navy">
                Spacing Scale (4 px base)
              </h3>
              <div className="mt-4 space-y-2">
                {tokens.space.map((px, idx) => (
                  <div key={px} className="flex items-center gap-3 font-mono text-xs tnum">
                    <span className="w-20 text-slate">--space-{idx + 1}</span>
                    <div
                      className="h-3 rounded-sm bg-royal"
                      style={{ width: `var(--space-${idx + 1})` }}
                    />
                    <span className="text-ink">{px}px</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Logo Lockups & Construction */}
        <section id="logo" aria-labelledby="logo-heading" className="scroll-mt-8">
          <div className="flex flex-col gap-2 border-b border-mist pb-4">
            <h2 id="logo-heading" className="font-sans text-h1 font-bold text-navy">
              Logo Lockups, Grounds &amp; Clear Space
            </h2>
            <p className="max-w-3xl text-body text-slate">
              {tokens.logo.construction}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col justify-between rounded-lg border border-mist bg-white p-6">
              <span className="font-mono text-xs text-slate">
                Primary on White
              </span>
              <div className="my-6">
                <AbhasLogo variant="primary" size="lg" />
              </div>
              <p className="text-xs text-slate">{tokens.logo.versions.primary}</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-mist bg-paper p-6">
              <span className="font-mono text-xs text-slate">
                Bilingual + City Edition on Paper
              </span>
              <div className="my-6">
                <AbhasLogo
                  variant="primary"
                  size="md"
                  showBangla
                  city="Dhaka South"
                />
              </div>
              <p className="text-xs text-slate">{tokens.logo.cityEdition}</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-mist bg-white p-6">
              <span className="font-mono text-xs text-slate">
                Bangla Lockup
              </span>
              <div className="my-6">
                <AbhasLogo variant="primary" size="lg" banglaOnly />
              </div>
              <p className="text-xs text-slate">{tokens.logo.banglaLockup}</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg bg-ink p-6 text-white">
              <span className="font-mono text-xs text-mist">
                Reverse on Ink
              </span>
              <div className="my-6">
                <AbhasLogo variant="reverse" size="lg" />
              </div>
              <p className="text-xs text-mist">{tokens.logo.versions.reverse}</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg bg-navy p-6 text-white">
              <span className="font-mono text-xs text-mist">
                Reverse on Navy + City
              </span>
              <div className="my-6">
                <AbhasLogo variant="reverse" size="md" city="Chattogram" />
              </div>
              <p className="text-xs text-mist">
                White subtitle maintains AA contrast on Navy.
              </p>
            </div>

            <div className="flex flex-col justify-between rounded-lg bg-royal p-6 text-white">
              <span className="font-mono text-xs text-white">
                Reverse on Royal
              </span>
              <div className="my-6">
                <AbhasLogo variant="reverse" size="md" showBangla />
              </div>
              <p className="text-xs text-white">
                Lime cap on Royal meets 4.2:1 graphical contrast.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="flex flex-col justify-between rounded-lg border border-mist bg-white p-6">
              <span className="font-mono text-xs text-slate">
                Monochrome Dark
              </span>
              <div className="my-5">
                <AbhasLogo variant="mono-black" size="md" />
              </div>
              <p className="text-xs text-slate">{tokens.logo.versions.mono}</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg bg-ink p-6 text-white">
              <span className="font-mono text-xs text-mist">
                Monochrome Light
              </span>
              <div className="my-5">
                <AbhasLogo variant="mono-white" size="md" />
              </div>
              <p className="text-xs text-mist">One-colour dark ground lockup.</p>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-mist bg-white p-6">
              <span className="font-mono text-xs text-slate">
                Clear Space &amp; App Icon
              </span>
              <div className="my-4 flex items-center gap-5">
                <div className="inline-block rounded-sm border border-dashed border-royal/60 bg-paper">
                  <AbhasLogo variant="primary" size="md" clearSpace />
                </div>
                <Image
                  src="/brand/logo/abhas-app-icon.svg"
                  alt="Abhas app icon"
                  width={56}
                  height={56}
                  unoptimized
                  className="shrink-0"
                />
              </div>
              <p className="font-mono text-xs text-slate tnum">
                Clear space: {tokens.logo.clearSpace} · Min lockup{" "}
                {tokens.logo.minSize.lockupPx}px · Min symbol{" "}
                {tokens.logo.minSize.symbolPx}px
              </p>
            </div>
          </div>
        </section>

        {/* 5. Ribbon Art & Editorial Voice */}
        <section id="graphics" aria-labelledby="graphics-heading" className="scroll-mt-8">
          <div className="flex flex-col gap-2 border-b border-mist pb-4">
            <h2 id="graphics-heading" className="font-sans text-h1 font-bold text-navy">
              Ribbon Art &amp; Editorial Guardrails
            </h2>
            <p className="max-w-3xl text-body text-slate">
              {tokens.graphics.rule}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="relative flex min-h-44 flex-col justify-end overflow-hidden rounded-lg bg-ink p-6 text-white">
              <BrandRibbon variant="hero" surface="ink" />
              <div className="relative z-10">
                <p className="font-mono text-xs text-mist">abhas-ribbon-hero.svg</p>
                <p className="mt-1 text-base font-bold text-white">
                  Ink Hero Surface
                </p>
              </div>
            </div>

            <div className="relative flex min-h-44 flex-col justify-end overflow-hidden rounded-lg bg-navy p-6 text-white">
              <BrandRibbon variant="fan" surface="navy" />
              <div className="relative z-10">
                <p className="font-mono text-xs text-mist">abhas-ribbon-fan.svg</p>
                <p className="mt-1 text-base font-bold text-white">
                  Navy Section Cover
                </p>
              </div>
            </div>

            <div className="relative flex min-h-44 flex-col justify-end overflow-hidden rounded-lg bg-ink p-6 text-white">
              <BrandRibbon variant="strip" surface="ink" />
              <div className="relative z-10">
                <p className="font-mono text-xs text-mist">abhas-ribbon-strip.svg</p>
                <p className="mt-1 text-base font-bold text-white">
                  Ink Banner Strip
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-mist bg-white p-6">
              <h3 className="font-sans text-base font-bold text-navy">
                Public-Health Voice Rules
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                Name the ward and the time window first, then give one action. Show
                expected ranges, not promises. Never use all-caps for emphasis or
                exclamation marks.
              </p>
            </div>
            <div className="rounded-lg border border-mist bg-white p-6">
              <h3 className="font-sans text-base font-bold text-navy">
                Prohibited Visual Motifs &amp; Motion
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                Never depict a mosquito, skull, or red cross. Do not add decorative
                animations or place ribbon artwork behind charts, tables, or tier cards.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-mist bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-slate sm:px-8">
          <div className="flex items-center gap-3">
            <AbhasLogo variant="primary" size="sm" markOnly />
            <span>
              Abhas ({tokens.nameBangla}) · Brand Kit v{tokens.version} · Self-hosted
              Manrope, IBM Plex Mono &amp; Noto Sans Bengali
            </span>
          </div>
          <Link href="/" className="font-semibold text-royal hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
