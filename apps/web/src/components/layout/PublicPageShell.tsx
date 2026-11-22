import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AbhasLogo } from "@/components/brand/AbhasLogo";

export interface PublicPageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Shared high-craft editorial shell for public pages beyond the homepage (/docs, /about, /security, /status, /contact, /privacy, /terms). */
export function PublicPageShell({ title, subtitle, children }: PublicPageShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 text-white backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" className="rounded-md">
            <AbhasLogo variant="reverse" size="sm" showBangla />
            <span className="sr-only">Abhas home</span>
          </Link>
          <nav aria-label="Secondary" className="hidden items-center gap-5 text-sm text-mist md:flex">
            <Link href="/docs" className="transition-colors hover:text-white">Docs</Link>
            <Link href="/security" className="transition-colors hover:text-white">Security</Link>
            <Link href="/status" className="transition-colors hover:text-white">Status</Link>
            <Link href="/about" className="transition-colors hover:text-white">About</Link>
            <Link href="/contact" className="transition-colors hover:text-white">Pilot &amp; Contact</Link>
          </nav>
          <Link
            href="/dashboard?demo=1"
            className="inline-flex min-h-9 items-center rounded-full bg-royal px-4 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-royal sm:text-sm"
          >
            Open dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Abhas home
        </Link>
        <h1 className="mt-5 text-balance text-[clamp(2rem,4vw,3.1rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate sm:text-lg">{subtitle}</p>
        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <footer className="border-t border-mist bg-white px-4 py-8 text-xs text-slate sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <p>
            © 2026 Abhas (<span lang="bn" className="font-bangla">আভাস</span>) · Ward-level dengue early warning.
          </p>
          <nav aria-label="Legal and docs" className="flex flex-wrap gap-4">
            <Link href="/docs" className="font-medium text-navy hover:underline">Docs</Link>
            <Link href="/security" className="font-medium text-navy hover:underline">Security</Link>
            <Link href="/status" className="font-medium text-navy hover:underline">Status</Link>
            <Link href="/privacy" className="font-medium text-navy hover:underline">Privacy</Link>
            <Link href="/terms" className="font-medium text-navy hover:underline">Terms</Link>
            <Link href="/contact" className="font-medium text-navy hover:underline">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
