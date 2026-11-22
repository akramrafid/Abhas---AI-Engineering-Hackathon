"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";

const LINKS = [
  { href: "#rain-clock", label: "Product tour" },
  { href: "#how", label: "How it works" },
  { href: "#outputs", label: "What officers get" },
  { href: "#proof", label: "Evidence" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Transparent over the hero, then a solid Ink bar with a hairline once the page scrolls. */
export function SiteNav({ actions }: { actions: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-40 border-b transition-colors duration-500",
        isScrolled || mobileMenuOpen
          ? "border-white/10 bg-ink"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="rounded-md focus:outline-none focus:ring-2 focus:ring-royal">
          <AbhasLogo variant="reverse" size="sm" showBangla />
          <span className="sr-only">home</span>
        </Link>

        {/* Desktop nav links */}
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-mist transition-colors duration-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-royal"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {actions}

          {/* Mobile hamburger button */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-mist hover:text-white focus:outline-none focus:ring-2 focus:ring-royal lg:hidden"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileMenuOpen ? (
        <nav
          aria-label="Mobile Navigation"
          className="border-b border-white/10 bg-ink px-4 py-4 lg:hidden"
        >
          <ul className="flex flex-col space-y-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-base font-medium text-mist transition-colors hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
