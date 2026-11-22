"use client";

import { clsx } from "clsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { SliderField } from "@/components/ui/Slider";
import { getIsoWeekInfo } from "@/lib/dates";

const PRESETS = [
  { mm: 0, label: "Dry week 0 mm", testId: "scenario-preset-0" },
  { mm: 60, label: "Moderate 60 mm", testId: "scenario-preset-60" },
  { mm: 120, label: "Monsoon burst 120 mm", testId: "scenario-preset-120" },
  { mm: 250, label: "Extreme 250 mm", testId: "scenario-preset-250" },
] as const;

export interface ScenarioControlsFormProps {
  wardId: string;
  originWeek: string;
  isDemoBaseline: boolean;
  rainInput: string;
  tempInput: string;
  humidityInput: string;
  sliderValue: number;
  validationError: string | null;
  isLoading: boolean;
  onRainTextChange: (value: string) => void;
  onTempChange: (value: string) => void;
  onHumidityChange: (value: string) => void;
  onSliderChange: (mm: number) => void;
  onPresetClick: (mm: number) => void;
  onSubmit: () => void;
}

export function ScenarioControlsForm({
  wardId,
  originWeek,
  isDemoBaseline,
  rainInput,
  tempInput,
  humidityInput,
  sliderValue,
  validationError,
  isLoading,
  onRainTextChange,
  onTempChange,
  onHumidityChange,
  onSliderChange,
  onPresetClick,
  onSubmit,
}: ScenarioControlsFormProps) {
  const originInfo = getIsoWeekInfo(originWeek);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            What-if weather scenario —{" "}
            <span className="font-mono tnum">{wardId}</span> · Origin{" "}
            <span className="font-mono tnum">
              {originInfo ? `${originInfo.shortLabel} (${originWeek})` : originWeek}
            </span>
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
            onSubmit();
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
              onChange={onSliderChange}
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
                aria-describedby={
                  validationError ? "scenario-validation-msg" : "scenario-range-hint"
                }
                onChange={(e) => onRainTextChange(e.target.value)}
                className={clsx(
                  "min-h-10 rounded-md border bg-white px-3 py-1.5 font-mono text-sm text-ink tnum",
                  validationError
                    ? "border-risk-high"
                    : "border-mist focus-visible:border-royal",
                )}
              />
              <span id="scenario-range-hint" className="text-[11px] text-slate">
                Valid range: 0–500 mm
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-4">
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Rainfall presets"
            >
              {PRESETS.map((preset) => (
                <button
                  key={preset.mm}
                  type="button"
                  data-testid={preset.testId}
                  onClick={() => onPresetClick(preset.mm)}
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
                onChange={(e) => onTempChange(e.target.value)}
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
                onChange={(e) => onHumidityChange(e.target.value)}
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
  );
}
