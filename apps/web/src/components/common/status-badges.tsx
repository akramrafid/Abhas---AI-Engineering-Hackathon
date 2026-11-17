import type {
  Category,
  Language,
  Sentiment,
  Urgency,
} from "@/lib/api/types";
import {
  cn,
  formatCategory,
  formatLanguage,
  formatSentiment,
  formatUrgency,
} from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Languages,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

const URGENCY_STYLES: Record<Urgency, string> = {
  critical:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-200",
  high: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200",
  medium:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200",
  low: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
};

const URGENCY_DOT: Record<Urgency, string> = {
  critical: "bg-red-600 dark:bg-red-400",
  high: "bg-amber-600 dark:bg-amber-400",
  medium: "bg-sky-600 dark:bg-sky-400",
  low: "bg-slate-500 dark:bg-slate-400",
};

const SENTIMENT_STYLES: Record<Sentiment, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200",
  neutral:
    "border-border-subtle bg-subtle text-ink-secondary",
  negative:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200",
  angry:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-200",
};

const pillBase =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium";

export function UrgencyBadge({
  urgency,
  className,
}: {
  urgency: Urgency;
  className?: string;
}) {
  return (
    <span
      data-testid="urgency-badge"
      className={cn(pillBase, URGENCY_STYLES[urgency], className)}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", URGENCY_DOT[urgency])}
        aria-hidden="true"
      />
      <span>{formatUrgency(urgency)}</span>
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  return (
    <span
      data-testid="category-badge"
      className={cn(
        pillBase,
        "border-accent-border bg-accent-soft text-accent",
        className,
      )}
    >
      {formatCategory(category)}
    </span>
  );
}

export function SentimentBadge({
  sentiment,
  className,
}: {
  sentiment: Sentiment;
  className?: string;
}) {
  return (
    <span
      data-testid="sentiment-badge"
      className={cn(pillBase, SENTIMENT_STYLES[sentiment], className)}
    >
      {formatSentiment(sentiment)}
    </span>
  );
}

export function LanguageBadge({
  language,
  className,
}: {
  language: Language | string;
  className?: string;
}) {
  return (
    <span
      data-testid="language-badge"
      className={cn(
        pillBase,
        "border-border-subtle bg-subtle text-ink-secondary",
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
      <span>{formatLanguage(language)}</span>
    </span>
  );
}

export function NeedsHumanBadge({
  needsHuman,
  className,
}: {
  needsHuman: boolean;
  className?: string;
}) {
  return (
    <span
      data-testid="needs-human-badge"
      className={cn(
        pillBase,
        needsHuman
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200"
          : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200",
        className,
      )}
    >
      {needsHuman ? (
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{needsHuman ? "Needs human review" : "Self-serve OK"}</span>
    </span>
  );
}

export function InjectionBadge({
  detected,
  compact = false,
  className,
}: {
  detected: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (!detected) {
    if (compact) {
      return (
        <span className="text-xs text-ink-muted" aria-label="No injection detected">
          Clean
        </span>
      );
    }
    return (
      <span
        data-testid="injection-badge"
        className={cn(
          pillBase,
          "border-border-subtle bg-subtle text-ink-muted",
          className,
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>No injection</span>
      </span>
    );
  }

  return (
    <span
      data-testid="injection-badge"
      className={cn(
        pillBase,
        "border-red-500/70 bg-red-600 text-white font-semibold shadow-xs dark:border-red-500 dark:bg-red-600",
        className,
      )}
    >
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? "Injection" : "Prompt injection detected"}</span>
    </span>
  );
}

export function TrustBadge({
  trusted,
  className,
}: {
  trusted: boolean;
  className?: string;
}) {
  return (
    <span
      data-testid={trusted ? "trust-badge-trusted" : "trust-badge-untrusted"}
      className={cn(
        pillBase,
        trusted
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200"
          : "border-red-300 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-200",
        className,
      )}
    >
      {trusted ? (
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{trusted ? "Trusted policy" : "Untrusted (excluded)"}</span>
    </span>
  );
}
