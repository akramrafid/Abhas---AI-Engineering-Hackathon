"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { clsx } from "clsx";
import { LogoutConfirmDialog } from "@/components/auth/LogoutConfirmDialog";
import { UserMenu } from "@/components/auth/UserMenu";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import type { City } from "@/lib/api/client";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface DashboardHeaderProps {
  selectedCity: City;
  isDemoMode: boolean;
  weatherBadgeText: string;
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  dark?: boolean;
  onToggleTheme?: () => void;
  onOpenSearch?: () => void;
  alertCount?: number;
  onOpenAlerts?: () => void;
}

/** The dashboard's pill top bar: brand + city edition, search, status badges, language, theme, alerts, account. */
export function DashboardHeader({
  selectedCity,
  isDemoMode,
  weatherBadgeText,
  lang,
  onChangeLang,
  dark = false,
  onToggleTheme,
  onOpenSearch,
  alertCount = 0,
  onOpenAlerts,
}: DashboardHeaderProps) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const copy = UI_COPY[lang];
  const bn = lang === "bn";
  const chip = clsx(
    "inline-flex min-h-9 items-center rounded-full px-3 text-xs ring-1",
    dark ? "bg-white/5 text-mist ring-white/15" : "bg-paper text-slate ring-mist",
  );
  const iconButton = clsx(
    "relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full ring-1 transition-colors duration-300",
    dark ? "text-white ring-white/15 hover:bg-white/10" : "text-navy ring-mist hover:bg-paper",
  );

  return (
    <>
      <header
        className={clsx(
          "no-print sticky top-3 z-40 mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] px-3 py-2 ring-1 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-500 sm:mx-5 lg:rounded-full lg:pl-5",
          dark
            ? "bg-navy/85 text-white ring-white/15 shadow-[0_16px_40px_-10px_rgba(4,8,18,0.7),inset_0_1px_0_rgba(255,255,255,0.22)]"
            : "bg-white/85 text-ink ring-mist/80 shadow-[0_12px_32px_-10px_rgba(11,26,92,0.14),inset_0_1px_0_rgba(255,255,255,0.95)]",
        )}
      >
        <button
          type="button"
          data-testid="dashboard-logo-logout"
          onClick={() => setConfirmLogout(true)}
          title={bn ? "লগআউট করে হোম পেজে যান" : "Log out and return to landing page"}
          className="flex shrink-0 cursor-pointer items-center gap-3 rounded-md text-left transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal"
        >
          <AbhasLogo variant={dark ? "reverse" : "primary"} size="sm" showBangla city={selectedCity} />
          <span className="sr-only">Log out and return to Abhas landing page</span>
        </button>
      <div className={clsx("hidden min-w-0 border-l pl-4 xl:block", dark ? "border-white/15" : "border-mist")}>
        <p data-testid="header-heading" lang={lang} className={clsx("truncate text-sm font-semibold", bn && "font-bangla")}>
          {copy.appHeading}
        </p>
        <p
          data-testid="header-promise"
          lang={lang}
          className={clsx("truncate text-xs", dark ? "text-mist" : "text-slate", bn && "font-bangla")}
        >
          {copy.productPromise}
        </p>
      </div>

      {onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-testid="open-search"
          aria-keyshortcuts="Control+K Meta+K"
          className={clsx(
            "order-last flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-full px-4 text-left text-sm ring-1 transition-colors duration-300 md:order-none md:mx-auto md:w-auto md:min-w-[18rem]",
            dark ? "bg-white/5 text-mist ring-white/15 hover:bg-white/10" : "bg-paper text-slate ring-mist hover:bg-mist/60",
          )}
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          <span className="flex-1">Search wards and views</span>
          <kbd className="font-mono text-[11px]">Ctrl K</kbd>
        </button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {isDemoMode ? (
          <span
            data-testid="demo-mode-badge"
            lang={lang}
            className={clsx(chip, "font-semibold", bn ? "font-bangla" : "", dark ? "text-white" : "text-navy")}
          >
            {copy.demoBadge}
          </span>
        ) : null}
        <span data-testid="weather-source-badge" lang={lang} className={clsx(chip, "max-sm:hidden", bn && "font-bangla")}>
          {weatherBadgeText}
        </span>

        <div
          data-testid="lang-toggle"
          role="group"
          aria-label="Interface language"
          className={clsx("inline-flex min-h-10 items-center rounded-full p-0.5 ring-1", dark ? "ring-white/15" : "ring-mist")}
        >
          {(["en", "bn"] as const).map((code) => (
            <button
              key={code}
              type="button"
              data-testid={`lang-btn-${code}`}
              aria-pressed={lang === code}
              lang={code}
              onClick={() => onChangeLang(code)}
              className={clsx(
                "min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold",
                code === "bn" ? "font-bangla" : "font-sans",
                lang === code ? "bg-royal text-white" : dark ? "text-mist hover:text-white" : "text-slate hover:text-navy",
              )}
            >
              {code === "en" ? "EN" : "বাংলা"}
            </button>
          ))}
        </div>

        {onToggleTheme ? (
          <button
            type="button"
            data-testid="theme-toggle"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            title={dark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={onToggleTheme}
            className={iconButton}
          >
            {dark ? <Sun aria-hidden="true" className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" className="h-[18px] w-[18px]" />}
          </button>
        ) : null}

        {onOpenAlerts ? (
          <button
            type="button"
            data-testid="open-alerts"
            aria-label={`Ward alerts: ${alertCount} wards High or Critical`}
            onClick={onOpenAlerts}
            className={iconButton}
          >
            <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
            {alertCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-royal px-1 font-mono text-[10px] font-semibold text-white tnum">
                {alertCount}
              </span>
            ) : null}
          </button>
        ) : null}

        <Link
          href="/brand"
          data-testid="nav-brand-link"
          lang={lang}
          className={clsx(
            "inline-flex min-h-10 items-center rounded-full px-3.5 text-xs font-semibold ring-1 transition-colors duration-300 max-md:hidden",
            dark ? "text-white ring-white/15 hover:bg-white/10" : "text-navy ring-mist hover:bg-paper",
            bn && "font-bangla",
          )}
        >
          {copy.brandLink}
        </Link>
        <UserMenu />
      </div>
    </header>
    {confirmLogout ? (
      <LogoutConfirmDialog lang={lang} onClose={() => setConfirmLogout(false)} />
    ) : null}
    </>
  );
}
