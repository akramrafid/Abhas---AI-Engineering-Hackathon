import { BrandFooter } from "./components/BrandFooter";
import { BrandHero } from "./components/BrandHero";
import { GraphicsVoiceSection } from "./components/GraphicsVoiceSection";
import { LogoSection } from "./components/LogoSection";
import { PaletteSection } from "./components/PaletteSection";
import { RiskScaleSection } from "./components/RiskScaleSection";
import { TypographySection } from "./components/TypographySection";
import type { BrandTokensSpec } from "./types";

export type { BrandTokenColorEntry, BrandTokensSpec } from "./types";

export function BrandShowcase({ tokens }: { tokens: BrandTokensSpec }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <BrandHero tokens={tokens} />

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-14 sm:px-8">
        <PaletteSection tokens={tokens} />
        <RiskScaleSection tokens={tokens} />
        <TypographySection tokens={tokens} />
        <LogoSection tokens={tokens} />
        <GraphicsVoiceSection tokens={tokens} />
      </main>

      <BrandFooter tokens={tokens} />
    </div>
  );
}
