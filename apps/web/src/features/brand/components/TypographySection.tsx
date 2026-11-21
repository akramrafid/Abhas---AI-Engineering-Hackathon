import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import type { BrandTokensSpec } from "../types";

const TYPE_ROWS: Array<{
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

const TABULAR_SAMPLES = [
  { ward: "DSCC_Ward_07", rain: "118.4", cases: "14.2", band: "09.8–19.6", tier: "Critical" as const },
  { ward: "DNCC_Ward_19", rain: "084.0", cases: "08.7", band: "05.4–12.9", tier: "High" as const },
  { ward: "CCC_Ward_12", rain: "041.5", cases: "03.9", band: "01.8–06.4", tier: "Medium" as const },
  { ward: "GCC_Ward_03", rain: "012.2", cases: "00.6", band: "00.0–01.9", tier: "Low" as const },
];

const RADIUS_CLASS_MAP: Record<keyof BrandTokensSpec["radius"], string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  pill: "rounded-pill",
};

export function TypographySection({ tokens }: { tokens: BrandTokensSpec }) {
  return (
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
        {TYPE_ROWS.map((row) => {
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
              {TABULAR_SAMPLES.map((row) => (
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
            {(["sm", "md", "lg", "pill"] as const).map((rKey) => (
              <div key={rKey} className="flex flex-col items-center gap-2">
                <div
                  className={clsx(
                    "h-12 w-20 border-2 border-royal bg-paper",
                    RADIUS_CLASS_MAP[rKey],
                  )}
                />
                <span className="font-mono text-xs text-slate tnum">
                  {rKey}: {tokens.radius[rKey]}px
                </span>
              </div>
            ))}
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
  );
}
