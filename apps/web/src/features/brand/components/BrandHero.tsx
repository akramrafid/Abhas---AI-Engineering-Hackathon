import Link from "next/link";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { BrandRibbon } from "@/components/brand/BrandRibbon";
import type { BrandTokensSpec } from "../types";

const NAV_SECTIONS = [
  { href: "#palette", label: "Palette" },
  { href: "#risk-scale", label: "Risk Scale" },
  { href: "#typography", label: "Typography" },
  { href: "#logo", label: "Logo" },
  { href: "#graphics", label: "Ribbon & Voice" },
] as const;

export function BrandHero({ tokens }: { tokens: BrandTokensSpec }) {
  return (
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
            {NAV_SECTIONS.map((item) => (
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
  );
}
