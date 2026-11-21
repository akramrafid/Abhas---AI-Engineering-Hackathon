import Image from "next/image";
import { clsx } from "clsx";

export type BrandRibbonVariant = "hero" | "fan" | "strip";

/**
 * Per Abhas brand rules, ribbon artwork may ONLY appear on Ink
 * or Navy covers, section headers, and hero bands — never behind data.
 */
export type BrandRibbonSurface = "ink" | "navy";

export interface BrandRibbonProps {
  variant?: BrandRibbonVariant;
  surface?: BrandRibbonSurface;
  className?: string;
}

const RIBBON_META: Record<
  BrandRibbonVariant,
  { src: string; width: number; height: number }
> = {
  hero: {
    src: "/brand/art/abhas-ribbon-hero.svg",
    width: 1600,
    height: 1130,
  },
  fan: {
    src: "/brand/art/abhas-ribbon-fan.svg",
    width: 1600,
    height: 1130,
  },
  strip: {
    src: "/brand/art/abhas-ribbon-strip.svg",
    width: 2000,
    height: 520,
  },
};

const SCRIM_CLASS: Record<BrandRibbonSurface, string> = {
  ink: "bg-gradient-to-r from-ink via-ink/70 to-transparent",
  navy: "bg-gradient-to-r from-navy via-navy/70 to-transparent",
};

export function BrandRibbon({
  variant = "hero",
  surface = "ink",
  className,
}: BrandRibbonProps) {
  const asset = RIBBON_META[variant];

  return (
    <div
      aria-hidden="true"
      data-brand-ribbon={variant}
      data-brand-surface={surface}
      className={clsx(
        "pointer-events-none absolute inset-0 overflow-hidden select-none",
        className,
      )}
    >
      <Image
        src={asset.src}
        alt=""
        width={asset.width}
        height={asset.height}
        unoptimized
        priority={variant === "hero"}
        className="h-full w-full object-cover object-right opacity-65"
      />
      <div className={clsx("absolute inset-0", SCRIM_CLASS[surface])} />
    </div>
  );
}
