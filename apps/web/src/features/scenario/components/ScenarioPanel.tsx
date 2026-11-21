"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isUnknownWardError,
  type HorizonForecast,
  type RiskTier,
  type WeatherOverride,
} from "@/lib/api/client";
import { DEMO_CONFIG } from "@/lib/demo-config";
import type { Lang } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { WardNotFoundCard } from "@/components/ui/WardNotFoundCard";
import { useScenarioRunner } from "../hooks";
import { ScenarioComparisonView } from "./ScenarioComparisonView";
import { ScenarioControlsForm } from "./ScenarioControlsForm";

export interface ScenarioPanelProps {
  wardId: string;
  originWeek: string;
  unknownWardId: string | null;
  onResetUnknownWard: () => void;
  isDemoBaseline?: boolean;
  lang?: Lang;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

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
  lang = "en",
}: ScenarioPanelProps) {
  const [rainInput, setRainInput] = useState<string>("");
  const [tempInput, setTempInput] = useState<string>("");
  const [humidityInput, setHumidityInput] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, error, isLoading, run, reset } = useScenarioRunner();

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

  if (unknownWardId) {
    return (
      <WardNotFoundCard
        wardId={unknownWardId}
        onReset={onResetUnknownWard}
        lang={lang}
      />
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

  return (
    <div data-testid="scenario-panel" className="space-y-5">
      <ScenarioControlsForm
        wardId={wardId}
        originWeek={originWeek}
        isDemoBaseline={isDemoBaseline}
        rainInput={rainInput}
        tempInput={tempInput}
        humidityInput={humidityInput}
        sliderValue={sliderValue}
        validationError={validationError}
        isLoading={isLoading}
        onRainTextChange={(raw) => {
          setRainInput(raw);
          if (raw.trim() === "") {
            setValidationError(null);
            return;
          }
          const check = validateWeatherInputs(raw, tempInput, humidityInput);
          setValidationError(check.valid ? null : check.message);
        }}
        onTempChange={(raw) => {
          setTempInput(raw);
          const check = validateWeatherInputs(rainInput, raw, humidityInput);
          setValidationError(
            check.valid || (!rainInput && !raw && !humidityInput) ? null : check.message,
          );
        }}
        onHumidityChange={(raw) => {
          setHumidityInput(raw);
          const check = validateWeatherInputs(rainInput, tempInput, raw);
          setValidationError(
            check.valid || (!rainInput && !tempInput && !raw) ? null : check.message,
          );
        }}
        onSliderChange={(mm) => {
          const nextRain = String(mm);
          setRainInput(nextRain);
          setValidationError(null);
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            executeScenario(nextRain, tempInput, humidityInput);
          }, 200);
        }}
        onPresetClick={(mm) => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          const nextRain = String(mm);
          setRainInput(nextRain);
          executeScenario(nextRain, tempInput, humidityInput);
        }}
        onSubmit={() => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          executeScenario(rainInput, tempInput, humidityInput);
        }}
      />

      {error ? (
        isUnknownWardError(error) ? (
          <WardNotFoundCard
            detail={error.detail ?? error.title}
            onReset={onResetUnknownWard}
            lang={lang}
          />
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

      {isLoading ? (
        <PanelSkeleton
          testId="scenario-loading"
          label="Computing scenario forecast…"
        />
      ) : null}

      {!isLoading && !error && !data ? (
        <EmptyState
          testId="scenario-empty-state"
          title="No scenario run yet"
          description="Enter a rainfall value between 0 and 500 mm or choose a monsoon preset to compare baseline and what-if risk across weeks 1–4."
          actionLabel="Test 120 mm monsoon burst"
          actionTestId="scenario-empty-cta"
          onAction={() => {
            const nextRain = String(DEMO_CONFIG.scenarioRainfallMm);
            setRainInput(nextRain);
            executeScenario(nextRain, tempInput, humidityInput);
          }}
        />
      ) : null}

      {!isLoading && !error && data && baselineH3 && scenarioH3 && baselinePeakTier && scenarioPeakTier ? (
        <ScenarioComparisonView
          data={data}
          baselineH3={baselineH3}
          scenarioH3={scenarioH3}
          baselinePeakTier={baselinePeakTier}
          scenarioPeakTier={scenarioPeakTier}
          lang={lang}
        />
      ) : null}
    </div>
  );
}
