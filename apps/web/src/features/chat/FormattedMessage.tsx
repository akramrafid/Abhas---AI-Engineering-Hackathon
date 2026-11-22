"use client";

import type { ReactNode } from "react";

const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_TOKEN_RE);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-navy">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-navy/[0.08] px-1.5 py-0.5 font-mono text-[12px] font-medium text-navy"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/**
 * Safe, zero-XSS lightweight Markdown renderer for assistant replies.
 * Renders paragraphs, bullet lists, numbered lists, bold, italic, and inline code via pure React nodes.
 */
export function FormattedMessage({
  content,
  isBangla,
}: {
  content: string;
  isBangla?: boolean;
}) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyIdx: number) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${keyIdx}`} className="my-1.5 space-y-1 pl-4 list-disc marker:text-royal">
        {listItems.map((item, idx) => (
          <li key={`li-${keyIdx}-${idx}`} className="leading-relaxed">
            {renderInline(item, `li-${keyIdx}-${idx}`)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(i);
      return;
    }
    const bulletMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      return;
    }
    flushList(i);
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed [&:not(:first-child)]:mt-2">
        {renderInline(line, `p-${i}`)}
      </p>,
    );
  });
  flushList(lines.length);

  return (
    <div
      lang={isBangla ? "bn" : "en"}
      className={isBangla ? "font-bangla text-[13.5px] text-ink" : "text-[13.5px] text-ink"}
    >
      {blocks}
    </div>
  );
}
