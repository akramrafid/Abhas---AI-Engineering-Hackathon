"use client";

import { clsx } from "clsx";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
  actionTestId?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  testId = "empty-state",
  actionTestId,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={clsx(
        "flex flex-col items-start gap-3 rounded-lg border border-mist bg-white p-6",
        className,
      )}
    >
      <h3 className="font-sans text-base font-bold text-navy">{title}</h3>
      <p className="max-w-xl text-sm text-slate">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          data-testid={actionTestId}
          onClick={onAction}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
