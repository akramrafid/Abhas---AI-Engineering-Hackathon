"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import type { ApiError, OpsResponse } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface OpsTelemetryCardProps {
  ops: OpsResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: ApiError | null;
  title: string;
  description: string;
  testIdPrefix: string;
  showModelCardNote?: boolean;
  lang?: Lang;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${Math.round(seconds % 60)}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function OpsTelemetryCard({
  ops,
  isPending,
  isError,
  error,
  title,
  description,
  testIdPrefix,
  showModelCardNote = true,
  lang = "en",
}: OpsTelemetryCardProps) {
  return (
    <Card data-testid={`${testIdPrefix}-card`}>
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
            {title}
          </CardTitle>
          <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
            {description}
          </CardDescription>
        </div>
        {ops ? (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate tnum">
            <span className="rounded-sm border border-mist bg-paper px-2 py-0.5 text-navy">
              {ops.model_version}
            </span>
            <span>uptime {formatUptime(ops.uptime_s)}</span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <p className="text-sm text-slate">
            {lang === "bn" ? "পরিচালনা টেলিমেট্রি লোড হচ্ছে…" : "Loading operations telemetry…"}
          </p>
        ) : isError ? (
          <p className="rounded-md border border-mist bg-paper px-4 py-3 text-sm text-slate">
            Operations counters are currently unavailable ({error?.title ?? "API error"}).
          </p>
        ) : ops ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="text-xs font-semibold text-slate">Model loads</p>
              <p
                data-testid={`${testIdPrefix}-model-loads`}
                className="mt-1 font-mono text-xl font-bold text-navy tnum"
              >
                {ops.model_loads}
              </p>
              <p className="mt-0.5 text-xs text-slate">Loaded once at boot</p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="text-xs font-semibold text-slate">Prediction cache hit</p>
              <p
                data-testid={`${testIdPrefix}-cache-rate`}
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
              <p
                data-testid={`${testIdPrefix}-p95`}
                className="mt-1 font-mono text-xl font-bold text-navy tnum"
              >
                {ops.predictions.p95_ms.toFixed(1)} ms
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate tnum">
                p50 {ops.predictions.p50_ms.toFixed(1)} ms (SLO &lt;50)
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="text-xs font-semibold text-slate">Weather API calls</p>
              <p
                data-testid={`${testIdPrefix}-weather-calls`}
                className="mt-1 font-mono text-xl font-bold text-navy tnum"
              >
                {ops.weather.calls_today}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate tnum">
                Total {ops.weather.calls_total} · hits {ops.weather.cache_hits} · err {ops.weather.errors}
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="text-xs font-semibold text-slate">Est. monthly office cost</p>
              <p
                data-testid={`${testIdPrefix}-monthly-cost`}
                className="mt-1 font-mono text-xl font-bold text-navy tnum"
              >
                ${ops.est_monthly_cost_usd.toFixed(2)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate tnum">
                LLM {ops.llm.enabled ? "on" : "off"} · ${ops.llm.spend_usd_today.toFixed(2)} / $
                {ops.llm.budget_usd_per_day.toFixed(2)}/d
              </p>
            </div>
          </div>
        ) : null}

        {showModelCardNote ? (
          <div className="rounded-md border border-mist bg-paper px-4 py-3 text-xs leading-relaxed text-slate">
            <strong className="text-navy">Model card &amp; scope note:</strong> Fitted strictly on
            the organisers&apos; 60-ward dataset (2016–2025). The underlying series appears
            simulated and has not been validated against live DGHS hospital surveillance; do not use
            for real operational or clinical decisions without local recalibration.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
