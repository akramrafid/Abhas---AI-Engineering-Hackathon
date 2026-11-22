"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HorizonForecast } from "@/lib/api/client";
import { RiskTierBadge, TIER_META } from "@/components/brand/RiskTierBadge";
import { ArrowDownRight, ArrowUpRight, Minus } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";

interface ForecastChartDatum {
  label: string;
  shortDate: string;
  targetWeek: string;
  horizon: number;
  expected: number;
  p10: number;
  p90: number;
  bandBase: number;
  bandSpan: number;
  riskScore: number;
  tier: HorizonForecast["tier"];
  isPeak: boolean;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ForecastChartDatum;
}

function TierDot({ cx, cy, payload }: CustomDotProps) {
  if (typeof cx !== "number" || typeof cy !== "number" || !payload) {
    return null;
  }
  const meta = TIER_META[payload.tier];
  const r = payload.isPeak ? 6.5 : 5.5;

  return (
    <g>
      {/* Ambient tier halo */}
      <circle cx={cx} cy={cy} r={r + 7} fill={meta.bgVar} fillOpacity={payload.isPeak ? 0.22 : 0.14} />
      {/* Crisp white ring separating node from line */}
      <circle cx={cx} cy={cy} r={r + 2} fill="var(--color-white)" />
      {/* Core risk tier marker */}
      <circle cx={cx} cy={cy} r={r} fill={meta.bgVar} stroke="var(--color-navy)" strokeWidth={1.25} />
      {/* Direct data value callout above node */}
      <g transform={`translate(${cx}, ${cy - 22})`}>
        <rect
          x={-22}
          y={-11}
          width={44}
          height={20}
          rx={6}
          fill={payload.isPeak ? "var(--color-navy)" : "var(--color-white)"}
          stroke={payload.isPeak ? "var(--color-navy)" : "var(--color-mist)"}
          strokeWidth={1}
        />
        <text
          x={0}
          y={2.5}
          textAnchor="middle"
          fill={payload.isPeak ? "var(--color-white)" : "var(--color-navy)"}
          fontSize={11}
          fontWeight={700}
          fontFamily="var(--font-sans)"
        >
          {payload.expected.toFixed(1)}
        </text>
      </g>
    </g>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ForecastChartDatum }>;
}

function ForecastTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const span = Math.max(0.1, row.p90 - row.p10);
  const pct = Math.min(100, Math.max(0, ((row.expected - row.p10) / span) * 100));

  return (
    <div className="min-w-[230px] rounded-[12px] border border-mist bg-white/95 p-3.5 text-xs text-ink shadow-[0_18px_40px_-10px_rgba(11,15,20,0.28)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-navy tnum">
            +{row.horizon}w · {row.shortDate}
          </p>
          <p className="text-[11px] text-slate tnum">{row.targetWeek}</p>
        </div>
        <RiskTierBadge tier={row.tier} size="sm" />
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-mist pt-2.5">
        <span className="text-slate">Expected cases</span>
        <span className="text-lg font-extrabold tracking-tight text-navy tnum">
          {row.expected.toFixed(1)}
        </span>
      </div>

      {/* Visual P10 -> Expected -> P90 interval bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-slate tnum">
          <span>P10: {row.p10.toFixed(1)}</span>
          <span className="font-medium text-royal">80% band</span>
          <span>P90: {row.p90.toFixed(1)}</span>
        </div>
        <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist">
          <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-royal/20" />
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal ring-2 ring-white"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-mist pt-2 text-[11px] text-slate tnum">
        <span>Risk score</span>
        <span className="font-semibold text-navy">{row.riskScore} / 100</span>
      </div>
    </div>
  );
}

function niceCeiling(value: number): number {
  const padded = Math.max(5, value * 1.18);
  if (padded <= 10) return Math.ceil(padded / 2) * 2;
  if (padded <= 30) return Math.ceil(padded / 5) * 5;
  return Math.ceil(padded / 10) * 10;
}

export function ForecastChart({ horizons }: { horizons: readonly HorizonForecast[] }) {
  const uid = useId().replace(/:/g, "");
  const bandGradId = `bandGrad-${uid}`;
  const lineAreaGradId = `lineAreaGrad-${uid}`;
  const glowId = `royalGlow-${uid}`;

  const peakExpected = horizons.reduce((m, h) => Math.max(m, h.expected_cases), 0);
  const peakRow =
    horizons.find((h) => h.expected_cases === peakExpected) ?? horizons[horizons.length - 1];
  const maxP90 = horizons.reduce((m, h) => Math.max(m, h.p90), 0);

  const first = horizons[0];
  const last = horizons[horizons.length - 1];
  const delta = first && last ? last.expected_cases - first.expected_cases : 0;
  const deltaPct = first && first.expected_cases > 0.05 ? (delta / first.expected_cases) * 100 : 0;

  const data: ForecastChartDatum[] = horizons.map((h) => ({
    label: `+${h.horizon}w · ${formatShortDate(h.target_week)}`,
    shortDate: formatShortDate(h.target_week),
    targetWeek: h.target_week,
    horizon: h.horizon,
    expected: h.expected_cases,
    p10: h.p10,
    p90: h.p90,
    bandBase: h.p10,
    bandSpan: Math.max(0, h.p90 - h.p10),
    riskScore: h.risk_score,
    tier: h.tier,
    isPeak: peakRow ? h.horizon === peakRow.horizon : false,
  }));

  const maxY = niceCeiling(Math.max(maxP90, peakExpected));
  const peakLabel = data.find((d) => d.isPeak)?.label;

  return (
    <div className="space-y-4">
      {/* Executive summary telemetry ribbon */}
      <div className="grid grid-cols-1 gap-2.5 rounded-[12px] border border-mist bg-paper/75 px-4 py-3 sm:grid-cols-3">
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-[11px] font-semibold text-slate">Peak expected</p>
          <p className="mt-0.5 text-base font-extrabold tracking-tight text-navy tnum">
            {peakRow ? `${peakRow.expected_cases.toFixed(1)} cases` : "—"}
            {peakRow ? (
              <span className="ml-1.5 text-xs font-medium text-slate">
                (+{peakRow.horizon}w)
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-2 border-t border-mist pt-2 sm:block sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="text-[11px] font-semibold text-slate">80% ceiling (P90)</p>
          <p className="mt-0.5 text-base font-extrabold tracking-tight text-royal tnum">
            {maxP90.toFixed(1)} cases
            <span className="ml-1.5 text-xs font-medium text-slate">bed planning</span>
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-2 border-t border-mist pt-2 sm:block sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="text-[11px] font-semibold text-slate">Window trajectory</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-base font-extrabold tracking-tight text-navy tnum">
            {delta > 0.3 ? (
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-royal" />
            ) : delta < -0.3 ? (
              <ArrowDownRight aria-hidden="true" className="h-4 w-4 text-slate" />
            ) : (
              <Minus aria-hidden="true" className="h-4 w-4 text-slate" />
            )}
            {delta > 0.1 ? "+" : ""}
            {delta.toFixed(1)} cases
            {Math.abs(deltaPct) >= 1 ? (
              <span className="text-xs font-medium text-slate">
                ({deltaPct > 0 ? "+" : ""}
                {Math.round(deltaPct)}%)
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* Interactive Recharts canvas */}
      <div
        data-testid="forecast-chart"
        className="h-72 w-full"
        role="region"
        aria-label="Expected weekly dengue cases with 80 percent prediction band"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 34, right: 32, left: 2, bottom: 8 }}>
            <defs>
              <linearGradient id={bandGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2F5BFF" stopOpacity={0.22} />
                <stop offset="55%" stopColor="#2F5BFF" stopOpacity={0.11} />
                <stop offset="100%" stopColor="#2F5BFF" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id={lineAreaGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2F5BFF" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#2F5BFF" stopOpacity={0} />
              </linearGradient>
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2F5BFF" floodOpacity="0.28" />
              </filter>
            </defs>

            <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 5" vertical={false} />

            {peakLabel ? (
              <ReferenceLine
                x={peakLabel}
                stroke="var(--color-royal)"
                strokeOpacity={0.28}
                strokeDasharray="4 4"
              />
            ) : null}

            <XAxis
              dataKey="label"
              padding={{ left: 32, right: 32 }}
              tick={{ fill: "var(--color-navy)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)" }}
              axisLine={{ stroke: "var(--color-mist)" }}
              tickLine={false}
              dy={6}
            />
            <YAxis
              domain={[0, maxY]}
              tickCount={5}
              tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-sans)" }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{
                value: "Cases / wk",
                angle: -90,
                position: "insideLeft",
                offset: 6,
                fill: "var(--color-slate)",
                fontSize: 11,
                fontWeight: 500,
              }}
            />

            <Tooltip
              content={<ForecastTooltip />}
              cursor={{ stroke: "var(--color-royal)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
            />

            {/* Stacked P10..P90 80% conformal uncertainty envelope */}
            <Area
              type="monotone"
              dataKey="bandBase"
              stackId="ci80"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="bandSpan"
              stackId="ci80"
              name="80% prediction band"
              stroke="none"
              fill={`url(#${bandGradId})`}
              isAnimationActive={false}
            />

            {/* Subtle P90 upper & P10 lower contour lines */}
            <Line
              type="monotone"
              dataKey="p90"
              name="P90 upper"
              stroke="var(--color-royal)"
              strokeOpacity={0.35}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p10"
              name="P10 lower"
              stroke="var(--color-royal)"
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="3 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />

            {/* Soft translucent wash under expected curve */}
            <Area
              type="monotone"
              dataKey="expected"
              stroke="none"
              fill={`url(#${lineAreaGradId})`}
              isAnimationActive={false}
            />

            {/* Primary expected cases trajectory spline with luminous drop shadow & tier callout nodes */}
            <Line
              type="monotone"
              dataKey="expected"
              name="Expected cases"
              stroke="var(--color-royal)"
              strokeWidth={3}
              filter={`url(#${glowId})`}
              dot={<TierDot />}
              activeDot={{
                r: 7.5,
                fill: "var(--color-royal)",
                stroke: "var(--color-white)",
                strokeWidth: 3,
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
