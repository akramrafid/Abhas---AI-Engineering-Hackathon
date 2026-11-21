import { useId } from "react";
import { clsx } from "clsx";

export type AbhasLogoVariant =
  | "primary"
  | "reverse"
  | "mono"
  | "mono-black"
  | "mono-white";

export type AbhasLogoSize = "sm" | "md" | "lg";

export interface AbhasLogoProps {
  /**
   * - `primary`: Royal cap + Navy city (White or Paper light grounds)
   * - `reverse`: Lime cap + White city (Ink, Navy, or Royal dark grounds only)
   * - `mono`: Single-colour mark & text using `currentColor`
   * - `mono-black`: Single-colour Ink on light grounds
   * - `mono-white`: Single-colour White on dark grounds
   */
  variant?: AbhasLogoVariant;
  size?: AbhasLogoSize;
  /** Render Bangla "আভাস" alongside the English ABHAS wordmark. */
  showBangla?: boolean;
  /** Render the Bangla-only lockup ("symbol + আভাস" in Noto Sans Bengali 700). */
  banglaOnly?: boolean;
  /** Optional city edition subtitle rendered under the wordmark at 0.52x scale. */
  city?: string;
  /** Render only the 48x48 geometric drop-and-chevron mark. */
  markOnly?: boolean;
  /** Apply 0.25 x symbol-height minimum clear space padding around the lockup. */
  clearSpace?: boolean;
  className?: string;
}

interface SizeMetrics {
  fontPx: number;
  symbolPx: number;
  gapPx: number;
  cityPx: number;
  banglaPx: number;
  clearPx: number;
}

// Geometry derived from docs/brand/tokens.json:
// symbol height = 1.18 x font size (min 24px), gap = 0.34 x font size,
// clearSpace = 0.25 x symbol height, cityEdition = 0.52 x wordmark size.
const SIZE_METRICS: Record<AbhasLogoSize, SizeMetrics> = {
  sm: {
    fontPx: 20,
    symbolPx: 24,
    gapPx: 7,
    cityPx: 11,
    banglaPx: 18,
    clearPx: 6,
  },
  md: {
    fontPx: 24,
    symbolPx: 28,
    gapPx: 8,
    cityPx: 13,
    banglaPx: 22,
    clearPx: 7,
  },
  lg: {
    fontPx: 32,
    symbolPx: 38,
    gapPx: 11,
    cityPx: 17,
    banglaPx: 28,
    clearPx: 10,
  },
};

interface VariantPalette {
  capFill: string;
  cityFill: string;
  wordmarkClass: string;
  banglaClass: string;
  cityClass: string;
}

const VARIANT_PALETTE: Record<AbhasLogoVariant, VariantPalette> = {
  primary: {
    capFill: "var(--color-royal)",
    cityFill: "var(--color-navy)",
    wordmarkClass: "text-navy",
    banglaClass: "text-slate",
    cityClass: "text-royal",
  },
  reverse: {
    capFill: "var(--color-lime)",
    cityFill: "var(--color-white)",
    wordmarkClass: "text-white",
    banglaClass: "text-white",
    cityClass: "text-white",
  },
  mono: {
    capFill: "currentColor",
    cityFill: "currentColor",
    wordmarkClass: "text-current",
    banglaClass: "text-current",
    cityClass: "text-current",
  },
  "mono-black": {
    capFill: "var(--color-ink)",
    cityFill: "var(--color-ink)",
    wordmarkClass: "text-ink",
    banglaClass: "text-ink",
    cityClass: "text-ink",
  },
  "mono-white": {
    capFill: "var(--color-white)",
    cityFill: "var(--color-white)",
    wordmarkClass: "text-white",
    banglaClass: "text-white",
    cityClass: "text-white",
  },
};

export function AbhasLogo({
  variant = "primary",
  size = "md",
  showBangla = false,
  banglaOnly = false,
  city,
  markOnly = false,
  clearSpace = false,
  className,
}: AbhasLogoProps) {
  const uid = useId();
  const clipId = `${uid}-drop`;
  const maskId = `${uid}-cut`;
  const m = SIZE_METRICS[size];
  const palette = VARIANT_PALETTE[variant];

  const svgMark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={m.symbolPx}
      height={m.symbolPx}
      className="shrink-0"
      role={markOnly ? "img" : undefined}
      aria-label={markOnly ? "Abhas" : undefined}
      aria-hidden={markOnly ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M24 3C17 12.5 9 22 9 30.5a15 15 0 0 0 30 0C39 22 31 12.5 24 3Z" />
        </clipPath>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="48"
          height="48"
        >
          <rect width="48" height="48" fill="white" />
          <path
            d="M0 41.2L24 16L48 41.2"
            fill="none"
            stroke="black"
            strokeWidth="3"
            strokeMiterlimit="10"
          />
        </mask>
      </defs>
      <g clipPath={`url(#${clipId})`} mask={`url(#${maskId})`}>
        <rect width="48" height="48" fill={palette.cityFill} />
        <path d="M0 0H48V41.2L24 16L0 41.2Z" fill={palette.capFill} />
      </g>
    </svg>
  );

  if (markOnly) {
    return (
      <span
        className={clsx("inline-flex items-center justify-center", className)}
        style={clearSpace ? { padding: m.clearPx } : undefined}
      >
        {svgMark}
      </span>
    );
  }

  return (
    <span
      className={clsx("inline-flex items-center select-none", className)}
      style={{
        gap: m.gapPx,
        padding: clearSpace ? m.clearPx : undefined,
      }}
    >
      {svgMark}
      <span className="inline-flex flex-col leading-none">
        {banglaOnly ? (
          <span
            lang="bn"
            className={clsx(
              "font-bangla font-bold leading-none",
              palette.wordmarkClass,
            )}
            style={{ fontSize: m.banglaPx }}
          >
            আভাস
          </span>
        ) : (
          <span className="inline-flex items-baseline gap-2">
            <span
              className={clsx(
                "font-sans font-extrabold uppercase tracking-[0.08em] leading-none",
                palette.wordmarkClass,
              )}
              style={{ fontSize: m.fontPx }}
            >
              ABHAS
            </span>
            {showBangla ? (
              <span
                lang="bn"
                className={clsx(
                  "font-bangla font-bold leading-none",
                  palette.banglaClass,
                )}
                style={{ fontSize: Math.round(m.fontPx * 0.78) }}
              >
                আভাস
              </span>
            ) : null}
          </span>
        )}
        {city ? (
          <span
            className={clsx(
              "mt-1 font-sans font-semibold leading-none tracking-[0.02em]",
              palette.cityClass,
            )}
            style={{ fontSize: m.cityPx }}
          >
            {city}
          </span>
        ) : null}
      </span>
    </span>
  );
}
