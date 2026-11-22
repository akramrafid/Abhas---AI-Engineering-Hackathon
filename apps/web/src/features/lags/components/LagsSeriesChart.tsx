"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

export interface ShiftedPoint {
  week: string;
  shortWeek: string;
  dengueCases: number;
  observedRain: number;
  shiftedRain: number | null;
  rainSourceWeek: string | null;
}

interface SeriesTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ShiftedPoint }>;
  lagWeeks: number;
}

function SeriesTooltip({ active, payload, lagWeeks }: SeriesTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="rounded-md border border-mist bg-white p-3 text-xs text-ink shadow-sm">
      <p className="font-mono font-semibold text-navy tnum">Case week: {pt.week}</p>
      <div className="mt-1.5 space-y-1 font-mono tnum">
        <p>Dengue cases: {pt.dengueCases}</p>
        <p className="text-royal">
          Rain (lag {lagWeeks}w):{" "}
          {pt.shiftedRain !== null ? `${pt.shiftedRain.toFixed(1)} mm` : "—"}
        </p>
        {pt.rainSourceWeek ? (
          <p className="text-slate">Rain observed: {pt.rainSourceWeek}</p>
        ) : null}
      </div>
    </div>
  );
}

export interface LagsSeriesChartProps {
  shiftedSeries: readonly ShiftedPoint[];
  lagWeeks: number;
}

export function LagsSeriesChart({ shiftedSeries, lagWeeks }: LagsSeriesChartProps) {
  return (
    <Card>
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>
            Shifted rainfall (+{lagWeeks}w, mm) vs weekly dengue cases
          </CardTitle>
          <CardDescription>
            Bars show rainfall from {lagWeeks} week{lagWeeks === 1 ? "" : "s"} earlier; solid line shows observed weekly dengue cases.
          </CardDescription>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs border border-royal bg-forecast-band"
              aria-hidden="true"
            />
            Shifted rainfall (mm)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-navy" aria-hidden="true" />
            Dengue cases
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div
          data-testid="lags-series-chart"
          data-lag={String(lagWeeks)}
          className="h-72 w-full"
          role="region"
          aria-label={`Weekly rainfall shifted by ${lagWeeks} weeks compared with weekly dengue cases`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={[...shiftedSeries]}
              margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                stroke="var(--color-mist)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="shortWeek"
                tick={{
                  fill: "var(--color-slate)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={{ stroke: "var(--color-mist)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                yAxisId="rain"
                orientation="left"
                tick={{
                  fill: "var(--color-slate)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={false}
                tickLine={false}
                width={44}
                label={{
                  value: "Rain (mm)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--color-slate)",
                  fontSize: 11,
                }}
              />
              <YAxis
                yAxisId="cases"
                orientation="right"
                tick={{
                  fill: "var(--color-navy)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={false}
                tickLine={false}
                width={40}
                label={{
                  value: "Cases",
                  angle: 90,
                  position: "insideRight",
                  fill: "var(--color-navy)",
                  fontSize: 11,
                }}
              />
              <Tooltip content={<SeriesTooltip lagWeeks={lagWeeks} />} />
              <Bar
                yAxisId="rain"
                dataKey="shiftedRain"
                name={`Rainfall (lag ${lagWeeks}w)`}
                fill="var(--color-forecast-band)"
                stroke="var(--color-royal)"
                strokeWidth={1}
                isAnimationActive={false}
              />
              <Line
                yAxisId="cases"
                type="monotone"
                dataKey="dengueCases"
                name="Dengue cases"
                stroke="var(--color-navy)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
