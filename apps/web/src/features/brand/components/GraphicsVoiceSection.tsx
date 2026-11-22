import { BrandRibbon } from "@/components/brand/BrandRibbon";
import type { BrandTokensSpec } from "../types";

export function GraphicsVoiceSection({ tokens }: { tokens: BrandTokensSpec }) {
  return (
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
  );
}
