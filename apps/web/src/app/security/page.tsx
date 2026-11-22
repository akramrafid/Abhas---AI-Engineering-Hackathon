import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Security & Trust",
  description:
    "Zero-PII architecture, SHA-256 LightGBM artifact verification, API hardening, and 30/30 automated AI red-team verification for Abhas.",
  path: "/security",
});

const CONTROLS = [
  {
    name: "Zero patient PII",
    detail: "Only ward-level aggregate dengue counts and weather metrics are stored or processed. No citizen identities or medical records exist in the system.",
  },
  {
    name: "Offline-first & air-gap capable",
    detail: "The FastAPI backend, SQLite database, and 954.6 KiB LightGBM artifact run locally without internet access or external API keys.",
  },
  {
    name: "Model artifact integrity (SHA-256)",
    detail: "Every startup verifies the committed LightGBM artifact against its recorded SHA-256 digest before serving forecasts.",
  },
  {
    name: "API & transport hardening",
    detail: "Streaming 64 KiB request body guard (413 abort without RAM buffering), per-IP sliding-window rate limiting, strict Pydantic extra='forbid', explicit CORS allowlist, and security headers.",
  },
  {
    name: "AI safety & secret isolation",
    detail: "All LLM keys remain strictly server-side (never bundled into client JS), logged output passes regex secret redaction, prompts isolate untrusted user/data blocks, and daily spend caps prevent runaway costs.",
  },
  {
    name: "Automated verification (30/30 red-team)",
    detail: "Our CI security suite executes 30 automated adversarial checks covering prompt injection, XSS, SQL injection, CSV formula injection, SSRF, and auth bypass — 30/30 passing.",
  },
] as const;

export default function SecurityPage() {
  return (
    <PublicPageShell
      title="Security & Trust"
      subtitle="Transparent, testable engineering controls designed for municipal public-health offices — zero invented badges."
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        {CONTROLS.map((c) => (
          <div key={c.name} className="rounded-[14px] border border-mist bg-white p-6">
            <dt className="text-base font-bold text-navy">{c.name}</dt>
            <dd className="mt-2 text-sm leading-6 text-slate">{c.detail}</dd>
          </div>
        ))}
      </dl>
    </PublicPageShell>
  );
}
