import type { Usage } from "@/lib/api/types";
import {
  cn,
  formatCostUsd,
  formatLatency,
  formatTokens,
} from "@/lib/utils";
import { Clock, Coins, Cpu, DatabaseZap } from "lucide-react";

export interface UsageBadgeProps {
  usage: Usage;
  className?: string;
}

export function UsageBadge({ usage, className }: UsageBadgeProps) {
  const totalTokens = usage.prompt_tokens + usage.completion_tokens;

  return (
    <div
      data-testid="usage-badge"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-subtle bg-subtle/70 px-3 py-1.5 font-mono text-xs text-ink-muted tabular-nums",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 text-ink-secondary">
        <Cpu className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
        <span translate="no">{usage.model}</span>
      </span>

      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{formatLatency(usage.latency_ms)}</span>
      </span>

      <span
        title={`Prompt: ${usage.prompt_tokens} · Completion: ${usage.completion_tokens}`}
      >
        {formatTokens(totalTokens)} tok
        <span className="text-[11px] opacity-75">
          {" "}
          ({formatTokens(usage.prompt_tokens)}+{formatTokens(usage.completion_tokens)})
        </span>
      </span>

      <span className="inline-flex items-center gap-1">
        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{formatCostUsd(usage.cost_usd)}</span>
      </span>

      {usage.cached ? (
        <span
          data-testid="usage-cached-badge"
          className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        >
          <DatabaseZap className="h-3 w-3" aria-hidden="true" />
          <span>cached</span>
        </span>
      ) : null}
    </div>
  );
}
