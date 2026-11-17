"use client";

import { useMemo, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CitationChip } from "./citation-chip";

const CITATION_HREF_PREFIX = "#lumadesk-citation-";

interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function expandMultiCitations(raw: string): string {
  // Convert `[1, 2]` or `[1,2]` into `[1] [2]` so each citation becomes an independent chip
  return raw.replace(/\[(\d+(?:\s*,\s*\d+)+)\](?!\()/g, (_, list: string) =>
    list
      .split(",")
      .map((n) => `[${n.trim()}]`)
      .join(" "),
  );
}

function transformTextWithCitations(
  text: string,
  validIds: Set<number>,
): MdastNode[] | null {
  if (validIds.size === 0) return null;
  const normalized = expandMultiCitations(text);
  const pattern = /\[(\d+)\](?!\()/g;
  let lastIdx = 0;
  const out: MdastNode[] = [];
  let matchedAny = false;

  for (const match of normalized.matchAll(pattern)) {
    const idx = match.index ?? 0;
    const num = Number(match[1]);
    if (!validIds.has(num)) {
      continue;
    }
    matchedAny = true;
    if (idx > lastIdx) {
      out.push({ type: "text", value: normalized.slice(lastIdx, idx) });
    }
    out.push({
      type: "link",
      url: `${CITATION_HREF_PREFIX}${num}`,
      children: [{ type: "text", value: `[${num}]` }],
    });
    lastIdx = idx + match[0].length;
  }

  if (!matchedAny) return null;
  if (lastIdx < normalized.length) {
    out.push({ type: "text", value: normalized.slice(lastIdx) });
  }
  return out;
}

function createRemarkCitationsPlugin(validIds: Set<number>) {
  return function remarkCitations() {
    return (tree: MdastNode) => {
      const visit = (node: MdastNode) => {
        if (!node.children || node.type === "code" || node.type === "link") {
          return;
        }
        const nextChildren: MdastNode[] = [];
        for (const child of node.children) {
          if (child.type === "text" && typeof child.value === "string") {
            const replacement = transformTextWithCitations(child.value, validIds);
            if (replacement) {
              nextChildren.push(...replacement);
              continue;
            }
          }
          visit(child);
          nextChildren.push(child);
        }
        node.children = nextChildren;
      };
      visit(tree);
    };
  };
}

export function extractHighlightPhrases(snippet?: string): string[] {
  if (!snippet) return [];
  const cleaned = snippet
    .replace(/[*_`#>]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!cleaned) return [];

  const candidates = new Set<string>();
  if (cleaned.length >= 8 && !cleaned.includes("|")) {
    candidates.add(cleaned.replace(/\s+/g, " "));
  }
  for (const part of cleaned.split(/[|\n]+/)) {
    const trimmed = part.replace(/\s+/g, " ").trim();
    if (trimmed.length >= 6) {
      candidates.add(trimmed);
    }
  }

  return Array.from(candidates).sort((a, b) => b.length - a.length);
}

function buildFlexiblePhraseRegex(phrase: string): RegExp | null {
  const tokens = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (tokens.length === 0) return null;
  return new RegExp(tokens.join("\\s+"), "i");
}

function highlightTextInHast(text: string, regexes: RegExp[]): HastNode[] | null {
  let bestMatch: { index: number; length: number } | null = null;
  for (const regex of regexes) {
    const match = regex.exec(text);
    if (match && (!bestMatch || match.index < bestMatch.index)) {
      bestMatch = { index: match.index, length: match[0].length };
    }
  }
  if (!bestMatch) return null;

  const nodes: HastNode[] = [];
  if (bestMatch.index > 0) {
    nodes.push({ type: "text", value: text.slice(0, bestMatch.index) });
  }
  const matchedSlice = text.slice(
    bestMatch.index,
    bestMatch.index + bestMatch.length,
  );
  nodes.push({
    type: "element",
    tagName: "mark",
    properties: {
      className: ["lumadesk-highlight"],
      "data-testid": "highlighted-snippet",
    },
    children: [{ type: "text", value: matchedSlice }],
  });

  const rest = text.slice(bestMatch.index + bestMatch.length);
  if (rest) {
    const nested = highlightTextInHast(rest, regexes);
    if (nested) {
      nodes.push(...nested);
    } else {
      nodes.push({ type: "text", value: rest });
    }
  }
  return nodes;
}

function createRehypeHighlightPlugin(phrases: string[]) {
  const regexes = phrases
    .map(buildFlexiblePhraseRegex)
    .filter((r): r is RegExp => r !== null);

  return function rehypeHighlightSnippet() {
    return (tree: HastNode) => {
      if (regexes.length === 0) return;
      const visit = (node: HastNode) => {
        if (
          !node.children ||
          node.tagName === "code" ||
          node.tagName === "pre" ||
          node.tagName === "mark"
        ) {
          return;
        }
        const nextChildren: HastNode[] = [];
        for (const child of node.children) {
          if (child.type === "text" && typeof child.value === "string") {
            const highlighted = highlightTextInHast(child.value, regexes);
            if (highlighted) {
              nextChildren.push(...highlighted);
              continue;
            }
          }
          visit(child);
          nextChildren.push(child);
        }
        node.children = nextChildren;
      };
      visit(tree);
    };
  };
}

export interface MarkdownContentProps {
  content: string;
  citations?: Citation[];
  activeCitationKey?: string;
  onSelectCitation?: (citation: Citation) => void;
  highlightSnippet?: string;
  className?: string;
}

export function MarkdownContent({
  content,
  citations = [],
  activeCitationKey,
  onSelectCitation,
  highlightSnippet,
  className,
}: MarkdownContentProps) {
  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    for (const c of citations) {
      map.set(c.id, c);
    }
    return map;
  }, [citations]);

  const citationIdsKey = useMemo(
    () => citations.map((c) => c.id).join(","),
    [citations],
  );

  const remarkPlugins = useMemo(() => {
    const ids = new Set<number>(
      citationIdsKey
        .split(",")
        .filter(Boolean)
        .map((s) => Number(s)),
    );
    if (ids.size === 0 || !onSelectCitation) {
      return [remarkGfm];
    }
    return [remarkGfm, createRemarkCitationsPlugin(ids)];
  }, [citationIdsKey, onSelectCitation]);

  const rehypePlugins = useMemo(() => {
    const phrases = extractHighlightPhrases(highlightSnippet);
    if (phrases.length === 0) {
      return [rehypeSanitize];
    }
    return [rehypeSanitize, createRehypeHighlightPlugin(phrases)];
  }, [highlightSnippet]);

  const components = useMemo<Components>(
    () => ({
      a: ({
        href,
        children,
        ...props
      }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => {
        if (
          href &&
          href.startsWith(CITATION_HREF_PREFIX) &&
          onSelectCitation
        ) {
          const id = Number(href.slice(CITATION_HREF_PREFIX.length));
          const citation = citationMap.get(id);
          if (citation) {
            const key = `${citation.doc_id}:${citation.id}:${citation.snippet}`;
            return (
              <CitationChip
                citation={citation}
                onSelect={onSelectCitation}
                active={activeCitationKey === key}
              />
            );
          }
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [citationMap, onSelectCitation, activeCitationKey],
  );

  return (
    <div className={cn("lumadesk-prose", className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
