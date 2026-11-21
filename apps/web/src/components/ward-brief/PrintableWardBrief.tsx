"use client";

import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import type { HorizonForecast, Ward, WardForecast } from "@/lib/api/client";
import { deriveSuggestedActions } from "@/lib/actions";
import { computeActByDate, getIsoWeekInfo } from "@/lib/dates";
import { formatDriverLabel, type Lang } from "@/lib/i18n";

export interface PrintableWardBriefProps {
  forecast: WardForecast;
  wardMeta?: Ward;
  originWeek: string;
  modelVersion: string;
  lang: Lang;
  alwaysVisible?: boolean;
}

const TIER_RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 } as const;

function pickPeak(horizons: readonly HorizonForecast[]): HorizonForecast | null {
  if (horizons.length === 0) return null;
  return horizons.reduce((best, cur) => {
    const diff = TIER_RANK[cur.tier] - TIER_RANK[best.tier];
    if (diff !== 0) return diff > 0 ? cur : best;
    return cur.expected_cases > best.expected_cases ? cur : best;
  }, horizons[0]);
}

export function PrintableWardBrief({
  forecast,
  wardMeta,
  originWeek,
  modelVersion,
  lang,
  alwaysVisible = false,
}: PrintableWardBriefProps) {
  const peak = pickPeak(forecast.horizons);
  if (!peak) return null;

  const originInfo = getIsoWeekInfo(originWeek);
  const actBy = computeActByDate(peak.target_week, originWeek);
  const actions = deriveSuggestedActions(forecast.peak_tier, peak.drivers, lang);

  return (
    <article
      data-testid="printable-ward-brief"
      aria-label={`Printable one-page ward brief for ${forecast.ward_id}`}
      className={
        alwaysVisible
          ? "print-break-avoid rounded-lg border border-mist bg-white p-5 text-ink"
          : "print-only print-break-avoid rounded-lg border border-mist bg-white p-6 text-ink"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist pb-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-slate">
            ABHAS · Ward Early-Warning Brief
          </p>
          <h2 className="mt-0.5 font-mono text-xl font-bold text-navy tnum">
            {forecast.ward_id} — {forecast.city}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate tnum">
            Origin: {originInfo ? `${originInfo.shortLabel} (${originWeek})` : originWeek} · Model {modelVersion}
          </p>
        </div>
        <RiskTierBadge tier={forecast.peak_tier} size="md" showAction lang={lang} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-md border border-mist bg-paper p-3">
          <p className="font-semibold text-slate">Peak expected (+{peak.horizon}w)</p>
          <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
            {peak.expected_cases.toFixed(1)} cases
          </p>
          <p className="font-mono text-slate tnum">
            80% band: {peak.p10.toFixed(1)}–{peak.p90.toFixed(1)}
          </p>
        </div>
        <div className="rounded-md border border-mist bg-paper p-3">
          <p className="font-semibold text-slate">Act by (larviciding window)</p>
          <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
            {actBy.displayDate}
          </p>
          <p className="font-mono text-slate tnum">
            Peak week: {peak.target_week}
          </p>
        </div>
        <div className="rounded-md border border-mist bg-paper p-3">
          <p className="font-semibold text-slate">Risk score</p>
          <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
            {peak.risk_score} / 100
          </p>
          <p className="text-slate">P(cases ≥ High cut-off)</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-navy">
            Horizon outlook
          </h3>
          <table className="mt-2 w-full border-collapse text-left font-mono text-xs tnum">
            <thead>
              <tr className="border-b border-mist text-slate">
                <th className="py-1 pr-2">Horizon</th>
                <th className="py-1 pr-2">Week</th>
                <th className="py-1 pr-2 text-right">Cases (80%)</th>
                <th className="py-1 text-right">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {forecast.horizons.map((h) => (
                <tr key={h.horizon}>
                  <td className="py-1 pr-2 font-semibold text-navy">+{h.horizon}w</td>
                  <td className="py-1 pr-2 text-ink">{h.target_week}</td>
                  <td className="py-1 pr-2 text-right text-ink">
                    {h.expected_cases.toFixed(1)} ({h.p10.toFixed(1)}–{h.p90.toFixed(1)})
                  </td>
                  <td className="py-1 text-right font-semibold text-navy">{h.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-navy">
            Top SHAP drivers (+{peak.horizon}w)
          </h3>
          <ul className="mt-2 space-y-1 text-xs">
            {peak.drivers.slice(0, 4).map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-2">
                <span className="text-ink">{formatDriverLabel(d, lang)}</span>
                <span className="font-mono font-semibold text-navy tnum">
                  {d.effect_pct > 0 ? "+" : ""}
                  {Math.round(d.effect_pct)}%
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-navy">
            Suggested field actions
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-ink">
            {actions.map((a) => (
              <li key={a.id}>{a.label}</li>
            ))}
          </ul>
        </div>
      </div>

      {wardMeta ? (
        <p className="mt-4 border-t border-mist pt-2 font-mono text-[11px] text-slate tnum">
          Ward profile: Water-logging {wardMeta.water_logging_risk_index.toFixed(2)} · Density{" "}
          {Math.round(wardMeta.population_density_sqkm).toLocaleString()}/km² · Sanitation{" "}
          {wardMeta.sanitation_score.toFixed(2)} · Weather data by Open-Meteo.com (CC BY 4.0) · Not
          validated on live DGHS surveillance.
        </p>
      ) : null}
    </article>
  );
}
