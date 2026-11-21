import Link from "next/link";
import { AuthControls } from "@/components/auth/AuthControls";
import { AbhasLogo } from "@/components/brand/AbhasLogo";

const LINKS = [
  { href: "#rain-clock", label: "The rain clock" },
  { href: "#proof", label: "Evidence" },
  { href: "#how", label: "How it works" },
] as const;

export function LandingNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="flex items-center justify-between gap-4 bg-gradient-to-b from-ink via-ink/70 to-transparent px-4 py-4 sm:px-8 lg:px-14">
        <Link href="/" className="rounded-md">
          <AbhasLogo variant="reverse" size="sm" showBangla />
          <span className="sr-only">home</span>
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-10 items-center rounded-md px-3 text-sm text-mist transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <AuthControls />
      </div>
    </header>
  );
}
