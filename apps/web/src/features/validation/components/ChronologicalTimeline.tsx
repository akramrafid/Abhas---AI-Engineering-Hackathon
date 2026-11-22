"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

export interface ChronologicalTimelineProps {
  splitText: string;
  modelVersion: string;
  generatedAt: string;
  holdoutSha256?: string | null;
}

const TIMELINE_STAGES = [
  {
    id: "train-cv",
    span: "2016–2022",
    title: "Expanding-window CV folds",
    detail: "Train & Optuna tuning on purged rolling folds (test years 2019–2022).",
    widthClass: "lg:col-span-6",
    barClass: "bg-navy text-white",
  },
  {
    id: "calibrate",
    span: "2023",
    title: "Calibration & cut-offs",
    detail: "NegBin conformal 80% bands, endemic channel & 5× cost-sensitive tier thresholds.",
    widthClass: "lg:col-span-3",
    barClass: "bg-royal text-white",
  },
  {
    id: "holdout",
    span: "2024–2025",
    title: "Locked hold-out (SHA-256)",
    detail: "Frozen before tuning; scored once for final MAE, coverage & Critical recall.",
    widthClass: "lg:col-span-3",
    barClass: "bg-paper text-navy border border-royal",
  },
] as const;

export function ChronologicalTimeline({
  splitText,
  modelVersion,
  generatedAt,
  holdoutSha256,
}: ChronologicalTimelineProps) {
  return (
    <Card data-testid="validation-split-summary">
      <CardHeader>
        <CardTitle>Chronological backtest &amp; split timeline</CardTitle>
        <CardDescription>{splitText}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol
          data-testid="validation-split-timeline"
          aria-label="Chronological training, calibration, and hold-out split timeline"
          className="grid gap-3 lg:grid-cols-12"
        >
          {TIMELINE_STAGES.map((stage) => (
            <li
              key={stage.id}
              className={`flex flex-col justify-between rounded-md border border-mist bg-white p-3 ${stage.widthClass}`}
            >
              <div>
                <span
                  className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-xs font-bold tnum ${stage.barClass}`}
                >
                  {stage.span}
                </span>
                <p className="mt-2 text-xs font-bold text-navy">{stage.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate">
                  {stage.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-mist pt-3 font-mono text-xs text-slate tnum">
          <span>
            Model: <strong className="text-navy">{modelVersion}</strong>
          </span>
          <span>
            Generated:{" "}
            <strong className="text-ink">
              {generatedAt.slice(0, 19).replace("T", " ")} UTC
            </strong>
          </span>
          {holdoutSha256 ? (
            <span>
              Hold-out SHA-256:{" "}
              <strong className="text-navy">{holdoutSha256.slice(0, 16)}…</strong>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
