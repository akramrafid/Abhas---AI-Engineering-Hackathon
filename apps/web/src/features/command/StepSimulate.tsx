"use client";

import { useMemo, useState } from "react";
import { Info, Minus, Plus, X } from "@/components/icons";
import { clsx } from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { SliderField } from "@/components/ui/Slider";
import type { ApiError, Ward } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import type { Deployment, EfficacyPreset, SimulatorResponse } from "./api";

export interface StepSimulateProps {
  wards: readonly Ward[];
  mode: "manual" | "auto";
  deployments: readonly Deployment[];
  autoCrews: number;
  efficacy: EfficacyPreset;
  lang: Lang;
  data: SimulatorResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onModeChange: (mode: "manual" | "auto") => void;
  onDeploymentsChange: (next: Deployment[]) => void;
  onAutoCrewsChange: (crews: number) => void;
  onEfficacyChange: (preset: EfficacyPreset) => void;
}

const EFFICACY_OPTIONS: ReadonlyArray<{
  id: EfficacyPreset;
  label: string;
  params: string;
}> = [
  { id: "low", label: "Low", params: "Emax 0.25 · k 0.35" },
  { id: "base", label: "Base", params: "Emax 0.40 · k 0.50" },
  { id: "high", label: "High", params: "Emax 0.55 · k 0.70" },
];

