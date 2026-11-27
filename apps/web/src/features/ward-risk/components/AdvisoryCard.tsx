"use client";

import { CheckCircle2, FileText, RotateCw, Sparkles } from "@/components/icons";
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
    <Card data-testid="advisory-panel" className="no-print overflow-hidden">
      <CardHeader className="gap-2 bg-paper/45 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15">
            {data?.source === "llm" ? (
              <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <FileText className="h-4.5 w-4.5" aria-hidden="true" />
            )}
          </span>
          <div>
            <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.advisoryTitle}
            </CardTitle>
            <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.advisoryDesc}
            </CardDescription>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <>
              <span
                data-testid="advisory-source-badge"
                className={clsx(
                  "inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-mist",
                  lang === "bn" && "font-bangla",
                )}
              >
                {data.source === "llm"
                  ? `${copy.advisoryLlmBadge}${data.model ? ` (${data.model})` : ""}`
                  : copy.advisoryTemplateBadge}
              </span>
              {data.numbers_validated ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-royal/[0.08] px-3 py-1 text-xs font-semibold text-navy ring-1 ring-royal/15">
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
          <div className="space-y-2.5 animate-pulse">
            <div className="h-4 w-2/5 rounded-full bg-paper" />
            <div className="h-3.5 w-full rounded-full bg-paper" />
            <div className="h-3.5 w-4/5 rounded-full bg-paper" />
          </div>
        ) : advisoryQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-sm text-slate ring-1 ring-mist">
            <span>
              Could not load officer brief ({advisoryQuery.error.title}).
            </span>
            <button
              type="button"
              onClick={() => {
                void advisoryQuery.refetch();
              }}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full bg-royal px-3.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-navy"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{UI_COPY[lang].common.retry}</span>
            </button>
          </div>
        ) : data ? (
          <div
            lang={data.language}
            className={clsx("space-y-4", data.language === "bn" && "font-bangla")}
          >
            <div className="space-y-1.5">
              <h3
                data-testid="advisory-headline"
                className="text-[15px] font-bold tracking-tight text-navy"
              >
                {data.headline}
              </h3>
              <p className="max-w-[74ch] text-sm leading-6 text-ink">{data.summary}</p>
            </div>
            {data.actions.length > 0 ? (
              <ul className="divide-y divide-mist/75 border-t border-mist/80">
                {data.actions.map((item, idx) => (
                  <li
                    key={`${item.when}-${idx}`}
                    className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="inline-flex w-fit shrink-0 items-center rounded-md bg-royal/[0.08] px-2 py-0.5 font-mono text-[11px] font-bold text-royal sm:min-w-[7.5rem] sm:justify-center">
                      {item.when}
                    </span>
                    <span className="text-[13px] leading-5 font-medium text-navy">{item.action}</span>
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
