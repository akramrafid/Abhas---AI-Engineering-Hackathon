import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Abhas privacy policy: zero patient PII, zero tracking cookies, and transparent optional third-party services.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <PublicPageShell
      title="Privacy Policy"
      subtitle="Effective 2026. Abhas is designed from the ground up for public-health aggregate data with zero tracking cookies."
    >
      <div className="space-y-6 rounded-[14px] border border-mist bg-white p-6 text-sm leading-7 text-slate sm:p-8">
        <section>
          <h2 className="text-base font-bold text-navy">1. Zero patient personal data</h2>
          <p className="mt-1.5">
            Abhas forecasts weekly aggregate dengue case counts per urban ward. It does not collect, store, or transmit
            patient names, national IDs, addresses, or individual medical records.
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold text-navy">2. No advertising or tracking cookies</h2>
          <p className="mt-1.5">
            This website sets zero third-party advertising or cross-site tracking cookies. Language, theme, and your
            cookie notice preference are stored locally in your browser only. When optional Clerk authentication is
            enabled, strictly necessary session cookies are used solely to sign officers into the dashboard.
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold text-navy">3. Optional external APIs</h2>
          <p className="mt-1.5">
            In offline default mode, zero data leaves your computer. If an operator enables live weather, only the five
            city centroid coordinates are sent to Open-Meteo (CC BY 4.0). If the optional AI assistant or briefing LLM
            is enabled, only aggregate ward forecast summaries and your typed question are sent to Google Gemini or
            Anthropic.
          </p>
        </section>
      </div>
    </PublicPageShell>
  );
}
