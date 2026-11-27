"use client";

import { CalendarClock, Info, MapPin, Printer } from "@/components/icons";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { NumberTicker } from "@/components/ui/NumberTicker";
import type {
  ForecastResponse,
  HorizonForecast,
  Ward,
  WardForecast,
} from "@/lib/api/client";
import { computeActByDate, getIsoWeekInfo } from "@/lib/dates";
import type { HorizonWindow } from "@/lib/demo-config";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface PeakTierCardProps {
  response: ForecastResponse;
  selectedForecast: WardForecast;
  peakHorizon: HorizonForecast | null;
  wardMeta?: Ward;
  windowKey: HorizonWindow;
  escalated: boolean;
  lang: Lang;
  onPrintBrief: () => void;
}

export function PeakTierCard({
  response,
  selectedForecast,
  peakHorizon,
  wardMeta,
  windowKey,
  escalated,
  lang,
  onPrintBrief,
}: PeakTierCardProps) {
  const copy = UI_COPY[lang].wardRisk;
  const weatherLabel = UI_COPY[lang].weatherSource[response.weather_source];
  const originInfo = getIsoWeekInfo(response.origin_week);
  const actBy = peakHorizon
    ? computeActByDate(peakHorizon.target_week, response.origin_week)
    : null;
  const windowLabel =
    windowKey === "1w" ? "1w" : windowKey === "2-4w" ? "2–4w" : "1–4w";

  const riskScorePct = peakHorizon ? Math.min(100, Math.max(0, peakHorizon.risk_score)) : 0;
  const bandMarkerPct =
    peakHorizon && peakHorizon.p90 > peakHorizon.p10
      ? Math.min(
          92,
          Math.max(
            8,
            Math.round(
              ((peakHorizon.expected_cases - peakHorizon.p10) /
                (peakHorizon.p90 - peakHorizon.p10)) *
                100,
            ),
          ),
        )
      : 50;

  return (
    <Card
      key={selectedForecast.ward_id}
      data-testid="peak-tier-card"
      className="abhas-ward-enter no-print overflow-hidden"
    >
      <CardHeader className="gap-3 bg-paper/45 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 font-sans text-xl font-extrabold tracking-[-0.02em] text-navy tnum">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-royal/10 text-royal ring-1 ring-royal/15">
                <MapPin aria-hidden="true" className="h-4 w-4" />
              </span>
              {selectedForecast.ward_id}
            </CardTitle>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-mist">
              {selectedForecast.city}
            </span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate ring-1 ring-mist tnum">
              Window {windowLabel}
            </span>
          </div>
          <CardDescription className="text-xs tnum">
            Origin {originInfo ? `${originInfo.shortLabel} (${response.origin_week})` : response.origin_week} ·{" "}
            {weatherLabel} · Model {response.model_version}
            {response.cached ? " · cached" : ""}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <RiskTierBadge
            tier={selectedForecast.peak_tier}
            size="lg"
            showAction
            lang={lang}
            data-testid="peak-tier-badge"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {peakHorizon && actBy ? (
          <div className="grid divide-y divide-mist/80 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
            {/* 1. Peak risk score with 0–100 gauge bar */}
            <div className="flex flex-col justify-between p-4">
              <div>
                <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                  {copy.peakRiskScore}
                </p>
                <p
                  data-testid="peak-risk-score"
                  className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-navy tnum"
                >
                  <NumberTicker value={peakHorizon.risk_score} decimalPlaces={0} />
                  <span className="text-sm font-medium text-slate"> / 100</span>
                </p>
              </div>
              <div className="mt-2.5">
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist/80"
                >
                  <div
                    className="h-full rounded-full bg-navy transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ width: `${riskScorePct}%` }}
                  />
                </div>
                <p className={clsx("mt-1.5 text-[11px] leading-snug text-slate", lang === "bn" && "font-bangla")}>
                  {copy.peakRiskHint}
                </p>
              </div>
            </div>

            {/* 2. Peak expected cases with P10–P90 conformal whisker */}
            <div className="flex flex-col justify-between border-mist/80 p-4 sm:border-l xl:border-l-0">
              <div>
                <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                  {copy.peakExpectedCases} (+{peakHorizon.horizon}w)
                </p>
                <p
                  data-testid="peak-expected-cases"
                  className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-navy tnum"
                >
                  <NumberTicker value={peakHorizon.expected_cases} decimalPlaces={1} />
                </p>
              </div>
              <div className="mt-2.5">
                <div
                  aria-hidden="true"
                  className="relative h-1.5 w-full rounded-full bg-royal/15"
                >
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-royal transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ left: `${bandMarkerPct}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] font-medium text-slate tnum">
                  {copy.bandLabel}: {peakHorizon.p10.toFixed(1)}–{peakHorizon.p90.toFixed(1)} {copy.casesUnit}
                </p>
              </div>
            </div>

            {/* 3. Act-by operational deadline callout (primary focal anchor) */}
            <div className="flex flex-col justify-between border-mist/80 bg-royal/[0.045] p-4 sm:border-t xl:border-t-0">
              <p
                className={clsx(
                  "flex items-center gap-1.5 text-xs font-bold text-royal",
                  lang === "bn" && "font-bangla",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{copy.actByLabel}</span>
              </p>
              <p
                data-testid="peak-act-by"
                className="mt-1.5 font-mono text-xl font-bold tracking-tight text-navy tnum"
              >
                {actBy.displayDate}
              </p>
              <p className={clsx("mt-2 text-[11px] leading-snug text-slate", lang === "bn" && "font-bangla")}>
                {actBy.urgent ? copy.actImmediately : copy.actByHint}
              </p>
            </div>

            {/* 4. Peak target week */}
            <div className="flex flex-col justify-between border-mist/80 p-4 sm:border-l sm:border-t xl:border-l-0 xl:border-t-0">
              <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                {copy.peakTargetWeek}
              </p>
              <p className="mt-1.5 font-mono text-xl font-bold tracking-tight text-navy tnum">
                {peakHorizon.target_week}
              </p>
              <p className="mt-2 font-mono text-[11px] font-semibold text-slate tnum">
                +{peakHorizon.horizon} week{peakHorizon.horizon === 1 ? "" : "s"} after origin
              </p>
            </div>
          </div>
        ) : null}

        {escalated ? (
          <div className={clsx("mx-4 my-3 flex items-start gap-2.5 rounded-xl bg-paper px-3.5 py-2.5 text-xs font-medium text-navy ring-1 ring-risk-medium/70", lang === "bn" && "font-bangla")}>
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
            <p>
              {lang === "bn"
                ? "সর্বোচ্চ ৮০% সীমা (P90) এই ওয়ার্ডের মৌসুমি এন্ডেমিক সীমা অতিক্রম করেছে — ঝুঁকির স্তর +১ ধাপ বাড়ানো হয়েছে।"
                : "Upper 80% bound (P90) exceeds this ward's seasonal endemic threshold — tier escalated by +1 level."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist/80 bg-paper/45 px-4 py-3">
          {wardMeta ? (
            <div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate", lang === "bn" && "font-bangla")}>
              <span className="inline-flex items-center gap-1.5">
                <span>{lang === "bn" ? "জলাবদ্ধতা" : "Water-logging"}</span>
                <strong className="font-mono font-bold text-navy tnum">
                  {wardMeta.water_logging_risk_index.toFixed(2)}
                </strong>
              </span>
              <span aria-hidden="true" className="text-mist">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span>{lang === "bn" ? "জনঘনত্ব" : "Density"}</span>
                <strong className="font-mono font-bold text-navy tnum">
                  {Math.round(wardMeta.population_density_sqkm).toLocaleString()} / km²
                </strong>
              </span>
              <span aria-hidden="true" className="text-mist">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span>{lang === "bn" ? "স্যানিটেশন" : "Sanitation"}</span>
                <strong className="font-mono font-bold text-navy tnum">
                  {wardMeta.sanitation_score.toFixed(2)}
                </strong>
              </span>
            </div>
          ) : (
            <span />
          )}

          <button
            type="button"
            data-testid="print-ward-brief-btn"
            onClick={onPrintBrief}
            className={clsx(
              "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors duration-150 hover:bg-royal hover:text-white hover:ring-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
              lang === "bn" && "font-bangla",
            )}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.printBrief}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
