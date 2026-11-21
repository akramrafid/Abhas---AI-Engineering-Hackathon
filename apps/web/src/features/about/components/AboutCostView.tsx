"use client";

import { OpsTelemetryCard } from "@/components/ops/OpsTelemetryCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { useOpsQuery } from "@/lib/api/queries";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface AboutCostViewProps {
  lang?: Lang;
}

export function AboutCostView({ lang = "en" }: AboutCostViewProps) {
  const opsQuery = useOpsQuery(true);
  const copy = UI_COPY[lang].about;
  const ops = opsQuery.data;

  return (
    <div data-testid="about-panel" className="space-y-5">
      <OpsTelemetryCard
        ops={ops}
        isPending={opsQuery.isPending}
        isError={opsQuery.isError}
        error={opsQuery.error}
        title={copy.opsTitle}
        description={copy.opsDesc}
        testIdPrefix="about-ops"
        showModelCardNote={false}
        lang={lang}
      />

      {ops ? (
        <Card data-testid="about-cost-breakdown">
          <CardHeader>
            <CardTitle>Operational telemetry &amp; budget breakdown</CardTitle>
            <CardDescription>
              Measured counters from this running API instance for a single city public-health office.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-md border border-mist bg-paper p-3.5">
                <dt className="text-xs font-semibold text-slate">Prediction requests</dt>
                <dd className="mt-1 font-mono text-base font-bold text-navy tnum">
                  {ops.predictions.requests} total ({ops.predictions.cache_hits} cached)
                </dd>
                <p className="mt-0.5 text-xs text-slate">
                  Hit rate {(ops.predictions.cache_hit_rate * 100).toFixed(1)}%
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <dt className="text-xs font-semibold text-slate">Inference p50 / p95</dt>
                <dd className="mt-1 font-mono text-base font-bold text-navy tnum">
                  {ops.predictions.p50_ms.toFixed(1)} ms / {ops.predictions.p95_ms.toFixed(1)} ms
                </dd>
                <p className="mt-0.5 text-xs text-slate">
                  CPU serving via joblib (target &lt; 50 ms p95)
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <dt className="text-xs font-semibold text-slate">Optional LLM advisory</dt>
                <dd className="mt-1 font-mono text-base font-bold text-navy tnum">
                  {ops.llm.enabled ? "Enabled (Claude Haiku)" : "Template mode ($0.00)"}
                </dd>
                <p className="mt-0.5 font-mono text-xs text-slate tnum">
                  Calls today: {ops.llm.calls_today} · Spend ${ops.llm.spend_usd_today.toFixed(4)} / $
                  {ops.llm.budget_usd_per_day.toFixed(2)} cap
                </p>
              </div>

              <div className="rounded-md border border-mist bg-paper p-3.5">
                <dt className="text-xs font-semibold text-slate">Estimated monthly cost</dt>
                <dd className="mt-1 font-mono text-base font-bold text-navy tnum">
                  ${ops.est_monthly_cost_usd.toFixed(2)} / month
                </dd>
                <p className="mt-0.5 text-xs text-slate">
                  Zero keys required; Open-Meteo non-commercial tier is free
                </p>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card data-testid="about-model-card">
          <CardHeader>
            <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.modelCardTitle}
            </CardTitle>
            <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.modelCardDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-ink">
            <div className="rounded-md border border-risk-medium bg-paper p-3.5 text-xs leading-relaxed text-ink">
              <strong className="text-navy">Important disclaimer:</strong> This model is trained
              on the organisers&apos; 60-ward dataset (2016–2025). The dataset appears simulated
              and has <strong>not been validated on live DGHS hospital surveillance</strong>. Do
              not use Abhas for real operational, clinical, or larviciding deployment decisions
              without local epidemiological recalibration.
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate">
              <li>
                <strong className="text-ink">Model family:</strong> Direct multi-horizon Poisson
                LightGBM (h = 1…4 weeks) with monotone-increasing constraints on lagged rainfall
                (2–4 weeks prior), trained on GPU and served on CPU from a single verified joblib
                artifact.
              </li>
              <li>
                <strong className="text-ink">Uncertainty &amp; tiers:</strong> Negative-binomial
                conformal 80% prediction bands calibrated on 2023; cost-sensitive tier thresholds
                (missed Critical penalised 5×) plus WHO/PAHO endemic-channel +1 tier escalation.
              </li>
              <li>
                <strong className="text-ink">Explainability:</strong> Native log-space SHAP
                contributions grouped into 8 plain-language buckets (Rain 2–4w ago, Water-logging,
                Sanitation, etc.) that multiply back to the expected case count.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="about-attribution">
          <CardHeader>
            <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.attributionTitle}
            </CardTitle>
            <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.attributionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-slate">
            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="font-semibold text-navy">Weather data attribution</p>
              <p className="mt-1 text-ink">
                Weather data by{" "}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-royal underline-offset-2 hover:underline"
                >
                  Open-Meteo.com
                </a>{" "}
                (CC BY 4.0). Live mode fetches five Bangladesh city centroids in one cached call
                every 6 hours with automatic cache → climatology fallback.
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="font-semibold text-navy">Typography &amp; open licences</p>
              <p className="mt-1 text-ink">
                Self-hosted via <code className="font-mono">@fontsource</code> (zero runtime font
                requests): Manrope (UI), IBM Plex Mono (tabular figures), and Noto Sans Bengali
                (Bangla) — SIL Open Font License 1.1.
              </p>
            </div>

            <div className="rounded-md border border-mist bg-paper p-3.5">
              <p className="font-semibold text-navy">Schematic map &amp; privacy</p>
              <p className="mt-1 text-ink">
                Ward boundary geometry is not present in the dataset; the city tile grid is
                explicitly schematic. Zero personal health data or patient identifiers are stored
                or transmitted.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
