"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
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
        isScrolled ? "border-white/10 bg-ink" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="rounded-md">
          <AbhasLogo variant="reverse" size="sm" showBangla />
          <span className="sr-only">home</span>
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-10 items-center rounded-md px-3 text-sm text-mist transition-colors duration-300 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {actions}
      </div>
    </header>
  );
}
