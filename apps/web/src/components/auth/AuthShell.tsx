import type { ReactNode } from "react";
import Link from "next/link";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { BrandRibbon } from "@/components/brand/BrandRibbon";

export interface AuthShellProps {
  title: string;
  lede: string;
  children: ReactNode;
}

/** Ink split screen: the promise on the ribbon side, Clerk's card on the other. */
export function AuthShell({ title, lede, children }: AuthShellProps) {
  return (
    <div className="grid min-h-screen bg-ink text-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative isolate flex flex-col justify-between overflow-hidden px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
        <BrandRibbon variant="hero" surface="ink" className="-z-10" />
        <Link href="/" className="w-fit rounded-md">
          <AbhasLogo variant="reverse" size="md" showBangla />
          <span className="sr-only">home</span>
        </Link>
        <div className="my-14 max-w-md lg:my-0">
          <h1 className="text-balance text-4xl font-light leading-tight tracking-[-0.02em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-sm text-body text-mist">{lede}</p>
          <p lang="bn" className="mt-6 font-bangla text-sm text-mist/80">
            আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।
          </p>
        </div>
        <p className="font-mono text-xs text-mist/70">
          60 wards · 5 city corporations · forecasts 1 to 4 weeks ahead
        </p>
      </section>
      <main className="flex items-center justify-center bg-paper px-4 py-12 text-ink sm:px-8">
        {children}
      </main>
    </div>
  );
}
