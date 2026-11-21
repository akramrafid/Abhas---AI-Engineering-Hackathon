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
import type { MetricRow } from "@/lib/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { useOpsQuery, useValidationQuery } from "../hooks";

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

export function ValidationView() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("holdout_2024_2025");
  const [metricField, setMetricField] = useState<MetricField>("mae");

  const validationQuery = useValidationQuery(true);
  const opsQuery = useOpsQuery(true);

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const row of validationQuery.data?.metrics ?? []) {
      set.add(row.period);
    }
    return Array.from(set);
  }, [validationQuery.data?.metrics]);

  const effectivePeriod = useMemo(() => {
    if (selectedPeriod === "ALL") return "ALL";
    if (periods.includes(selectedPeriod)) return selectedPeriod;
    return periods[0] ?? "ALL";
  }, [periods, selectedPeriod]);

  const filteredMetrics = useMemo(() => {
    const rows = validationQuery.data?.metrics ?? [];
    if (effectivePeriod === "ALL") return rows;
    return rows.filter((r) => r.period === effectivePeriod);
  }, [validationQuery.data?.metrics, effectivePeriod]);

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

  // Build grouped chart rows per horizon (averaged if ALL periods selected)
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

  if (validationQuery.isError) {
    return (
      <ErrorBanner
        testId="validation-error-banner"
        retryTestId="validation-retry"
        title="Could not load validation backtest results"
        error={validationQuery.error}
        onRetry={() => {
          void validationQuery.refetch();
        }}
      />
    );
  }

  if (validationQuery.isPending) {
    return (
      <PanelSkeleton
        testId="validation-loading"
        label="Loading chronological validation results…"
      />
    );
  }

  const data = validationQuery.data;
  if (!data || data.metrics.length === 0) {
    return (
      <EmptyState
        testId="validation-empty-state"
        title="No stored backtest results found"
        description="Run npm run eval to generate hold-out MAE, RMSE, coverage, and tier confusion matrix outputs."
      />
    );
  }

  const ops = opsQuery.data;

  return (
    <div data-testid="validation-panel" className="space-y-5">
      {/* Split & Hold-out Lock Header */}
      <Card data-testid="validation-split-summary">
        <CardHeader>
          <CardTitle>Chronological backtest &amp; baseline comparison</CardTitle>
          <CardDescription>{data.split}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-slate tnum">
          <span>
            Model: <strong className="text-navy">{data.model_version}</strong>
          </span>
          <span>
            Generated: <strong className="text-ink">{data.generated_at.slice(0, 19).replace("T", " ")} UTC</strong>
          </span>
          {data.holdout_locked_sha256 ? (
            <span>
              Hold-out SHA-256:{" "}
              <strong className="text-navy">
                {data.holdout_locked_sha256.slice(0, 16)}…
              </strong>
            </span>
          ) : null}
        </CardContent>
      </Card>

      {/* Metrics Chart + Period/Metric Filters */}
      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Model vs baselines by horizon</CardTitle>
            <CardDescription>
              Lower is better. Compares Abhas LightGBM against ward × week climatology, no-weather ablation, seasonal naive, and NegBin GLM.
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

      {/* 80% Coverage + Tier Confusion Matrix */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <Card data-testid="validation-coverage">
          <CardHeader>
            <CardTitle>80% prediction band coverage</CardTitle>
            <CardDescription>
              Share of actual weekly counts falling inside [P10, P90]. Calibration target: 75% – 90%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.coverage.length === 0 ? (
              <p className="text-sm text-slate">No coverage rows available.</p>
            ) : (
              <div className="space-y-3">
                {data.coverage.map((row, idx) => {
                  const pct = row.coverage_80 * 100;
                  const inTarget = row.coverage_80 >= 0.75 && row.coverage_80 <= 0.9;
                  return (
                    <div
                      key={`${row.period}-${row.horizon}-${idx}`}
                      className="rounded-md border border-mist bg-paper p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-navy tnum">
                          +{row.horizon}w · {row.period}
                        </span>
                        <span className="font-mono text-sm font-bold text-ink tnum">
                          {pct.toFixed(1)}%{" "}
                          <span className="text-xs font-medium text-slate">
                            ({inTarget ? "in target" : "outside 75–90%"})
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-sm border border-mist bg-white"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full bg-royal"
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="validation-confusion">
          <CardHeader>
            <CardTitle>Tier confusion matrix</CardTitle>
            <CardDescription>
              Rows = actual tier; columns = predicted tier on hold-out weeks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-mist bg-paper p-3">
                <p className="text-xs font-semibold text-slate">Within 1 tier</p>
                <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                  {(data.confusion.within_one_tier * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-md border border-mist bg-paper p-3">
                <p className="text-xs font-semibold text-slate">Critical recall</p>
                <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                  {(data.confusion.critical_recall * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-md border border-mist bg-paper p-3">
                <p className="text-xs font-semibold text-slate">Macro-F1</p>
                <p className="mt-1 font-mono text-lg font-bold text-navy tnum">
                  {data.confusion.macro_f1.toFixed(2)}
                </p>
              </div>
            </div>

            <div
              className="overflow-x-auto rounded-md border border-mist"
              tabIndex={0}
              role="region"
              aria-label="Tier confusion matrix table"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-mist bg-paper text-slate">
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Actual ↓ / Pred →
                    </th>
                    {data.confusion.labels.map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-3 py-2 text-right font-semibold text-navy"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {data.confusion.labels.map((rowLabel, rowIdx) => (
                    <tr key={rowLabel}>
                      <th
                        scope="row"
                        className="bg-paper px-3 py-2 font-semibold text-navy"
                      >
                        {rowLabel}
                      </th>
                      {(data.confusion.matrix[rowIdx] ?? []).map((count, colIdx) => (
                        <td
                          key={`${rowLabel}-${colIdx}`}
                          className={clsx(
                            "px-3 py-2 text-right font-mono tnum",
                            rowIdx === colIdx
                              ? "bg-forecast-band font-bold text-navy"
                              : "bg-white text-ink",
                          )}
                        >
                          {count.toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live /api/v1/ops Telemetry & Model Card Limits */}
      <Card data-testid="validation-ops-card">
        <CardHeader>
          <CardTitle>Compute, caching &amp; cost efficiency (/api/v1/ops)</CardTitle>
          <CardDescription>
            Live local-office operational telemetry confirming single joblib load, prediction cache efficiency, and bounded external API calls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {opsQuery.isPending ? (
            <p className="text-sm text-slate">Loading operations telemetry…</p>
          ) : opsQuery.isError ? (
            <p className="rounded-md border border-mist bg-paper px-4 py-3 text-sm text-slate">
              Operations counters are currently unavailable ({opsQuery.error.title}).
            </p>
          ) : ops ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-mist bg-paper p-3.5">
                <p className="text-xs font-semibold text-slate">Model loads</p>
                <p
                  data-testid="validation-ops-model-loads"
                  className="mt-1 font-mono text-xl font-bold text-navy tnum"
                >
                  {ops.model_loads}
                </p>
                <p className="mt-0.5 text-xs text-slate">Loaded once at boot</p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <p className="text-xs font-semibold text-slate">Prediction cache hit</p>
                <p
                  data-testid="validation-ops-cache-rate"
                  className="mt-1 font-mono text-xl font-bold text-navy tnum"
                >
                  {(ops.predictions.cache_hit_rate * 100).toFixed(0)}%
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate tnum">
                  {ops.predictions.cache_hits} / {ops.predictions.requests} req
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <p className="text-xs font-semibold text-slate">Inference latency</p>
                <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                  {ops.predictions.p95_ms.toFixed(1)} ms
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate tnum">
                  p50 {ops.predictions.p50_ms.toFixed(1)} ms (target &lt;50)
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <p className="text-xs font-semibold text-slate">Weather API calls</p>
                <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                  {ops.weather.calls_today}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate tnum">
                  Total {ops.weather.calls_total} · hits {ops.weather.cache_hits}
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <p className="text-xs font-semibold text-slate">Est. monthly office cost</p>
                <p className="mt-1 font-mono text-xl font-bold text-navy tnum">
                  ${ops.est_monthly_cost_usd.toFixed(2)}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate tnum">
                  LLM today: ${ops.llm.spend_usd_today.toFixed(2)} / ${ops.llm.budget_usd_per_day.toFixed(2)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-mist bg-paper px-4 py-3 text-xs leading-relaxed text-slate">
            <strong className="text-navy">Model card &amp; scope note:</strong> Fitted strictly on
            the organisers&apos; 60-ward dataset (2016–2025). The underlying series appears
            simulated and has not been validated against live DGHS hospital surveillance; do not use
            for real clinical deployment without local recalibration.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
