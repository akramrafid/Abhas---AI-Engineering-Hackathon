"use client";

import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface ErrorAlertProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorAlert({
  error,
  title = "Request failed",
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorAlertProps) {
  const apiErr = error instanceof ApiError ? error : null;
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="error-alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50/90 p-4 text-sm text-red-900 dark:border-red-800/70 dark:bg-red-950/50 dark:text-red-100 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="text-red-800 dark:text-red-200">{message}</p>
          {apiErr?.requestId ? (
            <p className="font-mono text-xs text-red-700/90 dark:text-red-300/90">
              Request ID: <span translate="no">{apiErr.requestId}</span>
            </p>
          ) : null}
        </div>
      </div>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="retry-button"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-700 dark:bg-red-900/60 dark:text-red-100 dark:hover:bg-red-900"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
