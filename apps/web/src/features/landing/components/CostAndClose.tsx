"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";

// Figures from ARCHITECTURE.md §4–5 (measured on the shipped artifact).
const COSTS = [
  { term: "Weather", value: "4 calls a day", note: "Five city centroids batched into one Open-Meteo request, cached for 6 hours." },
  { term: "Forecast", value: "0.59 ms per ward", note: "A 954 KiB model loaded once on the CPU. No GPU needed to serve." },
  { term: "Advice text", value: "$1 a day, at most", note: "Optional Claude Haiku advisory with a hard daily cap; a free template without a key." },
] as const;

export function CostSection() {
  return (
    <section aria-labelledby="cost-heading" className="bg-white px-4 py-24 text-ink sm:px-8 lg:px-14">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 id="cost-heading" className="text-balance text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-navy">
            Runs on a health office laptop.
          </h2>
          <p className="mt-4 max-w-md text-body text-slate">
            No servers to rent and no per-forecast fees. The weather source and the language model are optional;
            the forecast works offline from the dataset.
          </p>
        </div>
        <dl className="divide-y divide-mist border-y border-mist">
          {COSTS.map((cost) => (
            <div key={cost.term} className="grid gap-1 py-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold text-slate sm:pt-1">{cost.term}</dt>
              <dd>
                <p className="text-xl font-bold tnum">{cost.value}</p>
                <p className="mt-1 text-sm text-slate">{cost.note}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function ClosingCta() {
  const { lang } = useLandingLang();
  return (
    <section aria-labelledby="close-heading" className="relative isolate overflow-hidden bg-navy px-4 py-32 text-white sm:px-8 lg:px-14">
      <div className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,transparent_20%,black_70%)]">
        <RibbonCanvas className="h-full w-full" from={0.95} to={0.15} period={22} />
      </div>
      <div className="mx-auto max-w-6xl">
        <h2 id="close-heading" className="max-w-2xl text-balance text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
          Pick a ward. See its next four weeks.
        </h2>
        <p className="mt-5 max-w-lg text-lg text-mist">
          Open the live operations console in one click — zero keys required, works offline, ready in Bangla and English.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            href="/dashboard?demo=1"
            data-testid="closing-cta"
            onClick={() => trackEvent({ event: "cta_open_dashboard", location: "closing_cta", lang })}
            className="group inline-flex min-h-12 items-center gap-2 rounded-md bg-lime px-6 text-base font-bold text-ink transition-transform duration-200 hover:-translate-y-0.5"
          >
            Open the dashboard
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/contact"
            className="text-sm font-semibold text-mist underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Or request a municipal pilot
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Operations Dashboard", href: "/dashboard?demo=1" },
      { label: "Risk Map (60 wards)", href: "/dashboard?demo=1&tab=map" },
      { label: "Hold-out Validation", href: "/dashboard?demo=1&tab=validation" },
      { label: "Brand & Tier Scale", href: "/brand" },
      { label: "Changelog", href: "/docs#changelog" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Security & Trust", href: "/security" },
      { label: "System Status", href: "/status" },
      { label: "About & Team", href: "/about" },
    ],
  },
  {
    title: "Connect & Legal",
    links: [
      { label: "Request a Pilot", href: "/contact" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      {
        label: "GitHub Source",
        href: "https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon",
        external: true,
      },
    ],
  },
] as const;

export function LandingFooter() {
  const { lang, setLang } = useLandingLang();

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-ink text-mist">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pt-16 pb-10 sm:px-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="text-lg font-extrabold tracking-tight text-white">
            ABHAS <span lang="bn" className="font-bangla font-semibold text-mist">আভাস</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-mist">
            Ward-level dengue early warning for Bangladesh city corporations. Rain today. Risk in three weeks.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/status"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/30"
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
              System status
            </Link>

            <div
              role="group"
              aria-label="Footer language switch"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] p-0.5"
            >
              {(["en", "bn"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  lang={code}
                  onClick={() => setLang(code)}
                  className={clsx(
                    "cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    code === "bn" && "font-bangla",
                    lang === code ? "bg-royal text-white" : "text-mist hover:text-white",
                  )}
                >
                  {code === "en" ? "English" : "বাংলা"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/75">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((item) => (
                  <li key={item.label}>
                    {"external" in item && item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-mist transition-colors hover:text-white"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm text-mist transition-colors hover:text-white"
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-white/10 px-4 py-6 text-xs text-mist/80 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© 2026 Abhas (আভাস). Organisers&apos; ward dataset 2016–2025 · Weather by Open-Meteo (CC BY 4.0) · Maps © OSM © CARTO.</p>
        <p className="shrink-0">Zero tracking cookies · Zero patient PII</p>
      </div>

      {/* Monumental fading Abhas wordmark */}
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.18em] select-none text-center text-[clamp(80px,22vw,300px)] font-extrabold leading-[0.88] tracking-[-0.04em] text-transparent [background-clip:text] [-webkit-background-clip:text] [background-image:linear-gradient(to_bottom,rgba(255,255,255,0.16),transparent_82%)]"
      >
        ABHAS
      </p>
    </footer>
  );
}
