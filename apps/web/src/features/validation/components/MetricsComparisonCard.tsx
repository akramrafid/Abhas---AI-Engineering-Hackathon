"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import type { MetricRow } from "@/lib/api/client";

type MetricField = "mae" | "rmse" | "poisson_deviance";

const MODEL_LABELS: Record<MetricRow["model"], string> = {
  lightgbm: "Abhas LightGBM",
  negbin_glm: "NegBin GLM",
  climatology: "Climatology",
  lightgbm_no_weather: "No-Weather LGBM",
  seasonal_naive: "Seasonal Naive",
  persistence: "Persistence",
};

const MODEL_COLORS: Record<MetricRow["model"], string> = {
  lightgbm: "var(--color-royal)",
  negbin_glm: "var(--color-navy)",
  climatology: "var(--color-slate)",
  lightgbm_no_weather: "var(--color-risk-high)",
  seasonal_naive: "var(--color-mist)",
  persistence: "var(--color-ink)",
};

const METRIC_LABELS: Record<MetricField, string> = {
  mae: "MAE (cases)",
  rmse: "RMSE (cases)",
  poisson_deviance: "Poisson Deviance",
};

export interface MetricsComparisonCardProps {
  metrics: readonly MetricRow[];
}

export function MetricsComparisonCard({ metrics }: MetricsComparisonCardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("holdout_2024_2025");
  const [metricField, setMetricField] = useState<MetricField>("mae");

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const row of metrics) set.add(row.period);
    return Array.from(set);
  }, [metrics]);

  const effectivePeriod = useMemo(() => {
    if (selectedPeriod === "ALL") return "ALL";
    if (periods.includes(selectedPeriod)) return selectedPeriod;
    return periods[0] ?? "ALL";
  }, [periods, selectedPeriod]);

  const filteredMetrics = useMemo(() => {
    if (effectivePeriod === "ALL") return metrics;
    return metrics.filter((r) => r.period === effectivePeriod);
  }, [metrics, effectivePeriod]);

  const modelsPresent = useMemo(() => {
    const order: MetricRow["model"][] = [
      "lightgbm",
      "climatology",
      "lightgbm_no_weather",
      "negbin_glm",
      "seasonal_naive",
      "persistence",
    ];
    const present = new Set(filteredMetrics.map((m) => m.model));
    return order.filter((m) => present.has(m));
  }, [filteredMetrics]);

  const chartRows = useMemo(() => {
    const byHorizon = new Map<number, Record<string, number[]>>();
    for (const row of filteredMetrics) {
      const entry = byHorizon.get(row.horizon) ?? {};
      const arr = entry[row.model] ?? [];
      arr.push(row[metricField]);
      entry[row.model] = arr;
      byHorizon.set(row.horizon, entry);
    }

    return Array.from(byHorizon.entries())
      .sort(([a], [b]) => a - b)
      .map(([horizon, modelVals]) => {
        const out: Record<string, string | number> = { horizon: `+${horizon}w` };
        for (const [model, vals] of Object.entries(modelVals)) {
          const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
          out[model] = Number(avg.toFixed(3));
        }
        return out;
      });
  }, [filteredMetrics, metricField]);

  return (
    <Card>
      <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Model vs baselines by horizon</CardTitle>
          <CardDescription>
            Lower is better. Compares Abhas LightGBM against ward × week climatology, no-weather ablation, seasonal naive, persistence, and NegBin GLM.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Evaluation period">
            {periods.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={effectivePeriod === period}
                onClick={() => setSelectedPeriod(period)}
                className={clsx(
                  "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs tnum",
                  effectivePeriod === period
                    ? "border-royal bg-royal font-semibold text-white"
                    : "border-mist bg-white text-navy hover:bg-paper",
                )}
              >
                {period}
              </button>
            ))}
            {periods.length > 1 ? (
              <button
                type="button"
                aria-pressed={effectivePeriod === "ALL"}
                onClick={() => setSelectedPeriod("ALL")}
                className={clsx(
                  "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs",
                  effectivePeriod === "ALL"
                    ? "border-royal bg-royal font-semibold text-white"
                    : "border-mist bg-white text-navy hover:bg-paper",
                )}
              >
                All
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Metric selector">
            {(["mae", "rmse", "poisson_deviance"] as const).map((field) => (
              <button
                key={field}
                type="button"
                aria-pressed={metricField === field}
                onClick={() => setMetricField(field)}
                className={clsx(
                  "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
                  metricField === field
                    ? "border-navy bg-navy text-white"
                    : "border-mist bg-paper text-navy hover:bg-white",
                )}
              >
                {field === "poisson_deviance" ? "Deviance" : field.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div
          data-testid="validation-metrics-chart"
          className="h-64 w-full"
          role="region"
          aria-label={`${METRIC_LABELS[metricField]} comparison across horizons for model and baselines`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="horizon"
                tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                axisLine={{ stroke: "var(--color-mist)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {modelsPresent.map((model) => (
                <Bar
                  key={model}
                  dataKey={model}
                  name={MODEL_LABELS[model]}
                  fill={MODEL_COLORS[model]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          className="overflow-x-auto rounded-md border border-mist"
          tabIndex={0}
          role="region"
          aria-label="Backtest metrics comparison table"
        >
          <table
            data-testid="validation-metrics-table"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                <th scope="col" className="px-4 py-2.5">Model</th>
                <th scope="col" className="px-4 py-2.5">Period</th>
                <th scope="col" className="px-4 py-2.5">Horizon</th>
                <th scope="col" className="px-4 py-2.5 text-right">MAE</th>
                <th scope="col" className="px-4 py-2.5 text-right">RMSE</th>
                <th scope="col" className="px-4 py-2.5 text-right">Poisson Deviance</th>
                <th scope="col" className="px-4 py-2.5 text-right">Ward-weeks (N)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {filteredMetrics.map((row, idx) => (
                <tr
                  key={`${row.model}-${row.period}-${row.horizon}-${idx}`}
                  className={row.model === "lightgbm" ? "bg-paper/70" : "bg-white"}
                >
                  <td className="px-4 py-2.5 font-semibold text-navy">
                    {MODEL_LABELS[row.model]}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate tnum">
                    {row.period}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-navy tnum">
                    +{row.horizon}w
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-ink tnum">
                    {row.mae.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-ink tnum">
                    {row.rmse.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-slate tnum">
                    {row.poisson_deviance.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate tnum">
                    {row.n.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
