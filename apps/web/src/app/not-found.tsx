import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "@/components/icons";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Page Not Found (404)",
  description:
    "The requested page could not be found on Abhas. Return to the ward-level dengue early-warning console, documentation, or homepage.",
  path: "/404",
  noIndex: true,
});

export default function NotFound() {
  return (
    <PublicPageShell
      title="Page not found."
      subtitle="The link you followed does not match any active route on Abhas. Use one of the verified destinations below to continue."
    >
      <div className="rounded-[16px] border border-mist bg-white p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 font-mono text-xs font-bold text-navy ring-1 ring-mist tnum">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
            HTTP 404
          </span>
          <span lang="bn" className="font-bangla text-xs font-medium text-slate">
            পৃষ্ঠাটি পাওয়া যায়নি
          </span>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-7 text-slate">
          If you were looking for a ward forecast, live rainfall lag analysis, or municipal priority list across Dhaka
          North, Dhaka South, Chattogram, Gazipur, or Narayanganj, jump straight into the live operations console.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy"
          >
            Back to homepage
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard?demo=1"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-mist bg-paper px-5 text-sm font-semibold text-navy transition-colors hover:border-royal/50 hover:bg-white"
          >
            Open live dashboard
          </Link>
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-slate hover:text-navy hover:underline"
          >
            Read documentation
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-slate hover:text-navy hover:underline"
          >
            Pilot &amp; contact
          </Link>
        </div>
      </div>
    </PublicPageShell>
  );
}
