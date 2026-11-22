import { AuthControls } from "@/components/auth/AuthControls";
import { Providers } from "@/components/Providers";
import { ClosingCta, CostSection, LandingFooter } from "./components/CostAndClose";
import { Faq } from "./components/Faq";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { LiveStrip } from "./components/LiveStrip";
import { Outputs } from "./components/Outputs";
import { ProofSection } from "./components/ProofSection";
import { RainClock } from "./components/RainClock";
import { SiteNav } from "./components/SiteNav";

export function LandingPage() {
  return (
    <div className="relative bg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <SiteNav actions={<AuthControls />} />
      <Providers>
        <main id="main">
          <Hero />
          <LiveStrip />
          <RainClock />
          <HowItWorks />
          <Outputs />
          <ProofSection />
          <CostSection />
          <Faq />
          <ClosingCta />
        </main>
      </Providers>
      <LandingFooter />
    </div>
  );
}
