import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Documentation & API Reference",
  description:
    "Quickstart guide, FastAPI OpenAPI endpoints, LightGBM forecasting methodology, and release changelog for Abhas dengue early warning.",
  path: "/docs",
});

const ENDPOINTS = [
  { method: "GET", path: "/healthz", desc: "Liveness probe (200 OK, no-store)." },
  { method: "GET", path: "/readyz", desc: "Readiness probe verifying SQLite seed and SHA-256 LightGBM artifact." },
  { method: "GET", path: "/api/v1/wards", desc: "Lists all 60 monitored wards across DNCC, DSCC, CCC, GCC, and NCC." },
  { method: "POST", path: "/api/v1/forecast", desc: "1–4 week forecasts with P10–P90 bands, risk tiers, and SHAP drivers." },
  { method: "POST", path: "/api/v1/scenario", desc: "What-if rainfall, temperature, and humidity simulation." },
  { method: "GET", path: "/api/v1/heatmap", desc: "City-wide priority matrix ranked by expected cases and tier." },
  { method: "GET", path: "/api/v1/validation", desc: "Locked 2024–2025 hold-out metrics, coverage, and confusion matrix." },
  { method: "POST", path: "/api/v1/advisory", desc: "Bilingual EN/বাংলা officer briefing (deterministic template or Claude Haiku)." },
  { method: "POST", path: "/api/v1/chat/stream", desc: "Streaming Abhas AI Assistant (Gemini 2.5 Flash + live ward grounding)." },
] as const;

const CHANGELOG = [
  {
    version: "v1.1.2",
    date: "2026-11-22",
    items: [
      "Shipped streaming Abhas AI Assistant (Gemini 2.5 Flash with dual-key failover and live ward forecast grounding).",
      "Upgraded landing navigation to liquid-glassmorphism bar with GSAP smooth scroll and EN/বাংলা language toggle.",
      "Added public documentation, security, live system status, pilot request, privacy, and terms pages.",
    ],
  },
  {
    version: "v1.1.0",
    date: "2026-11-21",
    items: [
      "Trained abhas-lgbm-1.1.2 (954.6 KiB, 0.59 ms/ward CPU) beating seasonal climatology by ~20% on locked 2024–2025 hold-out.",
      "Added bilingual EN/বাংলা Operations Console, Risk Map, Ctrl+K ward search, Alerts dialog, and formula-safe CSV export.",
      "Passed 30/30 automated AI & API red-team tests, 767/767 Schemathesis contract cases, and WCAG 2.2 AA axe checks.",
    ],
  },
] as const;

export default function DocsPage() {
  return (
    <PublicPageShell
      title="Documentation & Help Centre"
      subtitle="Run Abhas locally in under three minutes with zero required API keys, explore the REST API, or inspect release changes."
    >
      <section className="rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Three-minute local quickstart</h2>
        <p className="mt-2 text-sm leading-6 text-slate">
          Abhas runs offline on Windows, macOS, or Linux using Node 22+ and Python 3.12+. Every external key is optional.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-[10px] bg-ink p-4 text-xs leading-6 text-mist">
          <code>{`npm run setup   # installs deps, runs migrations, seeds 60 wards, verifies model\nnpm run dev     # starts FastAPI on :8000 and Next.js on :3000`}</code>
        </pre>
        <p className="mt-4 text-sm text-slate">
          Open <Link href="/dashboard?demo=1" className="font-semibold text-royal hover:underline">/dashboard?demo=1</Link> to
          load the pinned monsoon demo (Dhaka South Ward 4, origin week 2024-08-05).
        </p>
      </section>

      <section className="rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Core API endpoints</h2>
        <p className="mt-2 text-sm text-slate">
          Every endpoint is contract-locked in <code className="font-semibold text-navy">contracts/openapi.json</code> and returns RFC 9457 problem JSON on error.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-mist text-xs text-slate">
                <th className="pb-2.5 pr-4 font-semibold">Method</th>
                <th className="pb-2.5 pr-4 font-semibold">Route</th>
                <th className="pb-2.5 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {ENDPOINTS.map((ep) => (
                <tr key={ep.path}>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-paper px-2 py-0.5 text-xs font-bold text-royal">{ep.method}</span>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-navy">{ep.path}</td>
                  <td className="py-3 text-slate">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="changelog" className="scroll-mt-24 rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Changelog</h2>
        <div className="mt-5 space-y-6 divide-y divide-mist">
          {CHANGELOG.map((rel) => (
            <div key={rel.version} className="pt-5 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-bold text-navy">{rel.version}</h3>
                <span className="text-xs font-medium text-slate tnum">{rel.date}</span>
              </div>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate">
                {rel.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
