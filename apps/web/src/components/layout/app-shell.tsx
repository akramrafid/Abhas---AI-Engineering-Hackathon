"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/lib/api/client";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers";
import {
  BookOpen,
  Layers,
  Menu,
  MessageSquareText,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Ask",
    description: "Grounded KB chat",
    icon: MessageSquareText,
    testId: "nav-ask",
  },
  {
    href: "/triage",
    label: "Triage",
    description: "Ticket intake & reply",
    icon: ShieldCheck,
    testId: "nav-triage",
  },
  {
    href: "/batch",
    label: "Batch",
    description: "16-ticket accuracy",
    icon: Layers,
    testId: "nav-batch",
  },
  {
    href: "/kb",
    label: "Knowledge base",
    description: "Docs & re-indexing",
    icon: BookOpen,
    testId: "nav-kb",
  },
] as const;

function LumaBrandMark() {
  return (
    <svg
      viewBox="0 0 28 28"
      className="h-7 w-7 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="7" className="fill-accent" />
      <path
        d="M8.5 8.5V19.5H19.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="10.5" r="2.75" fill="white" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const healthQuery = useQuery({
    queryKey: ["api", "healthz"],
    queryFn: getHealth,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  const navContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 px-1">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LumaBrandMark />
            <div className="min-w-0">
              <span
                translate="no"
                className="block text-base font-bold tracking-tight text-ink"
              >
                LumaDesk
              </span>
              <span className="block text-xs text-ink-muted">
                LumaNet Fiber Support
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Primary navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive
                    ? "bg-accent-soft text-accent font-semibold ring-1 ring-accent-border"
                    : "text-ink-secondary hover:bg-subtle hover:text-ink",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-accent"
                      : "text-ink-muted group-hover:text-ink",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate leading-tight">{item.label}</div>
                  <div className="truncate text-[11px] font-normal text-ink-muted">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2.5 border-t border-border-subtle pt-4">
        <div
          className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs"
          title={`API target: ${env.NEXT_PUBLIC_API_URL}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                healthQuery.isPending
                  ? "bg-slate-400 animate-pulse"
                  : healthQuery.isError
                    ? "bg-red-500"
                    : "bg-emerald-500",
              )}
              aria-hidden="true"
            />
            <span className="truncate font-medium text-ink-secondary">
              {healthQuery.isPending
                ? "Checking API…"
                : healthQuery.isError
                  ? "API offline"
                  : "API connected"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void healthQuery.refetch()}
            aria-label="Recheck API health"
            className="rounded p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                healthQuery.isFetching && "animate-spin",
              )}
              aria-hidden="true"
            />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          aria-label="Toggle color theme"
          className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="dark:hidden">Light theme</span>
          <span className="hidden dark:inline">Dark theme</span>
          <Sun className="h-4 w-4 text-amber-500 dark:hidden" aria-hidden="true" />
          <Moon className="hidden h-4 w-4 text-sky-400 dark:block" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border-subtle bg-surface/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <LumaBrandMark />
          <span translate="no" className="text-base font-bold text-ink">
            LumaDesk
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="rounded-lg border border-border-subtle p-2 text-ink-secondary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Sun className="h-4 w-4 text-amber-500 dark:hidden" aria-hidden="true" />
            <Moon className="hidden h-4 w-4 text-sky-400 dark:block" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            className="rounded-lg border border-border-subtle p-2 text-ink-secondary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-50 flex bg-slate-950/50 backdrop-blur-[1px] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <div className="h-full w-68 max-w-[85vw] overscroll-contain border-r border-border-subtle bg-subtle shadow-xl">
            {navContent}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen md:min-h-screen">
        {/* Desktop left sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border-subtle bg-subtle/75 md:sticky md:top-0 md:block md:h-screen">
          {navContent}
        </aside>

        {/* Main workspace */}
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
