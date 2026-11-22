import { AuthControls } from "@/components/auth/AuthControls";
import { Providers } from "@/components/Providers";
import { ClosingCta, CostSection, LandingFooter } from "./components/CostAndClose";
import { Faq } from "./components/Faq";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { IntegrationsAndTrust } from "./components/IntegrationsAndTrust";
import { LiveStrip } from "./components/LiveStrip";
import { Outputs } from "./components/Outputs";
import { PilotSection } from "./components/PilotSection";
import { ProblemSolution } from "./components/ProblemSolution";
import { ProofSection } from "./components/ProofSection";
import { RainClock } from "./components/RainClock";
import { SiteNav } from "./components/SiteNav";
import { TestimonialsSection } from "./components/TestimonialsSection";
import { LandingLangProvider } from "./lang-context";

export function LandingPage() {
  return (
    <LandingLangProvider>
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
            <ProblemSolution />
            <RainClock />
            <HowItWorks />
            <Outputs />
            <ProofSection />
            <IntegrationsAndTrust />
            <TestimonialsSection />
            <PilotSection />
            <CostSection />
            <Faq />
            <ClosingCta />
          </main>
        </Providers>
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
