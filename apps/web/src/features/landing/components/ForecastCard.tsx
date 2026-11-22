"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { wardLabel } from "@/components/ward-map/geo";
import { postForecast } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";

export function useSpotlightForecast() {
  return useQuery({
    queryKey: ["landing-forecast", SPOTLIGHT_WARD, STORM_ORIGIN],
    queryFn: ({ signal }) =>
      postForecast({ ward_ids: [SPOTLIGHT_WARD], origin_week: STORM_ORIGIN, horizons: [3], source: "dataset" }, signal),
    staleTime: Infinity,
  });
}

/**
 * The dashboard ward card from the brand guidelines (p.15), filled with the live model output for
 * Ward 4, Dhaka South: tier with meter, expected cases with the 80% range, and the top drivers.
 */
export function ForecastCard({ className }: { className?: string }) {
  const forecast = useSpotlightForecast();
  const h = forecast.data?.forecasts[0]?.horizons[0];
  const drivers = (h?.drivers ?? []).slice(0, 3);
  const maxEffect = Math.max(...drivers.map((d) => Math.abs(d.effect_pct)), 1);

  return (
    <article
      data-testid="landing-forecast-card"
      className={clsx("rounded-[14px] bg-white p-5 text-ink ring-1 ring-mist", className)}
      aria-busy={forecast.isPending}
    >
      <header>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-navy">{wardLabel(SPOTLIGHT_WARD)}</h3>
          {h ? <RiskTierBadge tier={h.tier} size="sm" /> : null}
        </div>
        <p className="mt-1 text-sm text-slate">
          Dhaka South · 3 weeks ahead
          {h ? <span className="font-mono tnum"> · {formatShortDate(h.target_week)}</span> : null}
        </p>
      </header>

      {forecast.isError ? (
        <p role="alert" className="mt-6 text-sm text-slate">
          Forecast unavailable: start the API with <code className="font-mono">npm run dev</code>.
        </p>
      ) : (
        <>
          <p className="mt-5 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-semibold leading-none text-navy tnum">
              {h ? h.expected_cases.toFixed(1) : "…"}
            </span>
            <span className="text-sm text-slate">
              expected cases · range{" "}
              <span className="whitespace-nowrap font-mono font-semibold text-ink tnum">
                {h ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "…"}
              </span>
            </span>
          </p>
          <ul className="mt-5 space-y-2.5" aria-label="Main drivers">
            {drivers.map((driver) => (
              <li key={driver.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3.75rem] items-center gap-3 text-sm">
                <span>{driver.label}</span>
                <span aria-hidden="true" className="h-2 rounded-full bg-paper">
                  <span
                    className="block h-full rounded-full bg-navy"
                    style={{ width: `${(Math.abs(driver.effect_pct) / maxEffect) * 100}%` }}
                  />
                </span>
                <span className="text-right font-mono text-navy tnum">
                  {driver.direction === "down" ? "−" : "+"}
                  {Math.round(Math.abs(driver.effect_pct))} %
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-5 text-xs text-slate">Live model output · forecast made {formatShortDate(STORM_ORIGIN)}</p>
    </article>
  );
}
