"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
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
import {
  isUnknownWardError,
  type HorizonForecast,
  type RiskTier,
  type WeatherOverride,
} from "@/lib/api/client";
import { DEMO_CONFIG } from "@/lib/demo-config";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
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
import { SliderField } from "@/components/ui/Slider";
import { useScenarioRunner } from "../hooks";

export interface ScenarioPanelProps {
  wardId: string;
  originWeek: string;
  unknownWardId: string | null;
  onResetUnknownWard: () => void;
  isDemoBaseline?: boolean;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

const PRESETS = [
  { mm: 0, label: "0 mm (Dry)", testId: "scenario-preset-0" },
  { mm: 60, label: "60 mm (Moderate)", testId: "scenario-preset-60" },
  { mm: 120, label: "120 mm (Heavy rain)", testId: "scenario-preset-120" },
  { mm: 250, label: "250 mm (Extreme)", testId: "scenario-preset-250" },
] as const;

function peakTierOf(horizons: readonly HorizonForecast[]): RiskTier {
  return horizons.reduce<RiskTier>(
    (best, cur) => (TIER_RANK[cur.tier] > TIER_RANK[best] ? cur.tier : best),
    "Low",
  );
}

interface ValidationResult {
  valid: boolean;
  message: string | null;
  override: WeatherOverride | null;
}

function validateWeatherInputs(
  rainText: string,
  tempText: string,
  humidityText: string,
): ValidationResult {
  const trimmedRain = rainText.trim();
  const trimmedTemp = tempText.trim();
  const trimmedHum = humidityText.trim();

  if (!trimmedRain && !trimmedTemp && !trimmedHum) {
    return {
      valid: false,
      message: "Enter a rainfall value between 0 and 500 mm (or choose a preset).",
      override: null,
    };
  }

  const override: WeatherOverride = {};

  if (trimmedRain !== "") {
    const val = Number(trimmedRain);
    if (!Number.isFinite(val) || val < 0 || val > 500) {
      return {
        valid: false,
        message: "Rainfall must be between 0 and 500 mm.",
        override: null,
      };
    }
    override.rainfall_mm = val;
  }

  if (trimmedTemp !== "") {
    const val = Number(trimmedTemp);
    if (!Number.isFinite(val) || val < 5 || val > 45) {
      return {
        valid: false,
        message: "Average temperature must be between 5 and 45 °C.",
        override: null,
      };
    }
    override.avg_temp_c = val;
  }

  if (trimmedHum !== "") {
    const val = Number(trimmedHum);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      return {
        valid: false,
        message: "Relative humidity must be between 0 and 100 %.",
        override: null,
      };
    }
    override.relative_humidity_pct = val;
  }

  return { valid: true, message: null, override };
}

