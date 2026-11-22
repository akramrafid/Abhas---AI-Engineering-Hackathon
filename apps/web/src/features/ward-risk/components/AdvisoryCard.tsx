"use client";

import { CheckCircle2, FileText, RotateCw } from "@/components/icons";
import { clsx } from "clsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { UI_COPY, type Lang } from "@/lib/i18n";
import { useAdvisoryQuery } from "../hooks";

export interface AdvisoryCardProps {
  wardId: string;
  originWeek: string;
  horizon: number;
  lang: Lang;
}

export function AdvisoryCard({
  wardId,
  originWeek,
  horizon,
  lang,
}: AdvisoryCardProps) {
  const copy = UI_COPY[lang].wardRisk;
  const advisoryQuery = useAdvisoryQuery({
    wardId,
    originWeek,
    horizon,
    language: lang,
    enabled: Boolean(wardId) && Boolean(originWeek),
  });

  const data = advisoryQuery.data;

  return (
    <Card data-testid="advisory-panel" className="no-print">
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle
            className={clsx(
              "flex items-center gap-2",
              lang === "bn" && "font-bangla",
            )}
          >
            <FileText className="h-4 w-4 text-royal" aria-hidden="true" />
            <span>{copy.advisoryTitle}</span>
          </CardTitle>
          <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
            {copy.advisoryDesc}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <>
              <span
                data-testid="advisory-source-badge"
                className={clsx(
                  "inline-flex items-center rounded-sm border border-mist bg-paper px-2.5 py-0.5 text-xs font-semibold text-navy",
                  lang === "bn" ? "font-bangla" : "font-mono",
                )}
              >
                {data.source === "llm"
                  ? `${copy.advisoryLlmBadge}${data.model ? ` (${data.model})` : ""}`
                  : copy.advisoryTemplateBadge}
              </span>
              {data.numbers_validated ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-mist bg-white px-2 py-0.5 text-xs font-medium text-slate">
                  <CheckCircle2 className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                  <span className={lang === "bn" ? "font-bangla" : undefined}>
                    {copy.advisoryValidated}
                  </span>
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {advisoryQuery.isPending ? (
          <p className={clsx("text-sm text-slate", lang === "bn" && "font-bangla")}>
            {copy.advisoryLoading}
          </p>
        ) : advisoryQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-mist bg-paper px-4 py-3 text-sm text-slate">
            <span>
              Could not load officer brief ({advisoryQuery.error.title}).
            </span>
            <button
              type="button"
              onClick={() => {
                void advisoryQuery.refetch();
              }}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md bg-royal px-3 py-1 text-xs font-semibold text-white hover:bg-navy"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{UI_COPY[lang].common.retry}</span>
            </button>
          </div>
        ) : data ? (
          <div
            lang={data.language}
            className={clsx("space-y-3", data.language === "bn" && "font-bangla")}
          >
            <h3
              data-testid="advisory-headline"
              className="text-sm font-bold text-navy"
            >
              {data.headline}
            </h3>
            <p className="text-sm leading-relaxed text-ink">{data.summary}</p>
            {data.actions.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.actions.map((item, idx) => (
                  <li
                    key={`${item.when}-${idx}`}
                    className="rounded-md border border-mist bg-paper px-3 py-2 text-xs text-ink"
                  >
                    <span className="font-semibold text-navy">{item.when}: </span>
                    <span>{item.action}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
