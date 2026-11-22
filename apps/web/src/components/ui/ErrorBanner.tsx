"use client";

import { AlertTriangle, RotateCw } from "@/components/icons";
import { clsx } from "clsx";
import { ApiError } from "@/lib/api/client";

export interface ErrorBannerProps {
  title: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
  retryTestId?: string;
  className?: string;
}

export function ErrorBanner({
  title,
  message,
  error,
  onRetry,
  retryLabel = "Retry",
  testId = "error-banner",
  retryTestId = "retry-button",
  className,
}: ErrorBannerProps) {
  const apiErr = error instanceof ApiError ? error : null;
  const displayMessage =
    message ??
    (apiErr?.status === 429 && apiErr.retryAfterSeconds
      ? `Rate limit reached. Try again in ${apiErr.retryAfterSeconds} seconds.`
      : apiErr?.detail ?? apiErr?.title ?? "The request could not be completed. Try again.");

  return (
    <div
      role="alert"
      data-testid={testId}
      className={clsx(
        "rounded-lg border border-risk-high bg-white p-5 text-ink",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-risk-high text-risk-high-on"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="space-y-1.5">
            <h3 className="font-sans text-base font-bold text-ink">{title}</h3>
            <p className="text-sm text-slate">{displayMessage}</p>
            {apiErr?.errors && apiErr.errors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {apiErr.errors.map((fe, idx) => (
                  <li key={`${fe.field}-${idx}`}>
                    <span className="font-mono text-xs font-semibold text-navy">
                      {fe.field}
                    </span>
                    {": "}
                    <span>{fe.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {apiErr?.requestId ? (
              <p className="pt-1 font-mono text-xs text-slate tnum">
                Request ID: {apiErr.requestId}
                {apiErr.status > 0 ? ` · HTTP ${apiErr.status}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {onRetry ? (
          <button
            type="button"
            data-testid={retryTestId}
            onClick={onRetry}
            className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span>{retryLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
