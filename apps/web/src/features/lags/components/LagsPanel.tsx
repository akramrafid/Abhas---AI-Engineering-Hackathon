"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { useWardLagsQuery } from "../hooks";

export interface LagsPanelProps {
  wardId: string;
  unknownWardId: string | null;
  onResetUnknownWard: () => void;
}

interface ShiftedPoint {
  week: string;
  shortWeek: string;
  dengueCases: number;
  observedRain: number;
  shiftedRain: number | null;
  rainSourceWeek: string | null;
}

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

const LAG_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export function LagsPanel({
  wardId,
  unknownWardId,
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
      <div
        data-testid="ward-not-found"
        role="alert"
        className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
      >
        <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
        <p className="text-sm text-slate">
          No rainfall lag series exists for{" "}
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

  if (lagsQuery.isError) {
    if (isUnknownWardError(lagsQuery.error)) {
      return (
        <div
          data-testid="ward-not-found"
          role="alert"
          className="rounded-lg border border-risk-high bg-white p-6 space-y-3"
        >
          <h2 className="font-sans text-lg font-bold text-navy">Ward not found</h2>
          <p className="text-sm text-slate">{lagsQuery.error.detail ?? lagsQuery.error.title}</p>
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
      {/* Controls & Peak Summary */}
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              Rainfall lag shift — <span className="font-mono tnum">{data.ward_id}</span> ({data.city})
            </CardTitle>
            <CardDescription>
              Shift observed weekly rainfall forward by k weeks to inspect alignment with dengue cases.
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

      {/* Aligned Time-Series Chart */}
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
              <span className="h-3 w-3 rounded-xs border border-royal bg-forecast-band" aria-hidden="true" />
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
                data={shiftedSeries}
                margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="shortWeek"
                  tick={{ fill: "var(--color-slate)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--color-mist)" }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="rain"
                  orientation="left"
                  tick={{ fill: "var(--color-slate)", fontSize: 11, fontFamily: "var(--font-mono)" }}
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
                  tick={{ fill: "var(--color-navy)", fontSize: 11, fontFamily: "var(--font-mono)" }}
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

      {/* Deseasonalized Lag Correlation Bar Chart (0-8 weeks) */}
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Deseasonalized rain–case correlation by lag (0–8 weeks)</CardTitle>
            <CardDescription>
              Pearson correlation after removing ward × ISO-week seasonality; lag {data.peak_lag_dataset} is highlighted.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-royal" aria-hidden="true" />
              Dataset peak (lag {data.peak_lag_dataset}w)
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
                data={data.correlations}
                margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid stroke="var(--color-mist)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="lag_weeks"
                  tickFormatter={(v: number) => `${v}w`}
                  tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--color-mist)" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[-0.2, 0.65]}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  tick={{ fill: "var(--color-slate)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <ReferenceLine y={0} stroke="var(--color-mist)" />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    typeof value === "number" ? value.toFixed(3) : String(value ?? ""),
                    name === "dataset_corr" ? "Dataset (60 wards)" : `${data.ward_id}`,
                  ]}
                  labelFormatter={(lag: unknown) => `Lag ${String(lag ?? "")} weeks`}
                />
                <Bar
                  dataKey="dataset_corr"
                  name="dataset_corr"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {data.correlations.map((entry) => (
                    <Cell
                      key={`ds-${entry.lag_weeks}`}
                      fill={
                        entry.lag_weeks === data.peak_lag_dataset
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
    </div>
  );
}
