"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { BrandRibbon } from "@/components/brand/BrandRibbon";
import type { City } from "@/lib/api/client";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface DashboardHeaderProps {
  selectedCity: City;
  isDemoMode: boolean;
  weatherBadgeText: string;
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
}

export function DashboardHeader({
  selectedCity,
  isDemoMode,
  weatherBadgeText,
  lang,
  onChangeLang,
}: DashboardHeaderProps) {
  const copy = UI_COPY[lang];

  return (
    <header className="no-print relative overflow-hidden bg-ink text-white">
      <BrandRibbon variant="strip" surface="ink" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <AbhasLogo
            variant="reverse"
            size="sm"
            showBangla
            city={selectedCity}
          />
          <div className="border-l border-white/20 pl-3 sm:pl-4">
            <h1
              data-testid="header-heading"
              lang={lang}
              className={clsx(
                "text-sm font-semibold text-white",
                lang === "bn" ? "font-bangla" : "font-sans",
              )}
            >
              {copy.appHeading}
            </h1>
            <p
              data-testid="header-promise"
              lang={lang}
              className={clsx(
                "text-xs text-mist",
                lang === "bn" ? "font-bangla" : "font-sans",
              )}
            >
              {copy.productPromise}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDemoMode ? (
            <span
              data-testid="demo-mode-badge"
              lang={lang}
              className={clsx(
                "inline-flex items-center rounded-sm border border-white/25 bg-navy px-2.5 py-1 text-xs font-semibold text-white",
                lang === "bn" ? "font-bangla" : "font-mono",
              )}
            >
              {copy.demoBadge}
            </span>
          ) : null}

          <span
            data-testid="weather-source-badge"
            lang={lang}
            className={clsx(
              "inline-flex items-center rounded-sm border border-white/20 bg-navy/80 px-2.5 py-1 text-xs text-mist",
              lang === "bn" ? "font-bangla" : "font-mono",
            )}
          >
            {weatherBadgeText}
          </span>

          {/* EN / BN language switcher */}
          <div
            data-testid="lang-toggle"
            role="group"
            aria-label="Interface language"
            className="inline-flex min-h-9 items-center rounded-md border border-white/25 bg-navy p-0.5"
          >
            <button
              type="button"
              data-testid="lang-btn-en"
              aria-pressed={lang === "en"}
              onClick={() => onChangeLang("en")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-sm px-2.5 font-mono text-xs font-semibold",
                lang === "en"
                  ? "bg-royal text-white"
                  : "text-mist hover:text-white",
              )}
            >
              EN
            </button>
            <button
              type="button"
              data-testid="lang-btn-bn"
              aria-pressed={lang === "bn"}
              lang="bn"
              onClick={() => onChangeLang("bn")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-sm px-2.5 font-bangla text-xs font-semibold",
                lang === "bn"
                  ? "bg-royal text-white"
                  : "text-mist hover:text-white",
              )}
            >
              বাংলা
            </button>
          </div>

          <Link
            href="/brand"
            data-testid="nav-brand-link"
            lang={lang}
            className={clsx(
              "inline-flex min-h-9 items-center rounded-md border border-white/25 bg-navy px-3 text-xs font-semibold text-white hover:bg-royal",
              lang === "bn" && "font-bangla",
            )}
          >
            {copy.brandLink}
          </Link>
        </div>
      </div>
    </header>
  );
}
