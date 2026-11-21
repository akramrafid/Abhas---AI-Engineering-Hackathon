"use client";

import { UI_COPY, type Lang } from "@/lib/i18n";

export interface WardNotFoundCardProps {
  wardId?: string | null;
  detail?: string | null;
  onReset: () => void;
  lang?: Lang;
}

export function WardNotFoundCard({
  wardId,
  detail,
  onReset,
  lang = "en",
}: WardNotFoundCardProps) {
  const copy = UI_COPY[lang].common;

  return (
    <div
      data-testid="ward-not-found"
      role="alert"
      className="space-y-3 rounded-lg border border-risk-high bg-white p-6"
    >
      <h2 className="font-sans text-lg font-bold text-navy">{copy.wardNotFound}</h2>
      <p className="text-sm text-slate">
        {detail ? (
          detail
        ) : (
          <>
            No ward matching{" "}
            <code className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">
              {wardId}
            </code>{" "}
            exists in the seeded dataset. Select a valid ward to view its early-warning forecast.
          </>
        )}
      </p>
      <button
        type="button"
        data-testid="ward-not-found-reset"
        onClick={onReset}
        className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
      >
        {copy.resetDefaultWard}
      </button>
    </div>
  );
}
