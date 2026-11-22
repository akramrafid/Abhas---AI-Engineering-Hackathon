"use client";

import { OpsTelemetryCard } from "@/components/ops/OpsTelemetryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import type { Lang } from "@/lib/i18n";
import { useOpsQuery, useValidationQuery } from "../hooks";
import { ChronologicalTimeline } from "./ChronologicalTimeline";
import { CoverageAndConfusion } from "./CoverageAndConfusion";
import { MetricsComparisonCard } from "./MetricsComparisonCard";

export interface ValidationViewProps {
  lang?: Lang;
}

export function ValidationView({ lang = "en" }: ValidationViewProps) {
  const validationQuery = useValidationQuery(true);
  const opsQuery = useOpsQuery(true);

  if (validationQuery.isError) {
    return (
      <ErrorBanner
        testId="validation-error-banner"
        retryTestId="validation-retry"
        title="Could not load validation backtest results"
        error={validationQuery.error}
        onRetry={() => {
          void validationQuery.refetch();
        }}
      />
    );
  }

  if (validationQuery.isPending) {
    return (
      <PanelSkeleton
        testId="validation-loading"
        label="Loading chronological validation results…"
      />
    );
  }

  const data = validationQuery.data;
  if (!data || data.metrics.length === 0) {
    return (
      <EmptyState
        testId="validation-empty-state"
        title="No stored backtest results found"
        description="Run npm run eval to generate hold-out MAE, RMSE, coverage, and tier confusion matrix outputs."
      />
    );
  }

  return (
    <div data-testid="validation-panel" className="space-y-5">
      <StubDataBanner modelVersion={data.model_version} />

      <ChronologicalTimeline
        splitText={data.split}
        modelVersion={data.model_version}
        generatedAt={data.generated_at}
        holdoutSha256={data.holdout_locked_sha256}
      />

      <MetricsComparisonCard metrics={data.metrics} />

      <CoverageAndConfusion
        coverage={data.coverage}
        confusion={data.confusion}
      />

      <OpsTelemetryCard
        ops={opsQuery.data}
        isPending={opsQuery.isPending}
        isError={opsQuery.isError}
        error={opsQuery.error}
        title="Compute, caching & cost efficiency (/api/v1/ops)"
        description="Live local-office operational telemetry confirming single joblib load, prediction cache efficiency, and bounded external API calls."
        testIdPrefix="validation-ops"
        showModelCardNote
        lang={lang}
      />
    </div>
  );
}
