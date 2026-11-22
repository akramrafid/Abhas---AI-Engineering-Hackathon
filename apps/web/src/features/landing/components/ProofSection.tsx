"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { wardLabel } from "@/components/ward-map/geo";
import { fetchValidation, fetchWardHistory, type MetricRow } from "@/lib/api/client";
import { addDaysIso, formatShortDate } from "@/lib/dates";
import { SPOTLIGHT_WARD, STORM_ORIGIN } from "../rain-clock-steps";

/**
 * Deseasonalised correlation of weekly cases with rain k weeks earlier, all 60 wards, 2016–2025
 * (data spike recorded in TASK.md "Measured facts about the dataset").
 */
const LAG_CORRELATION = [
  { k: "0", r: 0.03 },
  { k: "1", r: 0.07 },
  { k: "2", r: 0.23 },
  { k: "3", r: 0.47 },
  { k: "4", r: 0.33 },
  { k: "5+", r: 0 },
] as const;

const HISTORY_START = "2024-06-24";
const HISTORY_END = "2024-09-23";
const HOLDOUT = "holdout_2024_2025";

export function ProofSection() {
  return (
    <section id="proof" aria-labelledby="proof-heading" className="bg-paper px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        <h2 id="proof-heading" className="max-w-3xl text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy">
          The lag is in the data. The model is checked on years it never saw.
        </h2>
        <div className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <LagBars />
          <SpotlightChart />
        </div>
        <HoldoutResult />
      </div>
    </section>
  );
}

