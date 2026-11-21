"use client";

import { CalendarClock, Printer } from "lucide-react";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
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

  return (
    <Card data-testid="peak-tier-card" className="no-print">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="font-mono text-lg tnum">
              {selectedForecast.ward_id}
            </CardTitle>
            <span className="rounded-sm bg-paper px-2 py-0.5 text-xs font-medium text-navy">
              {selectedForecast.city}
            </span>
            <span className="rounded-sm border border-mist px-2 py-0.5 font-mono text-xs text-slate tnum">
              Window {windowLabel}
            </span>
          </div>
          <CardDescription className="font-mono text-xs tnum">
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

      <CardContent className="space-y-4">
        {peakHorizon && actBy ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                {copy.peakRiskScore}
              </p>
              <p
                data-testid="peak-risk-score"
                className="mt-1 font-mono text-2xl font-bold text-navy tnum"
              >
                {peakHorizon.risk_score}
                <span className="text-sm font-medium text-slate"> / 100</span>
              </p>
              <p className={clsx("mt-0.5 text-xs text-slate", lang === "bn" && "font-bangla")}>
                {copy.peakRiskHint}
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                {copy.peakExpectedCases} (+{peakHorizon.horizon}w)
              </p>
              <p
                data-testid="peak-expected-cases"
                className="mt-1 font-mono text-2xl font-bold text-navy tnum"
              >
                {peakHorizon.expected_cases.toFixed(1)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate tnum">
                {copy.bandLabel}: {peakHorizon.p10.toFixed(1)}–{peakHorizon.p90.toFixed(1)} {copy.casesUnit}
              </p>
            </div>

            <div className="rounded-md border border-royal/30 bg-paper p-3.5">
              <p
                className={clsx(
                  "flex items-center gap-1.5 text-xs font-semibold text-navy",
                  lang === "bn" && "font-bangla",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                <span>{copy.actByLabel}</span>
              </p>
              <p
                data-testid="peak-act-by"
                className="mt-1 font-mono text-xl font-bold text-navy tnum"
              >
                {actBy.displayDate}
              </p>
              <p className={clsx("mt-0.5 text-xs text-slate", lang === "bn" && "font-bangla")}>
                {actBy.urgent ? copy.actImmediately : copy.actByHint}
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className={clsx("text-xs font-semibold text-slate", lang === "bn" && "font-bangla")}>
                {copy.peakTargetWeek}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                {peakHorizon.target_week}
              </p>
              <p className="mt-0.5 text-xs text-slate">
                +{peakHorizon.horizon} week{peakHorizon.horizon === 1 ? "" : "s"} after origin
              </p>
            </div>
          </div>
        ) : null}

        {escalated ? (
          <p className="rounded-md border border-risk-medium bg-paper px-3 py-2 text-xs font-medium text-ink">
            Upper 80% bound (P90) exceeds this ward&apos;s seasonal endemic threshold — tier escalated by +1 level.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-3">
          {wardMeta ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate">
              <span>
                Water-logging index:{" "}
                <strong className="font-mono text-ink tnum">
                  {wardMeta.water_logging_risk_index.toFixed(2)}
                </strong>
              </span>
              <span>
                Population density:{" "}
                <strong className="font-mono text-ink tnum">
                  {Math.round(wardMeta.population_density_sqkm).toLocaleString()} / km²
                </strong>
              </span>
              <span>
                Sanitation score:{" "}
                <strong className="font-mono text-ink tnum">
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
              "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:bg-paper",
              lang === "bn" && "font-bangla",
            )}
          >
            <Printer className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
            <span>{copy.printBrief}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
