import Image from "next/image";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import type { BrandTokensSpec } from "../types";

export function LogoSection({ tokens }: { tokens: BrandTokensSpec }) {
  return (
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
  );
}