export function ScenarioPanel({
  wardId,
  originWeek,
  unknownWardId,
  onResetUnknownWard,
  isDemoBaseline = false,
}: ScenarioPanelProps) {
  const [rainInput, setRainInput] = useState<string>("");
  const [tempInput, setTempInput] = useState<string>("");
  const [humidityInput, setHumidityInput] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, error, isLoading, run, reset } = useScenarioRunner();

  // Clear previous ward/week scenario result when context changes.
  useEffect(() => {
    reset();
  }, [wardId, originWeek, reset]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const executeScenario = useCallback(
    (rainText: string, tempText: string, humText: string) => {
      if (!wardId || !originWeek || unknownWardId) return;
      const check = validateWeatherInputs(rainText, tempText, humText);
      if (!check.valid || !check.override) {
        setValidationError(check.message);
        return;
      }
      setValidationError(null);
      void run({
        ward_id: wardId,
        origin_week: originWeek,
        horizons: [1, 2, 3, 4],
        weather: check.override,
      });
    },
    [wardId, originWeek, unknownWardId, run],
  );

  const handleSliderChange = (mm: number) => {
    const nextRain = String(mm);
    setRainInput(nextRain);
    setValidationError(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeScenario(nextRain, tempInput, humidityInput);
    }, 200);
  };

  const handlePresetClick = (mm: number) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const nextRain = String(mm);
    setRainInput(nextRain);
    executeScenario(nextRain, tempInput, humidityInput);
  };

  const handleRainTextChange = (raw: string) => {
    setRainInput(raw);
    if (raw.trim() === "") {
      setValidationError(null);
      return;
    }
    const check = validateWeatherInputs(raw, tempInput, humidityInput);
    setValidationError(check.valid ? null : check.message);
  };

  if (unknownWardId) {
    return (
      <div
        data-testid="ward-not-found"
        role="alert"
        className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
      >
        <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
        <p className="text-sm text-slate">
          Cannot run a weather scenario for unknown ward{" "}
          <code className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">
            {unknownWardId}
          </code>
          .
        </p>
        <button
          type="button"
          data-testid="ward-not-found-reset"
          onClick={onResetUnknownWard}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
        >
          Select Dhaka South default ward
        </button>
      </div>
    );
  }

  const parsedRain = Number(rainInput);
  const sliderValue =
    rainInput.trim() !== "" && Number.isFinite(parsedRain)
      ? Math.max(0, Math.min(500, parsedRain))
      : DEMO_CONFIG.scenarioRainfallMm;

  const baselineH3 = data?.baseline.find((h) => h.horizon === 3) ?? data?.baseline[0] ?? null;
  const scenarioH3 = data?.scenario.find((h) => h.horizon === 3) ?? data?.scenario[0] ?? null;
  const baselinePeakTier = data ? peakTierOf(data.baseline) : null;
  const scenarioPeakTier = data ? peakTierOf(data.scenario) : null;

  const chartData = data
    ? data.baseline.map((base) => {
        const scen = data.scenario.find((s) => s.horizon === base.horizon) ?? base;
        return {
          label: `+${base.horizon}w (${base.target_week.slice(5)})`,
          baseline: base.expected_cases,
          scenario: scen.expected_cases,
          bandBase: scen.p10,
          bandSpan: Math.max(0, scen.p90 - scen.p10),
        };
      })
    : [];

  return (
    <div data-testid="scenario-panel" className="space-y-5">
      {/* Scenario Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              What-if weather scenario —{" "}
              <span className="font-mono tnum">{wardId}</span> · Origin{" "}
              <span className="font-mono tnum">{originWeek}</span>
            </CardTitle>
            {isDemoBaseline ? (
              <span
                data-testid="scenario-demo-baseline-note"
                className="inline-flex items-center rounded-sm border border-mist bg-paper px-2.5 py-0.5 font-mono text-xs font-medium text-navy tnum"
              >
                Demo dry-week baseline (10.3 mm observed)
              </span>
            ) : null}
          </div>
          <CardDescription>
            Override this week&apos;s rainfall (0–500 mm) to test how heavy monsoon rain shifts expected cases and risk tier 2–4 weeks ahead.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              executeScenario(rainInput, tempInput, humidityInput);
            }}
            noValidate
            className="space-y-5"
          >
            <div className="grid gap-5 lg:grid-cols-[1fr_200px] lg:items-end">
              <SliderField
                id="scenario-rain-slider"
                label="Origin-week rainfall (mm)"
                min={0}
                max={500}
                step={5}
                value={sliderValue}
                onChange={handleSliderChange}
                valueLabel={`${rainInput.trim() === "" ? "—" : rainInput} mm`}
                minLabel="0 mm"
                maxLabel="500 mm"
                testId="scenario-rain-slider"
                ariaValueText={`${sliderValue} millimetres`}
              />

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="scenario-rain-input"
                  className="text-xs font-semibold text-slate"
                >
                  Rainfall input (0–500 mm)
                </label>
                <input
                  id="scenario-rain-input"
                  data-testid="scenario-rain-input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={rainInput}
                  placeholder="e.g. 120"
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={validationError ? "scenario-validation-msg" : "scenario-range-hint"}
                  onChange={(e) => handleRainTextChange(e.target.value)}
                  className={clsx(
                    "min-h-10 rounded-md border bg-white px-3 py-1.5 font-mono text-sm text-ink tnum",
                    validationError ? "border-risk-high" : "border-mist focus-visible:border-royal",
                  )}
                />
                <span id="scenario-range-hint" className="text-[11px] text-slate">
                  Valid range: 0–500 mm
                </span>
              </div>
            </div>

            {/* Quick Presets + Optional Temp/Humidity + Submit */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-4">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rainfall presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.mm}
                    type="button"
                    data-testid={preset.testId}
                    onClick={() => handlePresetClick(preset.mm)}
                    className={clsx(
                      "min-h-9 cursor-pointer rounded-md border px-3 font-mono text-xs font-semibold tnum",
                      rainInput === String(preset.mm)
                        ? "border-royal bg-royal text-white"
                        : "border-mist bg-paper text-navy hover:bg-white",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                data-testid="scenario-submit"
                disabled={isLoading}
                className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-5 py-2 text-sm font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Running scenario…" : "Run scenario"}
              </button>
            </div>

            {/* Optional temperature & humidity overrides */}
            <div className="grid gap-4 border-t border-mist pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="scenario-temp-input"
                  className="text-xs font-semibold text-slate"
                >
                  Optional avg temperature (5–45 °C)
                </label>
                <input
                  id="scenario-temp-input"
                  data-testid="scenario-temp-input"
                  type="number"
                  step="0.5"
                  value={tempInput}
                  placeholder="Keep observed"
                  onChange={(e) => {
                    setTempInput(e.target.value);
                    const check = validateWeatherInputs(rainInput, e.target.value, humidityInput);
                    setValidationError(check.valid || (!rainInput && !e.target.value && !humidityInput) ? null : check.message);
                  }}
                  className="min-h-10 rounded-md border border-mist bg-white px-3 py-1.5 font-mono text-sm text-ink tnum"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="scenario-humidity-input"
                  className="text-xs font-semibold text-slate"
                >
                  Optional relative humidity (0–100 %)
                </label>
                <input
                  id="scenario-humidity-input"
                  data-testid="scenario-humidity-input"
                  type="number"
                  step="1"
                  value={humidityInput}
                  placeholder="Keep observed"
                  onChange={(e) => {
                    setHumidityInput(e.target.value);
                    const check = validateWeatherInputs(rainInput, tempInput, e.target.value);
                    setValidationError(check.valid || (!rainInput && !tempInput && !e.target.value) ? null : check.message);
                  }}
                  className="min-h-10 rounded-md border border-mist bg-white px-3 py-1.5 font-mono text-sm text-ink tnum"
                />
              </div>
            </div>

            {validationError ? (
              <div
                id="scenario-validation-msg"
                role="alert"
                data-testid="scenario-validation-error"
                className="rounded-md border border-risk-high bg-paper px-4 py-2.5 text-sm font-medium text-ink"
              >
                {validationError}
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* API Error State (including 422 problem+json) */}
      {error ? (
        isUnknownWardError(error) ? (
          <div
            data-testid="ward-not-found"
            role="alert"
            className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
          >
            <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
            <p className="text-sm text-slate">{error.detail ?? error.title}</p>
            <button
              type="button"
              data-testid="ward-not-found-reset"
              onClick={onResetUnknownWard}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
            >
              Select Dhaka South default ward
            </button>
          </div>
        ) : (
          <ErrorBanner
            testId="scenario-error-banner"
            retryTestId="scenario-retry"
            title="Scenario forecast failed"
            error={error}
            onRetry={() => executeScenario(rainInput, tempInput, humidityInput)}
          />
        )
      ) : null}

      {/* Loading State */}
      {isLoading ? (
        <PanelSkeleton
          testId="scenario-loading"
          label="Computing scenario forecast…"
        />
      ) : null}

      {/* Empty State */}
      {!isLoading && !error && !data ? (
        <EmptyState
          testId="scenario-empty-state"
          title="No scenario run yet"
          description="Enter a rainfall value between 0 and 500 mm or choose a monsoon preset to compare baseline and what-if risk across weeks 1–4."
          actionLabel="Test 120 mm heavy rain"
          actionTestId="scenario-empty-cta"
          onAction={() => handlePresetClick(DEMO_CONFIG.scenarioRainfallMm)}
        />
      ) : null}

      {/* Success State: Side-by-Side Comparison */}
      {!isLoading && !error && data && baselineH3 && scenarioH3 && baselinePeakTier && scenarioPeakTier ? (
        <div data-testid="scenario-comparison" aria-live="polite" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="scenario-baseline-card">
              <CardHeader className="flex-row items-center justify-between gap-2 bg-paper">
                <div>
                  <CardTitle className="text-sm">Baseline (observed weather)</CardTitle>
                  <CardDescription className="font-mono text-xs tnum">
                    {data.ward_id} · {data.origin_week}
                  </CardDescription>
                </div>
                <RiskTierBadge tier={baselinePeakTier} size="md" />
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
                <RiskTierBadge tier={scenarioPeakTier} size="md" />
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
                    {scenarioH3.expected_cases - baselineH3.expected_cases >= 0 ? "+" : ""}
                    {(scenarioH3.expected_cases - baselineH3.expected_cases).toFixed(2)} vs baseline
                  </span>
                </div>
                <p className="font-mono text-xs text-slate tnum">
                  80% band: {scenarioH3.p10.toFixed(1)} – {scenarioH3.p90.toFixed(1)} · Risk score{" "}
                  {scenarioH3.risk_score}/100
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Chart */}
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
                  <span className="h-0.5 w-4 border-t-2 border-dashed border-slate" aria-hidden="true" />
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
                    margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                      axisLine={{ stroke: "var(--color-mist)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
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

          {/* Horizon Delta Table */}
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
                    const scen = data.scenario.find((s) => s.horizon === base.horizon) ?? base;
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
                          <RiskTierBadge tier={base.tier} size="sm" />
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
                          <RiskTierBadge tier={scen.tier} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
