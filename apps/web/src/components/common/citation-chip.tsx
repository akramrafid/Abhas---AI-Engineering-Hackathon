"use client";

import type { Citation } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export interface CitationChipProps {
  citation: Citation;
  onSelect: (citation: Citation) => void;
  active?: boolean;
  showTitle?: boolean;
  className?: string;
}

export function CitationChip({
  citation,
  onSelect,
  active = false,
  showTitle = false,
  className,
}: CitationChipProps) {
  const titleText = citation.section
    ? `${citation.title} (${citation.section})`
    : citation.title;

  return (
    <button
      type="button"
      data-testid={`citation-${citation.id}`}
      onClick={() => onSelect(citation)}
      title={titleText}
      aria-label={`Open citation ${citation.id}: ${titleText}`}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-mono text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        showTitle ? "px-2.5 py-1 text-left" : "mx-0.5 px-1.5 py-0.5 align-baseline",
        active
          ? "border-accent bg-accent text-white"
          : "border-accent-border bg-accent-soft text-accent hover:bg-accent hover:text-white",
        className,
      )}
    >
      <span className="tabular-nums">[{citation.id}]</span>
      {showTitle ? (
        <span className="max-w-[220px] truncate font-sans font-medium">
          {citation.title}
        </span>
      ) : null}
    </button>
  );
}
