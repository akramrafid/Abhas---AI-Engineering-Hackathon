"use client";

import Link from "next/link";
import { ArrowRight, CloudRain, Sparkles, Timer } from "@/components/icons";
import { clsx } from "clsx";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";

// Figures from ARCHITECTURE.md §4–5 (measured on the shipped artifact).
const COSTS = [
  {
    icon: CloudRain,
    term: "Weather",
    tag: "Cached 6h · CC BY 4.0",
    value: "4 calls a day",
    note: "Five city centroids batched into one Open-Meteo request, cached for 6 hours.",
  },
  {
    icon: Timer,
    term: "Forecast",
    tag: "CPU-only · 954 KiB",
    value: "0.59 ms per ward",
    note: "A 954 KiB LightGBM model loaded once on the CPU. No GPU or cloud server needed.",
  },
  {
    icon: Sparkles,
    term: "Advice text",
    tag: "Hard cap · Free fallback",
    value: "$1 a day, at most",
    note: "Optional bilingual AI advisory with a strict daily cap; a free offline template works without a key.",
  },
] as const;

const HARDWARE_SPECS = [
  { value: "954 KiB", label: "Model size" },
  { value: "CPU", label: "No GPU needed" },
  { value: "Offline", label: "Zero keys req." },
] as const;

export function CostSection() {
  return (
    <section
      aria-labelledby="cost-heading"
      className="relative overflow-hidden border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(50%_50%_at_80%_0%,rgba(47,91,255,0.045),transparent_72%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div>
          <h2
            id="cost-heading"
            className="text-balance text-[clamp(1.85rem,3.4vw,2.75rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy"
          >
            Runs on a health office laptop.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-slate">
            No servers to rent and no per-forecast fees. The weather source and the language model are optional; the
            forecast works offline from the dataset.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-2.5 rounded-2xl bg-paper/85 p-3 ring-1 ring-mist/90">
            {HARDWARE_SPECS.map((spec) => (
              <div key={spec.label} className="rounded-xl bg-white px-3 py-3 text-center ring-1 ring-mist/75">
                <dt className="text-base font-extrabold tracking-tight text-navy tnum">{spec.value}</dt>
                <dd className="mt-0.5 text-[11px] font-medium text-slate">{spec.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <dl className="space-y-2.5 rounded-[22px] bg-paper/70 p-2.5 ring-1 ring-mist/90">
          {COSTS.map((cost) => {
            const Icon = cost.icon;
            return (
              <div
                key={cost.term}
                className="group rounded-[16px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/85 transition-all duration-200 hover:ring-royal/30 hover:shadow-[0_10px_24px_-14px_rgba(47,91,255,0.16)]"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors duration-200 group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-slate">{cost.term}</dt>
                      <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-mist tnum">
                        {cost.tag}
                      </span>
                    </div>
                    <dd>
                      <p className="mt-1.5 text-xl font-extrabold tracking-tight text-navy tnum">{cost.value}</p>
                      <p className="mt-1 text-sm leading-6 text-slate">{cost.note}</p>
                    </dd>
                  </div>
                </div>
              </div>
            );
          })}
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
