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
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import type { HorizonForecast, RiskTier, ScenarioResponse } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface ScenarioComparisonViewProps {
  data: ScenarioResponse;
  baselineH3: HorizonForecast;
  scenarioH3: HorizonForecast;
  baselinePeakTier: RiskTier;
  scenarioPeakTier: RiskTier;
  lang: Lang;
}

export function ScenarioComparisonView({
  data,
  baselineH3,
  scenarioH3,
  baselinePeakTier,
  scenarioPeakTier,
  lang,
}: ScenarioComparisonViewProps) {
  const chartData = data.baseline.map((base) => {
    const scen = data.scenario.find((s) => s.horizon === base.horizon) ?? base;
    return {
      label: `+${base.horizon}w (${base.target_week.slice(5)})`,
      baseline: base.expected_cases,
      scenario: scen.expected_cases,
      bandBase: scen.p10,
      bandSpan: Math.max(0, scen.p90 - scen.p10),
    };
  });

  const deltaH3 = scenarioH3.expected_cases - baselineH3.expected_cases;

  return (
    <div data-testid="scenario-comparison" aria-live="polite" className="space-y-5">
      <StubDataBanner modelVersion={data.model_version} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="scenario-baseline-card">
          <CardHeader className="flex-row items-center justify-between gap-2 bg-paper">
            <div>
              <CardTitle className="text-sm">Baseline (observed weather)</CardTitle>
              <CardDescription className="font-mono text-xs tnum">
                {data.ward_id} · {data.origin_week}
              </CardDescription>
            </div>
            <RiskTierBadge tier={baselinePeakTier} size="md" lang={lang} />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-semibold text-slate">
              Horizon +3w expected cases ({baselineH3.target_week})
            </p>
            <p
              data-testid="scenario-baseline-h3"
              className="font-mono text-2xl font-bold text-navy tnum"
            >
              {baselineH3.expected_cases.toFixed(2)}
            </p>
            <p className="font-mono text-xs text-slate tnum">
              80% band: {baselineH3.p10.toFixed(1)} – {baselineH3.p90.toFixed(1)} · Risk score{" "}
              {baselineH3.risk_score}/100
            </p>
          </CardContent>
        </Card>

        <Card data-testid="scenario-result-card" className="border-royal">
          <CardHeader className="flex-row items-center justify-between gap-2 bg-paper">
            <div>
              <CardTitle className="text-sm">
                Scenario (
                {data.weather.rainfall_mm !== null && data.weather.rainfall_mm !== undefined
                  ? `${data.weather.rainfall_mm} mm rain`
                  : "custom weather"}
                )
              </CardTitle>
              <CardDescription
                data-testid="scenario-tier-change"
                className="font-mono text-xs text-navy tnum"
              >
                {baselinePeakTier === scenarioPeakTier
                  ? `Peak tier unchanged (${scenarioPeakTier})`
                  : `Peak tier shift: ${baselinePeakTier} → ${scenarioPeakTier}`}
              </CardDescription>
            </div>
            <RiskTierBadge tier={scenarioPeakTier} size="md" lang={lang} />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-semibold text-slate">
              Horizon +3w expected cases ({scenarioH3.target_week})
            </p>
            <div className="flex items-baseline gap-3">
              <p
                data-testid="scenario-result-h3"
                className="font-mono text-2xl font-bold text-royal tnum"
              >
                {scenarioH3.expected_cases.toFixed(2)}
              </p>
              <span className="rounded-sm bg-paper px-2 py-0.5 font-mono text-xs font-semibold text-navy tnum">
                {deltaH3 >= 0 ? "+" : ""}
                {deltaH3.toFixed(2)} vs baseline
              </span>
            </div>
            <p className="font-mono text-xs text-slate tnum">
              80% band: {scenarioH3.p10.toFixed(1)} – {scenarioH3.p90.toFixed(1)} · Risk score{" "}
              {scenarioH3.risk_score}/100
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Baseline vs scenario trajectory</CardTitle>
            <CardDescription>
              Dashed Slate line = observed baseline; solid Royal line + 80% band = what-if scenario.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 border-t-2 border-dashed border-slate"
                aria-hidden="true"
              />
              Baseline
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-royal" aria-hidden="true" />
              Scenario
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div
            data-testid="scenario-chart"
            className="h-64 w-full"
            role="region"
            aria-label="Baseline versus scenario expected dengue cases across horizons 1 to 4"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 32, left: 4, bottom: 8 }}
              >
                <CartesianGrid
                  stroke="var(--color-mist)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  padding={{ left: 16, right: 16 }}
                  tick={{
                    fill: "var(--color-slate)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={{ stroke: "var(--color-mist)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: "var(--color-slate)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="bandBase"
                  stackId="scen80"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="bandSpan"
                  stackId="scen80"
                  name="Scenario 80% band"
                  stroke="none"
                  fill="var(--color-forecast-band)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  name="Baseline cases"
                  stroke="var(--color-slate)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="scenario"
                  name="Scenario cases"
                  stroke="var(--color-royal)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Per-horizon scenario comparison</CardTitle>
        </CardHeader>
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Per-horizon scenario comparison table"
        >
          <table
            data-testid="scenario-table"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                <th scope="col" className="px-4 py-2.5">Horizon</th>
                <th scope="col" className="px-4 py-2.5">Target week</th>
                <th scope="col" className="px-4 py-2.5 text-right">Baseline</th>
                <th scope="col" className="px-4 py-2.5">Baseline tier</th>
                <th scope="col" className="px-4 py-2.5 text-right">Scenario (80% band)</th>
                <th scope="col" className="px-4 py-2.5 text-right">Delta</th>
                <th scope="col" className="px-4 py-2.5">Scenario tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {data.baseline.map((base) => {
                const scen =
                  data.scenario.find((s) => s.horizon === base.horizon) ?? base;
                const delta = scen.expected_cases - base.expected_cases;
                return (
                  <tr key={base.horizon}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-navy tnum">
                      +{base.horizon}w
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink tnum">
                      {base.target_week}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate tnum">
                      {base.expected_cases.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <RiskTierBadge tier={base.tier} size="sm" lang={lang} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink tnum">
                      {scen.expected_cases.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-slate">
                        ({scen.p10.toFixed(1)}–{scen.p90.toFixed(1)})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-navy tnum">
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <RiskTierBadge tier={scen.tier} size="sm" lang={lang} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
