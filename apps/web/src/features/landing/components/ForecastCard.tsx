"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import { postForecast } from "@/lib/api/client";
import { formatShortDate } from "@/lib/dates";
import { formatDriverLabel } from "@/lib/i18n";
import { useLandingLang } from "../lang-context";
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
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const forecast = useSpotlightForecast();
  const h = forecast.data?.forecasts[0]?.horizons[0];
  const drivers = (h?.drivers ?? []).slice(0, 3);
  const maxEffect = Math.max(...drivers.map((d) => Math.abs(d.effect_pct)), 1);

  return (
    <article
      data-testid="landing-forecast-card"
      lang={lang}
      className={clsx("rounded-[14px] bg-white p-5 text-ink ring-1 ring-mist", className)}
      aria-busy={forecast.isPending}
    >
      <header>
        <div className="flex items-center justify-between gap-3">
          <h3 className={clsx("text-lg font-bold text-navy", bn && "font-bangla")}>
            {bn ? `ওয়ার্ড ${wardNumber(SPOTLIGHT_WARD)}` : wardLabel(SPOTLIGHT_WARD)}
          </h3>
          {h ? <RiskTierBadge tier={h.tier} size="sm" lang={lang} /> : null}
        </div>
        <p className={clsx("mt-1 text-sm text-slate", bn && "font-bangla")}>
          {bn ? "ঢাকা দক্ষিণ · ৩ সপ্তাহ আগে" : "Dhaka South · 3 weeks ahead"}
          {h ? <span className="tnum"> · {formatShortDate(h.target_week)}</span> : null}
        </p>
      </header>

      {forecast.isError ? (
        <p role="alert" className={clsx("mt-6 text-sm text-slate", bn && "font-bangla")}>
          {bn
            ? "পূর্বাভাস পাওয়া যাচ্ছে না: npm run dev দিয়ে এপিআই চালু করুন।"
            : "Forecast unavailable: start the API with npm run dev."}
        </p>
      ) : (
        <>
          <p className="mt-5 flex items-baseline gap-2">
            <span className="text-5xl font-bold leading-none text-navy tnum">
              {h ? h.expected_cases.toFixed(1) : "…"}
            </span>
            <span className={clsx("text-sm text-slate", bn && "font-bangla")}>
              {bn ? "প্রত্যাশিত রোগী · পরিসর " : "expected cases · range "}
              <span className="whitespace-nowrap font-semibold text-ink tnum">
                {h ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "…"}
              </span>
            </span>
          </p>
          <ul className="mt-5 space-y-2.5" aria-label={bn ? "প্রধান কারণসমূহ" : "Main drivers"}>
            {drivers.map((driver) => (
              <li key={driver.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3.25rem] items-center gap-2.5 text-xs sm:grid-cols-[8.5rem_minmax(0,1fr)_3.75rem] sm:gap-3 sm:text-sm">
                <span className={bn ? "font-bangla" : undefined}>{formatDriverLabel(driver, lang)}</span>
                <span aria-hidden="true" className="h-2 rounded-full bg-paper">
                  <span
                    className="block h-full rounded-full bg-navy"
                    style={{ width: `${(Math.abs(driver.effect_pct) / maxEffect) * 100}%` }}
                  />
                </span>
                <span className="text-right font-semibold text-navy tnum">
                  {driver.direction === "down" ? "−" : "+"}
                  {Math.round(Math.abs(driver.effect_pct))}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={clsx("mt-5 text-xs text-slate", bn && "font-bangla")}>
        {bn ? "লাইভ মডেল ফলাফল · পূর্বাভাসের তারিখ " : "Live model output · forecast made "}
        <span className="tnum">{formatShortDate(STORM_ORIGIN)}</span>
      </p>
    </article>
  );
}