function LagBars() {
  const scope = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.from("[data-lag-bar]", {
          scaleY: 0,
          transformOrigin: "50% 100%",
          duration: 1.2,
          ease: EASE_OUT,
          stagger: 0.07,
          scrollTrigger: { trigger: scope.current, start: "top 75%" },
        });
      });
    },
    { scope },
  );
  return (
    <figure ref={scope}>
      <figcaption>
        <h3 className="text-h2 font-bold">Rain shows up in cases three weeks later</h3>
        <p className="mt-2 max-w-md text-body text-slate">
          Correlation between each ward&apos;s weekly cases and the rain k weeks before, with the usual
          season removed. All 60 wards, 2016 to 2025.
        </p>
      </figcaption>
      <div className="mt-8 flex h-56 items-end gap-3" role="list" aria-label="Correlation by lag in weeks">
        {LAG_CORRELATION.map(({ k, r }) => {
          const isPeak = k === "3";
          return (
            <div key={k} role="listitem" className="flex flex-1 flex-col items-center gap-2">
              <span className={`font-mono text-sm tnum ${isPeak ? "font-semibold text-navy" : "text-slate"}`}>
                {r === 0 ? "≈0" : r.toFixed(2)}
              </span>
              <div
                aria-hidden="true"
                data-lag-bar
                className={`w-full rounded-t-[6px] ${isPeak ? "bg-royal" : "bg-royal/25"}`}
                style={{ height: `${Math.max((r / 0.47) * 160, 3)}px` }}
              />
              <span className="font-mono text-xs text-slate">{k === "5+" ? "5+ wk" : `${k} wk`}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function SpotlightChart() {
  const history = useQuery({
    queryKey: ["ward-history", SPOTLIGHT_WARD, HISTORY_START, HISTORY_END],
    queryFn: ({ signal }) => fetchWardHistory(SPOTLIGHT_WARD, { start: HISTORY_START, end: HISTORY_END }, signal),
    staleTime: Infinity,
  });
  const peakWeek = addDaysIso(STORM_ORIGIN, 21) ?? STORM_ORIGIN;
  const points = (history.data?.weeks ?? []).map((w) => ({
    week: w.week,
    label: formatShortDate(w.week).replace(/ \d{4}$/, ""),
    rain: w.rainfall_mm,
    cases: w.dengue_cases,
  }));

  return (
    <figure>
      <figcaption>
        <h3 className="text-h2 font-bold">{wardLabel(SPOTLIGHT_WARD)}, Dhaka South, monsoon 2024</h3>
        <p className="mt-2 max-w-xl text-body text-slate">
          Weekly rain in mm (bars, left axis) and recorded dengue cases (line, right axis) from the dataset. The 216 mm week of{" "}
          {formatShortDate(STORM_ORIGIN)} is followed by the season&apos;s highest count three weeks later.
        </p>
      </figcaption>
      <div className="mt-6 h-72 rounded-[14px] bg-white p-3 ring-1 ring-mist">
        {history.isError ? (
          <p role="alert" className="grid h-full place-items-center text-sm text-slate">
            Ward history is unavailable: the API is not reachable.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="var(--color-mist)" />
              <ReferenceArea yAxisId="rain" x1={STORM_ORIGIN} x2={peakWeek} fill="var(--color-royal)" fillOpacity={0.07} />
              <XAxis
                dataKey="week"
                tickFormatter={(w: string) => formatShortDate(w).replace(/ \d{4}$/, "")}
                tick={{ fill: "var(--color-slate)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-mist)" }}
                tickLine={false}
                interval={2}
              />
              <YAxis yAxisId="rain" tick={{ fill: "var(--color-slate)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <YAxis yAxisId="cases" orientation="right" tick={{ fill: "var(--color-slate)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: "var(--color-paper)" }}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--color-mist)", fontFamily: "var(--font-mono)", fontSize: 12 }}
                labelFormatter={(w) => `Week of ${formatShortDate(String(w))}`}
                formatter={(value, name) => (name === "rain" ? [`${Number(value).toFixed(0)} mm`, "Rain"] : [value, "Cases"])}
              />
              <Bar yAxisId="rain" dataKey="rain" fill="var(--color-royal)" fillOpacity={0.35} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="cases" dataKey="cases" stroke="var(--color-navy)" strokeWidth={2.5} dot={{ r: 2.5, fill: "var(--color-navy)" }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-3 text-xs text-slate">
        Shaded: the three weeks from rain to peak ({formatShortDate(STORM_ORIGIN)} to {formatShortDate(peakWeek)}).
      </p>
    </figure>
  );
}

function maeOf(rows: readonly MetricRow[], model: string, horizon: number): number | null {
  return rows.find((r) => r.model === model && r.horizon === horizon && r.period === HOLDOUT)?.mae ?? null;
}

function HoldoutResult() {
  const validation = useQuery({
    queryKey: ["validation"],
    queryFn: ({ signal }) => fetchValidation(signal),
    staleTime: 5 * 60 * 1000,
  });
  const rows = validation.data?.metrics ?? [];
  const horizons = [1, 2, 3, 4];
  const model3 = maeOf(rows, "lightgbm", 3);
  const clim3 = maeOf(rows, "climatology", 3);
  const gain3 = model3 !== null && clim3 ? (1 - model3 / clim3) * 100 : null;
  const coverage3 = validation.data?.coverage.find((c) => c.horizon === 3 && c.period === HOLDOUT)?.coverage_80;
  const maxMae = Math.max(...rows.filter((r) => r.period === HOLDOUT).map((r) => r.mae), 1);

  return (
    <div className="mt-24 grid gap-12 border-t border-mist pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
      <div>
        <h3 className="text-h2 font-bold">Locked hold-out: 2024 and 2025</h3>
        {validation.isError ? (
          <p role="alert" className="mt-3 text-body text-slate">Validation results are unavailable: the API is not reachable.</p>
        ) : (
          <p className="mt-3 text-lg leading-8 text-slate">
            Three weeks ahead, the forecast misses by{" "}
            <strong className="font-semibold text-ink">{model3 !== null ? model3.toFixed(2) : "…"} cases</strong> per
            ward-week on average,{" "}
            <strong className="font-semibold text-royal">
              {gain3 !== null ? <NumberTicker value={gain3} decimalPlaces={0} suffix="%" /> : "…"} less
            </strong>{" "}
            than each ward&apos;s seasonal average for that week.
            {coverage3 != null
              ? ` Its 80% range held the real count ${(coverage3 * 100).toFixed(0)}% of the time.`
              : ""}
          </p>
        )}
        <p className="mt-4 text-sm text-slate">
          Trained on 2016 to 2022, tuned on 2023, scored once on the locked years. The data looks simulated, so
          these are not real-world accuracy claims.
        </p>
      </div>
      <table className="w-full self-end text-left">
        <caption className="sr-only">Mean absolute error by forecast horizon, hold-out 2024 to 2025</caption>
        <thead>
          <tr className="text-xs text-slate">
            <th scope="col" className="pb-3 font-normal">Weeks ahead</th>
            <th scope="col" className="pb-3 font-normal">Mean absolute error (cases per ward-week)</th>
          </tr>
        </thead>
        <tbody>
          {horizons.map((h) => {
            const m = maeOf(rows, "lightgbm", h);
            const c = maeOf(rows, "climatology", h);
            return (
              <tr key={h} className="border-t border-mist">
                <th scope="row" className="py-3 pr-4 align-top font-mono text-sm font-semibold text-navy tnum">+{h}</th>
                <td className="space-y-1.5 py-3">
                  <MaeBar label="Abhas" value={m} max={maxMae} strong />
                  <MaeBar label="Seasonal average" value={c} max={maxMae} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MaeBar({ label, value, max, strong = false }: { label: string; value: number | null; max: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
      <span className={strong ? "font-semibold text-ink" : "text-slate"}>{label}</span>
      <span aria-hidden="true" className="h-2.5 rounded-full bg-mist">
        <span
          className={`block h-full rounded-full ${strong ? "bg-royal" : "bg-slate/50"}`}
          style={{ width: value !== null ? `${(value / max) * 100}%` : "0%" }}
        />
      </span>
      <span className="text-right font-mono tnum">{value !== null ? value.toFixed(2) : "…"}</span>
    </div>
  );
}
