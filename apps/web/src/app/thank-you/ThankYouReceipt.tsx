"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck } from "@/components/icons";

export function ThankYouReceipt() {
  const params = useSearchParams();
  const ref = params.get("ref")?.trim();
  const org = params.get("org")?.trim();
  const name = params.get("name")?.trim();

  return (
    <div className="rounded-[16px] border border-mist bg-white p-6 sm:p-10">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-royal/10 text-royal ring-1 ring-royal/25">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-navy sm:text-2xl">
            {name ? `Thank you, ${name}.` : "Thank you for reaching out."}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-7 text-slate">
            Your municipal pilot inquiry has been logged. Our team reviews requests for Bangladesh city corporations,
            health offices, and public-health research desks within one working day.
          </p>
        </div>
      </div>

      {ref || org ? (
        <dl className="mt-6 grid gap-4 rounded-xl border border-mist bg-paper p-4 text-xs sm:grid-cols-2">
          {ref ? (
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate">Reference ID</dt>
              <dd className="mt-1 font-mono text-base font-bold text-navy tnum">{ref}</dd>
            </div>
          ) : null}
          {org ? (
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate">City / Organization</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{org}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-6 flex items-center gap-2 rounded-xl border border-mist bg-paper/60 px-4 py-3 text-xs text-slate">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-royal" />
        <span>
          Zero software license fees. While you wait, you can inspect all 60 wards in the live operations console.
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard?demo=1"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy"
        >
          Open live dashboard
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-mist bg-paper px-5 text-sm font-semibold text-navy transition-colors hover:border-royal/50 hover:bg-white"
        >
          Return to homepage
        </Link>
        <Link
          href="/docs"
          className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-slate hover:text-navy hover:underline"
        >
          Technical docs
        </Link>
      </div>
    </div>
  );
}