export function StepSimulate({
  wards,
  mode,
  deployments,
  autoCrews,
  efficacy,
  lang,
  data,
  isPending,
  isFetching,
  isError,
  error,
  onRetry,
  onModeChange,
  onDeploymentsChange,
  onAutoCrewsChange,
  onEfficacyChange,
}: StepSimulateProps) {
  const bn = lang === "bn";
  const deployedIds = useMemo(
    () => new Set(deployments.map((d) => d.ward_id)),
    [deployments],
  );
  const availableToAdd = useMemo(
    () => wards.filter((w) => !deployedIds.has(w.ward_id)),
    [wards, deployedIds],
  );
  const [wardToAdd, setWardToAdd] = useState<string>("");

  const effectiveWardToAdd =
    wardToAdd && availableToAdd.some((w) => w.ward_id === wardToAdd)
      ? wardToAdd
      : availableToAdd[0]?.ward_id ?? "";

  const chartData = useMemo(() => {
    const byHorizon = new Map<
      number,
      { horizon: number; label: string; baseline: number; counterfactual: number }
    >();
    for (const h of [2, 3, 4]) {
      byHorizon.set(h, {
        horizon: h,
        label: `Horizon +${h}w`,
        baseline: 0,
        counterfactual: 0,
      });
    }
    for (const ward of data?.wards ?? []) {
      for (const h of ward.horizons) {
        const entry = byHorizon.get(h.horizon);
        if (entry) {
          entry.baseline = Number((entry.baseline + h.baseline_cases).toFixed(2));
          entry.counterfactual = Number(
            (entry.counterfactual + h.counterfactual_cases).toFixed(2),
          );
        }
      }
    }
    return [2, 3, 4].map((h) => byHorizon.get(h)!);
  }, [data?.wards]);

  const handleAddWard = () => {
    if (!effectiveWardToAdd || deployedIds.has(effectiveWardToAdd)) return;
    onDeploymentsChange([...deployments, { ward_id: effectiveWardToAdd, crews: 2 }]);
  };

  const handleUpdateCrews = (wardId: string, nextCrews: number) => {
    const clamped = Math.max(1, Math.min(20, Math.round(nextCrews)));
    onDeploymentsChange(
      deployments.map((d) => (d.ward_id === wardId ? { ...d, crews: clamped } : d)),
    );
  };

  const handleRemoveWard = (wardId: string) => {
    if (deployments.length <= 1) return;
    onDeploymentsChange(deployments.filter((d) => d.ward_id !== wardId));
  };

  return (
    <div data-testid="command-panel-4" className="space-y-5">
      {/* Deployment mode & efficacy controls */}
      <Card>
        <CardHeader>
          <CardTitle className={bn ? "font-bangla" : undefined}>
            {bn
              ? "ধাপ ৪ · ভেক্টর নিয়ন্ত্রণ কাউন্টারফ্যাকচুয়াল সিমুলেটর"
              : "Step 4 · Vector-control counterfactual simulator & ROI ranking"}
          </CardTitle>
          <CardDescription className={bn ? "font-bangla" : undefined}>
            {bn
              ? "ম্যানুয়ালি ওয়ার্ডে দল দিন অথবা স্বয়ংক্রিয়ভাবে Nটি দল বসিয়ে প্রতিরোধযোগ্য রোগী ও সংবেদনশীলতা পরিসর দেখুন।"
              : "Compare manual ward crew deployments against greedy auto-placement. Counterfactual cases are re-predicted at feature level across horizons h = 2, 3, 4."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-navy">
                Placement mode
              </span>
              <div
                role="group"
                aria-label="Crew placement mode"
                className="inline-flex rounded-lg border border-mist bg-paper p-1"
              >
                <button
                  type="button"
                  data-testid="sim-mode-manual"
                  aria-pressed={mode === "manual"}
                  onClick={() => onModeChange("manual")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors",
                    mode === "manual"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  Manual ward deployments
                </button>
                <button
                  type="button"
                  data-testid="sim-mode-auto"
                  aria-pressed={mode === "auto"}
                  onClick={() => onModeChange("auto")}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors",
                    mode === "auto"
                      ? "bg-royal text-white"
                      : "text-navy hover:bg-white",
                  )}
                >
                  Auto-place N crews
                </button>
              </div>
            </div>

            {/* Efficacy preset selector */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-navy">
                Efficacy preset
              </span>
              <div
                role="group"
                aria-label="Vector-control efficacy preset"
                className="inline-flex flex-wrap gap-1.5"
              >
                {EFFICACY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`sim-efficacy-${opt.id}`}
                    aria-pressed={efficacy === opt.id}
                    onClick={() => onEfficacyChange(opt.id)}
                    className={clsx(
                      "min-h-9 cursor-pointer rounded-lg border px-3 py-1 text-xs font-semibold transition-colors",
                      efficacy === opt.id
                        ? "border-royal bg-royal text-white"
                        : "border-mist bg-white text-navy hover:border-royal",
                    )}
                  >
                    {opt.label}{" "}
                    <span className="font-mono text-[11px] font-normal tnum">
                      ({opt.params})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mode-specific controls */}
          {mode === "manual" ? (
            <div className="space-y-3 rounded-xl border border-mist bg-paper/50 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-navy">
                    Treated wards ({deployments.length})
                  </h3>
                  <p className="text-xs text-slate">
                    Adjust 1–5 crews per ward (up to 20 max) to inspect marginal ROI.
                  </p>
                </div>
                {availableToAdd.length > 0 ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sim-add-ward-select"
                        className="text-[11px] font-semibold text-slate"
                      >
                        Add ward
                      </label>
                      <select
                        id="sim-add-ward-select"
                        data-testid="sim-add-ward-select"
                        value={effectiveWardToAdd}
                        onChange={(e) => setWardToAdd(e.target.value)}
                        className="min-h-9 rounded-lg border border-mist bg-white px-2.5 text-xs font-medium text-navy focus-visible:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                      >
                        {availableToAdd.map((w) => (
                          <option key={w.ward_id} value={w.ward_id}>
                            {w.ward_id} ({w.city})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      data-testid="sim-add-ward-btn"
                      onClick={handleAddWard}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg bg-royal px-3 text-xs font-semibold text-white hover:bg-navy"
                    >
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                      <span>Add ward</span>
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {deployments.map((d) => {
                  const wardMeta = wards.find((w) => w.ward_id === d.ward_id);
                  return (
                    <div
                      key={d.ward_id}
                      data-testid={`sim-deployment-${d.ward_id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-mist bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-navy tnum">
                          {d.ward_id}
                        </p>
                        <p className="truncate text-[11px] text-slate">
                          {wardMeta?.city ?? "Selected ward"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Decrease crews for ${d.ward_id}`}
                          onClick={() => handleUpdateCrews(d.ward_id, d.crews - 1)}
                          disabled={d.crews <= 1}
                          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-mist bg-paper text-navy hover:border-royal disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        <label htmlFor={`sim-crews-${d.ward_id}`} className="sr-only">
                          Crews for {d.ward_id}
                        </label>
                        <input
                          id={`sim-crews-${d.ward_id}`}
                          data-testid={`sim-crews-${d.ward_id}`}
                          type="number"
                          min={1}
                          max={20}
                          value={d.crews}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val)) handleUpdateCrews(d.ward_id, val);
                          }}
                          className="h-8 w-12 rounded-md border border-mist bg-white text-center font-mono text-xs font-bold text-navy tnum focus-visible:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                        />
                        <button
                          type="button"
                          aria-label={`Increase crews for ${d.ward_id}`}
                          onClick={() => handleUpdateCrews(d.ward_id, d.crews + 1)}
                          disabled={d.crews >= 20}
                          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-mist bg-paper text-navy hover:border-royal disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        {deployments.length > 1 ? (
                          <button
                            type="button"
                            aria-label={`Remove ${d.ward_id} from simulation`}
                            onClick={() => handleRemoveWard(d.ward_id)}
                            className="ml-1 grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-mist bg-white text-slate hover:border-navy hover:text-navy"
                          >
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-mist bg-paper/50 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[220px] flex-1">
                  <SliderField
                    id="sim-auto-crews-slider"
                    testId="sim-auto-crews-slider"
                    label="Auto-place spraying crews (greedy marginal ROI)"
                    min={1}
                    max={60}
                    step={1}
                    value={Math.min(60, autoCrews)}
                    valueLabel={`${autoCrews} crews`}
                    ariaValueText={`${autoCrews} crews auto-placed`}
                    minLabel="1 crew"
                    maxLabel="60 crews"
                    onChange={onAutoCrewsChange}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sim-auto-crews-input"
                    className="text-xs font-semibold text-navy"
                  >
                    Crews (1–300)
                  </label>
                  <input
                    id="sim-auto-crews-input"
                    data-testid="sim-auto-crews-input"
                    type="number"
                    min={1}
                    max={300}
                    value={autoCrews}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) {
                        onAutoCrewsChange(Math.max(1, Math.min(300, Math.round(val))));
                      }
                    }}
                    className="min-h-10 w-24 rounded-lg border border-mist bg-white px-3 py-1.5 font-mono text-sm font-semibold text-navy tnum focus-visible:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Explicit assumption note (ADR-0013) */}
          <div
            data-testid="sim-assumption-note"
            className="flex items-start gap-2.5 rounded-xl border border-mist bg-paper px-3.5 py-2.5 text-xs text-navy"
          >
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
            <div>
              <span className="font-semibold">Model assumption: </span>
              <span>
                {data?.efficacy.assumption_note ??
                  "Assumed, not fitted: no intervention labels in the data. See ADR-0013."}
              </span>{" "}
              {data ? (
                <span className="font-mono text-[11px] text-slate tnum">
                  (preset={data.efficacy.preset}, Emax={data.efficacy.e_max.toFixed(2)}, k=
                  {data.efficacy.k.toFixed(2)})
                </span>
              ) : null}
            </div>
          </div>

          {isFetching ? (
            <p role="status" aria-live="polite" className="font-mono text-xs font-semibold text-navy">
              Running counterfactual simulation…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step4-error-banner"
          retryTestId="step4-retry"
          title="Counterfactual simulation failed"
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton
          testId="step4-loading"
          label="Evaluating counterfactual case reductions across treated wards…"
        />
      ) : null}

      {!isError && data && data.wards.length === 0 ? (
        <EmptyState
          title="No treated wards simulated"
          description="Add at least one ward or enable Auto-place crews above to run the simulation."
        />
      ) : null}

      {!isError && data && data.wards.length > 0 ? (
        <>
          {/* Totals KPIs + sensitivity band */}
          <div
            data-testid="sim-totals"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Crews deployed</p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {data.totals.crews}
              </p>
              <p className="mt-1 text-xs text-slate">
                Across {data.wards.length} treated ward{data.wards.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-royal/40">
              <p className="text-xs font-semibold text-slate">
                Cases prevented (h = 2–4)
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-royal tnum">
                {data.totals.cases_prevented.toFixed(1)}
              </p>
              <p
                data-testid="sim-sensitivity-band"
                className="mt-1 font-mono text-xs font-semibold text-navy tnum"
              >
                Band: [{data.totals.cases_prevented_low.toFixed(1)} –{" "}
                {data.totals.cases_prevented_high.toFixed(1)}]
              </p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Hospital beds avoided</p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {data.totals.beds_avoided.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate">At 0.298 beds / case</p>
            </div>
            <div className="rounded-[16px] bg-white p-4 ring-1 ring-mist/90">
              <p className="text-xs font-semibold text-slate">Saline bags avoided</p>
              <p className="mt-2 font-mono text-2xl font-bold text-navy tnum">
                {data.totals.saline_avoided.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-slate">At 2.385 bags / case</p>
            </div>
          </div>

          {/* Grouped bar chart: Baseline vs Counterfactual for h = 2, 3, 4 */}
          <Card>
            <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Baseline vs counterfactual cases (h = 2, 3, 4)</CardTitle>
                <CardDescription>
                  Pooled expected cases across treated wards before and after vector-control deployment.
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-slate"
                    aria-hidden="true"
                  />
                  Baseline
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-royal"
                    aria-hidden="true"
                  />
                  Counterfactual
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div
                data-testid="sim-chart"
                className="h-64 w-full"
                role="region"
                aria-label="Baseline versus counterfactual dengue cases chart across horizons 2, 3, and 4"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-mist)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
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
                      width={44}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="baseline"
                      name="Baseline cases"
                      fill="var(--color-slate)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="counterfactual"
                      name="Counterfactual cases"
                      fill="var(--color-royal)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ROI ranking table */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Intervention ROI ranking</CardTitle>
              <CardDescription>
                Ranked by cases prevented per crew deployed, with low–high efficacy sensitivity bounds.
              </CardDescription>
            </CardHeader>
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Counterfactual intervention ROI ranking table"
            >
              <table
                data-testid="sim-roi-table"
                className="w-full border-collapse text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-mist bg-paper font-semibold text-slate">
                    <th scope="col" className="px-3.5 py-2.5">
                      Rank
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Ward
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Crews
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Reduction
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Cases Prevented
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Sensitivity [Low – High]
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Beds Avoided
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Saline Avoided
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      ROI / Crew
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist bg-white">
                  {data.wards.map((w) => (
                    <tr
                      key={w.ward_id}
                      data-testid={`sim-roi-row-${w.ward_id}`}
                      className="hover:bg-paper/60"
                    >
                      <td className="px-3.5 py-3 font-mono font-bold text-navy tnum">
                        #{w.rank}
                      </td>
                      <th scope="row" className="px-3.5 py-3">
                        <span className="font-mono font-bold text-navy tnum">
                          {w.ward_id}
                        </span>
                        <span className="block text-[11px] font-normal text-slate">
                          {w.city}
                        </span>
                      </th>
                      <td className="px-3.5 py-3 text-right font-mono font-semibold text-ink tnum">
                        {w.crews}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-slate tnum">
                        {(w.reduction_fraction * 100).toFixed(1)}%
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-royal tnum">
                        {w.cases_prevented.toFixed(1)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-navy tnum">
                        [{w.cases_prevented_low.toFixed(1)} –{" "}
                        {w.cases_prevented_high.toFixed(1)}]
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-ink tnum">
                        {w.beds_avoided.toFixed(2)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-ink tnum">
                        {w.saline_avoided.toFixed(1)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-navy tnum">
                        {w.roi_cases_per_crew.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
