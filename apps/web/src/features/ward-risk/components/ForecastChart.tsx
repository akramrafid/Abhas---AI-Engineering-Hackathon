"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HorizonForecast } from "@/lib/api/client";
import { TIER_META } from "@/components/brand/RiskTierBadge";

interface ForecastChartDatum {
  label: string;
  targetWeek: string;
  horizon: number;
  expected: number;
  p10: number;
  p90: number;
  bandBase: number;
  bandSpan: number;
  riskScore: number;
  tier: HorizonForecast["tier"];
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
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={meta.bgVar}
      stroke="var(--color-navy)"
      strokeWidth={1.5}
    />
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
  const meta = TIER_META[row.tier];

  return (
    <div className="rounded-md border border-mist bg-white p-3 text-xs text-ink shadow-sm">
      <p className="font-mono font-semibold text-navy tnum">
        +{row.horizon}w · {row.targetWeek}
      </p>
      <div className="mt-1.5 space-y-1 font-mono tnum">
        <p>
          Expected: <span className="font-semibold">{row.expected.toFixed(1)}</span> cases
        </p>
        <p className="text-slate">
          80% band: {row.p10.toFixed(1)} – {row.p90.toFixed(1)}
        </p>
        <p className="text-slate">
          Risk score: {row.riskScore} / 100 · {meta.labelEn} / {meta.labelBn}
        </p>
      </div>
    </div>
  );
}

export function ForecastChart({ horizons }: { horizons: readonly HorizonForecast[] }) {
  const data: ForecastChartDatum[] = horizons.map((h) => ({
    label: `+${h.horizon}w (${h.target_week.slice(5)})`,
    targetWeek: h.target_week,
    horizon: h.horizon,
    expected: h.expected_cases,
    p10: h.p10,
    p90: h.p90,
    bandBase: h.p10,
    bandSpan: Math.max(0, h.p90 - h.p10),
    riskScore: h.risk_score,
    tier: h.tier,
  }));

  const maxY = Math.max(
    5,
    Math.ceil(Math.max(...data.map((d) => Math.max(d.p90, d.expected))) * 1.15),
  );

  return (
    <div
      data-testid="forecast-chart"
      className="h-64 w-full"
      role="region"
      aria-label="Expected weekly dengue cases with 80 percent prediction band"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--color-mist)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, maxY]}
            tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            width={42}
            label={{
              value: "Cases",
              angle: -90,
              position: "insideLeft",
              fill: "var(--color-slate)",
              fontSize: 11,
            }}
          />
          <Tooltip content={<ForecastTooltip />} />
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
            fill="var(--color-forecast-band)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="expected"
            name="Expected cases"
            stroke="var(--color-royal)"
            strokeWidth={2.5}
            dot={<TierDot />}
            activeDot={{ r: 6, fill: "var(--color-royal)", stroke: "var(--color-white)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
