"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CloudRain, Moon, Search, ShieldCheck, Sun } from "@/components/icons";
import { clsx } from "clsx";
import { LogoutConfirmDialog } from "@/components/auth/LogoutConfirmDialog";
import { UserMenu } from "@/components/auth/UserMenu";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import type { City, WeatherMode } from "@/lib/api/client";
import { UI_COPY, type Lang } from "@/lib/i18n";
import { useConnectivity } from "@/lib/useConnectivity";

export interface DashboardHeaderProps {
  selectedCity: City;
  isDemoMode: boolean;
  apiOffline?: boolean;
  weatherMode?: WeatherMode;
  onChangeWeatherMode?: (mode: WeatherMode) => void;
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
  apiOffline = false,
  weatherMode = "dataset",
  onChangeWeatherMode,
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
  const connectivity = useConnectivity(apiOffline);
  const offlineWeatherTooltip = bn ? "অফলাইন — ডেটাসেট আবহাওয়া" : "Offline — dataset weather";
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
          "no-print sticky top-2.5 z-40 mx-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-2 ring-1 backdrop-blur-xl transition-colors duration-200 sm:mx-5 lg:px-4",
          dark
            ? "bg-navy/92 text-white ring-white/15"
            : "bg-white/94 text-ink ring-mist/90",
        )}
      >
        <button
          type="button"
          data-testid="dashboard-logo-logout"
          onClick={() => setConfirmLogout(true)}
          title={bn ? "লগআউট করে হোম পেজে যান" : "Log out and return to landing page"}
          className="flex shrink-0 cursor-pointer items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal"
        >
          <AbhasLogo variant={dark ? "reverse" : "primary"} size="sm" showBangla city={selectedCity} />
          <span className="sr-only">Log out and return to Abhas landing page</span>
        </button>
      <div className={clsx("hidden min-w-0 border-l pl-3.5 2xl:block", dark ? "border-white/15" : "border-mist")}>
        <p data-testid="header-heading" lang={lang} className={clsx("truncate text-[13px] font-semibold leading-tight", bn && "font-bangla")}>
          {copy.appHeading}
        </p>
        <p
          data-testid="header-promise"
          lang={lang}
          className={clsx("truncate text-[11px] leading-tight mt-0.5", dark ? "text-mist" : "text-slate", bn && "font-bangla")}
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
            "order-last flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-xs font-medium ring-1 transition-colors duration-150 md:order-none md:w-56 lg:w-64",
            dark
              ? "bg-white/6 text-mist ring-white/15 hover:bg-white/12 hover:text-white"
              : "bg-paper/90 text-slate ring-mist hover:bg-white hover:text-navy hover:ring-royal/40",
          )}
        >
          <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className={clsx("flex-1 truncate", bn && "font-bangla")}>
            {bn ? "ওয়ার্ড ও ভিউ খুঁজুন" : "Search wards and views"}
          </span>
          <kbd className={clsx("rounded px-1.5 py-0.5 font-mono text-[10px] ring-1", dark ? "bg-white/10 text-mist ring-white/15" : "bg-white text-slate ring-mist")}>
            Ctrl K
          </kbd>
        </button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {isDemoMode ? (
          <span
            data-testid="demo-mode-badge"
            lang={lang}
            className={clsx(chip, "font-semibold", bn ? "font-bangla" : "", dark ? "text-white" : "text-navy")}
          >
            {copy.demoBadge}
          </span>
        ) : null}
        <span
          data-testid={connectivity.isOffline ? "header-offline-badge" : "header-connectivity-badge"}
          lang={lang}
          className={clsx(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1",
            bn && "font-bangla",
            connectivity.isOffline
              ? "bg-ink text-white ring-ink"
              : dark
                ? "bg-white/5 text-white ring-white/15"
                : "bg-paper text-navy ring-mist",
          )}
        >
          <ShieldCheck
            aria-hidden="true"
            className={clsx("h-3.5 w-3.5", connectivity.isOffline ? "text-white" : "text-royal")}
          />
          <span>{connectivity.label(lang)}</span>
        </span>
        {onChangeWeatherMode ? (
          <div
            data-testid="weather-source-badge"
            role="group"
            aria-label="Weather data source"
            title={connectivity.isOffline ? offlineWeatherTooltip : weatherBadgeText}
            className={clsx(
              "inline-flex min-h-9 items-center rounded-full p-0.5 ring-1 sm:min-h-10",
              dark ? "bg-white/5 ring-white/15" : "bg-paper ring-mist",
            )}
          >
            <button
              type="button"
              data-testid="weather-mode-dataset"
              aria-pressed={weatherMode === "dataset" || connectivity.isOffline}
              onClick={() => onChangeWeatherMode("dataset")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-full px-2.5 text-[11px] font-semibold transition-colors sm:min-h-9 sm:px-3 sm:text-xs",
                bn && "font-bangla",
                weatherMode === "dataset" || connectivity.isOffline
                  ? "bg-navy text-white"
                  : dark
                    ? "text-mist hover:text-white"
                    : "text-slate hover:text-navy",
              )}
            >
              {bn ? "ডেটাসেট" : (
                <>
                  Dataset<span className="sr-only"> mode</span>
                </>
              )}
            </button>
            <button
              type="button"
              data-testid="weather-mode-live"
              disabled={connectivity.isOffline}
              aria-pressed={weatherMode === "live" && !connectivity.isOffline}
              title={connectivity.isOffline ? offlineWeatherTooltip : weatherBadgeText}
              onClick={() => {
                if (!connectivity.isOffline) onChangeWeatherMode("live");
              }}
              className={clsx(
                "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors sm:min-h-9 sm:gap-1.5 sm:px-3 sm:text-xs",
                bn && "font-bangla",
                connectivity.isOffline
                  ? "cursor-not-allowed text-slate opacity-60"
                  : weatherMode === "live"
                    ? "cursor-pointer bg-royal text-white"
                    : dark
                      ? "cursor-pointer text-mist hover:text-white"
                      : "cursor-pointer text-slate hover:text-navy",
              )}
            >
              <CloudRain aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">{bn ? "লাইভ" : "Live"}</span>
              <span className="hidden sm:inline">{bn ? "লাইভ আবহাওয়া" : "Live Open-Meteo"}</span>
            </button>
          </div>
        ) : (
          <span data-testid="weather-source-badge" lang={lang} className={clsx(chip, "max-sm:hidden", bn && "font-bangla")}>
            {weatherBadgeText}
          </span>
        )}

        <span
          aria-hidden="true"
          className={clsx("mx-0.5 hidden h-5 w-px sm:inline-block", dark ? "bg-white/15" : "bg-mist")}
        />

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
