"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
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
import type { LagCorrelation } from "@/lib/api/client";

export interface LagsCorrelationChartProps {
  wardId: string;
  peakLagDataset: number;
  correlations: readonly LagCorrelation[];
}

export function LagsCorrelationChart({
  wardId,
  peakLagDataset,
  correlations,
}: LagsCorrelationChartProps) {
  return (
    <Card>
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Deseasonalized rain–case correlation by lag (0–8 weeks)</CardTitle>
          <CardDescription>
            Pearson correlation after removing ward × ISO-week seasonality; lag {peakLagDataset} is highlighted.
          </CardDescription>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-royal" aria-hidden="true" />
            Dataset peak (lag {peakLagDataset}w)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-navy" aria-hidden="true" />
            Ward r
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div
          data-testid="lags-corr-chart"
          className="h-60 w-full"
          role="region"
          aria-label="Pearson correlation between lagged rainfall and dengue cases for lags 0 to 8 weeks"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...correlations]}
              margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                stroke="var(--color-mist)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="lag_weeks"
                tickFormatter={(v: number) => `${v}w`}
                tick={{
                  fill: "var(--color-slate)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={{ stroke: "var(--color-mist)" }}
                tickLine={false}
              />
              <YAxis
                domain={[-0.2, 0.65]}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{
                  fill: "var(--color-slate)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <ReferenceLine y={0} stroke="var(--color-mist)" />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  typeof value === "number" ? value.toFixed(3) : String(value ?? ""),
                  name === "dataset_corr" ? "Dataset (60 wards)" : wardId,
                ]}
                labelFormatter={(lag: unknown) => `Lag ${String(lag ?? "")} weeks`}
              />
              <Bar
                dataKey="dataset_corr"
                name="dataset_corr"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {correlations.map((entry) => (
                  <Cell
                    key={`ds-${entry.lag_weeks}`}
                    fill={
                      entry.lag_weeks === peakLagDataset
                        ? "var(--color-royal)"
                        : "var(--color-mist)"
                    }
                  />
                ))}
              </Bar>
              <Bar
                dataKey="ward_corr"
                name="ward_corr"
                fill="var(--color-navy)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
