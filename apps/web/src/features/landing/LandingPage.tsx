import { Providers } from "@/components/Providers";
import { ClosingCta, CostSection, LandingFooter } from "./components/CostAndClose";
import { HeroPanel } from "./components/HeroPanel";
import { HowItWorks } from "./components/HowItWorks";
import { LandingNav } from "./components/LandingNav";
import { ProofSection } from "./components/ProofSection";
import { RainClock } from "./components/RainClock";

export function LandingPage() {
  return (
    <div className="relative bg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <LandingNav />
      <Providers>
        <main id="main">
          <RainClock hero={<HeroPanel />} />
          <ProofSection />
          <HowItWorks />
          <CostSection />
          <ClosingCta />
        </main>
      </Providers>
      <LandingFooter />
    </div>
  );
}
