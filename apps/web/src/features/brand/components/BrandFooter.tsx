import Link from "next/link";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import type { BrandTokensSpec } from "../types";

export function BrandFooter({ tokens }: { tokens: BrandTokensSpec }) {
  return (
    <footer className="border-t border-mist bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-slate sm:px-8">
        <div className="flex items-center gap-3">
          <AbhasLogo variant="primary" size="sm" markOnly />
          <span>
            Abhas ({tokens.nameBangla}) · Brand Kit v{tokens.version} · Self-hosted
            Manrope, IBM Plex Mono &amp; Noto Sans Bengali
          </span>
        </div>
        <Link href="/" className="font-semibold text-royal hover:underline">
          Return to Dashboard
        </Link>
      </div>
    </footer>
  );
}
