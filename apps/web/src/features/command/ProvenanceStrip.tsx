"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Database, FileSpreadsheet, ShieldCheck } from "@/components/icons";
import { clsx } from "clsx";
import { UI_COPY, type Lang } from "@/lib/i18n";
import type { PlanRecord, RunMeta } from "./api";

export interface ProvenanceStripProps {
  meta: RunMeta | null;
  solveMs?: number | null;
  isFetching?: boolean;
  lang: Lang;
  defaultPlanLabel: string;
  onSavePlan: (label: string) => void;
  isSavingPlan: boolean;
  savedPlan: PlanRecord | null;
  saveError: string | null;
  onOpenCompare: () => void;
  savedPlanCount?: number | null;
}

export function ProvenanceStrip({
  meta,
  solveMs,
  isFetching = false,
  lang,
  defaultPlanLabel,
  onSavePlan,
  isSavingPlan,
  savedPlan,
  saveError,
  onOpenCompare,
  savedPlanCount,
}: ProvenanceStripProps) {
  const [labelInput, setLabelInput] = useState("");
  const copy = UI_COPY[lang].command;
  const bn = lang === "bn";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resolved = (labelInput.trim() || defaultPlanLabel).slice(0, 80);
    if (!resolved) return;
    onSavePlan(resolved);
    setLabelInput("");
  };

  return (
    <section
      aria-label="Run provenance and plan actions"
      data-testid="command-provenance-strip"
      className="rounded-[16px] bg-white px-4 py-3.5 text-ink ring-1 ring-mist/90"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Provenance tokens */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-navy">
            <Database aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
            <span>Model</span>
            <span
              data-testid="provenance-model-version"
              className="rounded-md border border-mist bg-paper px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy tnum"
            >
              {meta?.model_version ?? "—"}
            </span>
          </span>

          <span className="inline-flex items-center gap-1.5 text-slate">
            <span>SHA</span>
            <span
              data-testid="provenance-git-sha"
              className="rounded-md border border-mist bg-paper px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy tnum"
            >
              {meta?.git_sha ?? "—"}
            </span>
          </span>

          <span className="inline-flex items-center gap-1.5 text-slate">
            <span>Data as of</span>
            <span
              data-testid="provenance-data-as-of"
              className="rounded-md border border-mist bg-paper px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy tnum"
            >
              {meta?.data_as_of ?? "—"}
            </span>
          </span>

          {typeof solveMs === "number" ? (
            <span className="inline-flex items-center gap-1 text-slate">
              <span>Solve</span>
              <span className="font-mono text-[11px] font-semibold text-navy tnum">
                {solveMs.toFixed(1)} ms
              </span>
            </span>
          ) : null}

          {meta?.offline ? (
            <span
              data-testid="command-offline-badge"
              lang={lang}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white",
                bn && "font-bangla",
              )}
            >
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{copy.offlineBadge}</span>
            </span>
          ) : (
            <span
              data-testid="command-mode-badge"
              lang={lang}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-md border border-mist bg-paper px-2 py-0.5 text-xs font-semibold text-navy",
                bn && "font-bangla",
              )}
            >
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
              <span>{copy.onlineBadge}</span>
            </span>
          )}

          {isFetching ? (
            <span
              role="status"
              aria-live="polite"
              className="font-mono text-[11px] font-semibold text-navy tnum"
            >
              Updating…
            </span>
          ) : null}
        </div>

        {/* Save-as-plan & Compare-plans actions */}
        <div className="flex flex-wrap items-center gap-2">
          <form
            data-testid="save-plan-form"
            onSubmit={handleSubmit}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="command-plan-label" className="sr-only">
              {copy.savePlanLabel}
            </label>
            <input
              id="command-plan-label"
              data-testid="save-plan-label-input"
              type="text"
              maxLength={80}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder={defaultPlanLabel || copy.savePlanPlaceholder}
              className="min-h-9 w-48 rounded-lg border border-mist bg-paper/50 px-3 py-1.5 text-xs font-medium text-ink placeholder:text-slate focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal sm:w-56"
            />
            <button
              type="submit"
              data-testid="save-plan-btn"
              disabled={isSavingPlan}
              lang={lang}
              className={clsx(
                "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-royal px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-60",
                bn && "font-bangla",
              )}
            >
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{isSavingPlan ? copy.savingPlan : copy.savePlanButton}</span>
            </button>
          </form>

          <button
            type="button"
            data-testid="compare-plans-btn"
            onClick={onOpenCompare}
            lang={lang}
            className={clsx(
              "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-mist bg-white px-3.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-royal hover:bg-paper",
              bn && "font-bangla",
            )}
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
            <span>
              {copy.comparePlansButton}
              {typeof savedPlanCount === "number" && savedPlanCount > 0
                ? ` (${savedPlanCount})`
                : ""}
            </span>
          </button>
        </div>
      </div>

      {savedPlan ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="save-plan-status"
          className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-mist pt-2 text-xs text-navy"
        >
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
          <span className="font-semibold">Saved plan:</span>
          <span>{savedPlan.label}</span>
          <span className="font-mono text-[11px] text-slate tnum">
            ({savedPlan.kind} · {savedPlan.id.slice(0, 8)})
          </span>
        </p>
      ) : null}

      {saveError ? (
        <p
          role="alert"
          data-testid="save-plan-error"
          className="mt-2.5 border-t border-mist pt-2 text-xs font-semibold text-ink"
        >
          Could not save plan: {saveError}
        </p>
      ) : null}
    </section>
  );
}
