import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";

// Figures from ARCHITECTURE.md §4–5 (measured on the shipped artifact).
const COSTS = [
  { term: "Weather", value: "4 calls a day", note: "Five city centroids batched into one Open-Meteo request, cached for 6 hours." },
  { term: "Forecast", value: "0.59 ms per ward", note: "A 954 KiB model loaded once on the CPU. No GPU needed to serve." },
  { term: "Advice text", value: "$1 a day, at most", note: "Optional Claude Haiku advisory with a hard daily cap; a free template without a key." },
] as const;

export function CostSection() {
  return (
    <section aria-labelledby="cost-heading" className="bg-paper px-4 py-24 text-ink sm:px-8 lg:px-14">
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
              <dt className="font-mono text-xs text-slate sm:pt-1.5">{cost.term}</dt>
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
          Sign in to open the dashboard: ward forecasts, the rain-lag view, what-if rain scenarios and this
          week&apos;s priority list.
        </p>
        <Link
          href="/dashboard?demo=1"
          data-testid="closing-cta"
          className="group mt-10 inline-flex min-h-12 items-center gap-2 rounded-md bg-lime px-6 text-base font-bold text-ink transition-transform duration-200 hover:-translate-y-0.5"
        >
          Open the dashboard
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-ink px-4 py-10 text-sm text-mist sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <p className="max-w-xl leading-6">
          Abhas (<span lang="bn" className="font-bangla">আভাস</span>) · dengue early warning, ward by ward. Data:
          organisers&apos; ward dataset 2016–2025. Weather by Open-Meteo.com (CC BY 4.0). Map tiles © OpenStreetMap
          contributors © CARTO. Sign-in by Clerk. AI assistants used to build it are listed in the README.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li><Link href="/dashboard" className="font-semibold text-white hover:underline">Dashboard</Link></li>
            <li><Link href="/brand" className="font-semibold text-white hover:underline">Brand and tier scale</Link></li>
            <li>
              <a
                href="https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white hover:underline"
              >
                Source on GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
