"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { isUnknownWardError, type LagPoint } from "@/lib/api/client";
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
import { WardNotFoundCard } from "@/components/ui/WardNotFoundCard";
import type { Lang } from "@/lib/i18n";
import { useWardLagsQuery } from "../hooks";
import { LagsCorrelationChart } from "./LagsCorrelationChart";
import { LagsSeriesChart, type ShiftedPoint } from "./LagsSeriesChart";

export interface LagsPanelProps {
  wardId: string;
  unknownWardId: string | null;
  lang?: Lang;
  onResetUnknownWard: () => void;
}

const LAG_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

function buildShiftedSeries(series: readonly LagPoint[], lagWeeks: number): ShiftedPoint[] {
  return series.map((pt, index) => {
    const srcIdx = index - lagWeeks;
    const src = srcIdx >= 0 ? series[srcIdx] : null;
    return {
      week: pt.week,
      shortWeek: pt.week.slice(2),
      dengueCases: pt.dengue_cases,
      observedRain: pt.rainfall_mm,
      shiftedRain: src ? src.rainfall_mm : null,
      rainSourceWeek: src ? src.week : null,
    };
  });
}

export function LagsPanel({
  wardId,
  unknownWardId,
  lang = "en",
  onResetUnknownWard,
}: LagsPanelProps) {
  const [lagWeeks, setLagWeeks] = useState<number>(3);
  const [windowWeeks, setWindowWeeks] = useState<number>(52);

  const lagsQuery = useWardLagsQuery(wardId, 156, !unknownWardId && Boolean(wardId));

  const shiftedSeries = useMemo(() => {
    const raw = lagsQuery.data?.series ?? [];
    const shifted = buildShiftedSeries(raw, lagWeeks);
    if (shifted.length <= windowWeeks) return shifted;
    return shifted.slice(shifted.length - windowWeeks);
  }, [lagsQuery.data?.series, lagWeeks, windowWeeks]);

  if (unknownWardId) {
    return (
      <WardNotFoundCard
        wardId={unknownWardId}
        onReset={onResetUnknownWard}
        lang={lang}
      />
    );
  }

  if (lagsQuery.isError) {
    if (isUnknownWardError(lagsQuery.error)) {
      return (
        <WardNotFoundCard
          detail={lagsQuery.error.detail ?? lagsQuery.error.title}
          onReset={onResetUnknownWard}
          lang={lang}
        />
      );
    }

    return (
      <ErrorBanner
        testId="lags-error-banner"
        retryTestId="lags-retry"
        title="Could not load rainfall lag analysis"
        error={lagsQuery.error}
        onRetry={() => {
          void lagsQuery.refetch();
        }}
      />
    );
  }

  if (lagsQuery.isPending) {
    return (
      <PanelSkeleton
        testId="lags-loading"
        label="Loading rainfall lag history…"
      />
    );
  }

  const data = lagsQuery.data;
  if (!data || data.series.length === 0) {
    return (
      <EmptyState
        testId="lags-empty-state"
        title="No weekly weather and case observations found"
        description="This ward has no weekly rainfall or case series available to compute lag correlations."
      />
    );
  }

  const selectedCorr = data.correlations.find((c) => c.lag_weeks === lagWeeks);
  const peakDatasetCorr = data.correlations.find(
    (c) => c.lag_weeks === data.peak_lag_dataset,
  );
  const peakWardCorr = data.correlations.find((c) => c.lag_weeks === data.peak_lag_ward);
  const latestAligned = shiftedSeries[shiftedSeries.length - 1] ?? null;

  return (
    <div data-testid="lags-panel" className="space-y-5">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              Rainfall lag shift — <span className="font-mono tnum">{data.ward_id}</span> ({data.city})
            </CardTitle>
            <CardDescription>
              Across all 60 wards, deseasonalized rainfall aligns strongest with dengue cases{" "}
              {data.peak_lag_dataset} weeks later, giving health teams a 2–3 week window to larvicide before cases peak.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Series display length">
            {[52, 104, 156].map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={windowWeeks === w}
                onClick={() => setWindowWeeks(w)}
                className={clsx(
                  "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs tnum",
                  windowWeeks === w
                    ? "border-royal bg-royal font-semibold text-white"
                    : "border-mist bg-white text-slate hover:text-ink",
                )}
              >
                {w}w
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <SliderField
              id="lag-shift-slider"
              label="Shift rainfall forward (weeks)"
              min={0}
              max={data.max_lag}
              step={1}
              value={lagWeeks}
              onChange={setLagWeeks}
              valueLabel={`+${lagWeeks} week${lagWeeks === 1 ? "" : "s"}`}
              minLabel="0w (same week)"
              maxLabel={`${data.max_lag}w lag`}
              testId="lag-slider"
              ariaValueText={`Rainfall shifted forward by ${lagWeeks} weeks`}
            />

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick lag presets">
              {LAG_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  data-testid={`lag-btn-${k}`}
                  aria-pressed={lagWeeks === k}
                  onClick={() => setLagWeeks(k)}
                  className={clsx(
                    "min-h-9 min-w-10 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                    lagWeeks === k
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  {k}w
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="lag-shift-summary"
            aria-live="polite"
            className="rounded-md border border-mist bg-paper px-4 py-3 text-sm text-ink"
          >
            {latestAligned && latestAligned.rainSourceWeek && latestAligned.shiftedRain !== null ? (
              <p
                data-testid="lag-shifted-sample"
                data-lag={String(lagWeeks)}
                data-case-week={latestAligned.week}
                data-rain-source-week={latestAligned.rainSourceWeek}
                data-shifted-rain={latestAligned.shiftedRain.toFixed(1)}
              >
                Rainfall shifted{" "}
                <strong className="font-mono text-navy tnum">+{lagWeeks} weeks</strong>: rain
                observed on{" "}
                <strong className="font-mono text-navy tnum">
                  {latestAligned.rainSourceWeek}
                </strong>{" "}
                (
                <span className="font-mono tnum">
                  {latestAligned.shiftedRain.toFixed(1)} mm
                </span>
                ) aligns with cases on{" "}
                <strong className="font-mono text-navy tnum">{latestAligned.week}</strong> (
                <span className="font-mono tnum">{latestAligned.dengueCases} cases</span>).
              </p>
            ) : (
              <p>Select a lag between 0 and {data.max_lag} weeks to align rainfall with dengue cases.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-mist bg-white p-3.5">
              <p className="text-xs font-semibold text-slate">Dataset peak lag (60 wards)</p>
              <p
                data-testid="lags-peak-dataset"
                className="mt-1 font-mono text-lg font-bold text-navy tnum"
              >
                Lag {data.peak_lag_dataset}w{" "}
                <span className="text-sm font-medium text-royal">
                  (r = {peakDatasetCorr ? peakDatasetCorr.dataset_corr.toFixed(2) : "—"})
                </span>
              </p>
            </div>

            <div className="rounded-md border border-mist bg-white p-3.5">
              <p className="text-xs font-semibold text-slate">Selected ward peak lag</p>
              <p
                data-testid="lags-peak-ward"
                className="mt-1 font-mono text-lg font-bold text-navy tnum"
              >
                Lag {data.peak_lag_ward}w{" "}
                <span className="text-sm font-medium text-slate">
                  (r = {peakWardCorr ? peakWardCorr.ward_corr.toFixed(2) : "—"})
                </span>
              </p>
            </div>

            <div className="rounded-md border border-mist bg-white p-3.5">
              <p className="text-xs font-semibold text-slate">
                Correlation at selected lag (+{lagWeeks}w)
              </p>
              <p
                data-testid="lags-selected-corr"
                className="mt-1 font-mono text-lg font-bold text-navy tnum"
              >
                Ward {selectedCorr ? selectedCorr.ward_corr.toFixed(2) : "—"} · All{" "}
                {selectedCorr ? selectedCorr.dataset_corr.toFixed(2) : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <LagsSeriesChart shiftedSeries={shiftedSeries} lagWeeks={lagWeeks} />

      <LagsCorrelationChart
        wardId={data.ward_id}
        peakLagDataset={data.peak_lag_dataset}
        correlations={data.correlations}
      />
    </div>
  );
}
