import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const intFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const msFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

const pctFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms >= 1000) {
    return `${msFormatter.format(ms / 1000)} s`;
  }
  return `${intFormatter.format(Math.round(ms))} ms`;
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  return intFormatter.format(Math.round(count));
}

export function formatCostUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.0000";
  return usdFormatter.format(cost);
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0) return "0.0%";
  return pctFormatter.format(Math.min(1, ratio));
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormatter.format(date);
}

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  outage: "Outage",
  technical: "Technical",
  plan_change: "Plan Change",
  account_security: "Account Security",
  cancellation: "Cancellation",
  other: "Other",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  bn: "Bangla (বাংলা)",
  banglish: "Banglish",
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  angry: "Angry",
};

const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function formatCategory(value: string): string {
  return CATEGORY_LABELS[value] ?? value.replaceAll("_", " ");
}

export function formatLanguage(value: string): string {
  return LANGUAGE_LABELS[value] ?? value;
}

export function formatSentiment(value: string): string {
  return SENTIMENT_LABELS[value] ?? value;
}

export function formatUrgency(value: string): string {
  return URGENCY_LABELS[value] ?? value;
}

/**
 * Splits `text` into segments highlighting `needle` (case-insensitive) when present.
 * Falls back to exact whitespace-collapsed match if raw substring differs by spacing.
 */
export function splitWithHighlight(
  text: string,
  needle: string | null | undefined,
): Array<{ text: string; highlighted: boolean }> {
  const cleanNeedle = needle?.trim();
  if (!cleanNeedle || !text) {
    return [{ text, highlighted: false }];
  }

  const lowerText = text.toLowerCase();
  const lowerNeedle = cleanNeedle.toLowerCase();
  const directIdx = lowerText.indexOf(lowerNeedle);

  if (directIdx !== -1) {
    const before = text.slice(0, directIdx);
    const match = text.slice(directIdx, directIdx + cleanNeedle.length);
    const after = text.slice(directIdx + cleanNeedle.length);
    const segments: Array<{ text: string; highlighted: boolean }> = [];
    if (before) segments.push({ text: before, highlighted: false });
    segments.push({ text: match, highlighted: true });
    if (after) segments.push({ text: after, highlighted: false });
    return segments;
  }

  // Fallback: match ignoring collapsed whitespace differences
  const escapedTokens = cleanNeedle
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escapedTokens.length === 0) {
    return [{ text, highlighted: false }];
  }

  const flexRegex = new RegExp(escapedTokens.join("\\s+"), "i");
  const match = flexRegex.exec(text);
  if (!match) {
    return [{ text, highlighted: false }];
  }

  const start = match.index;
  const end = start + match[0].length;
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  if (start > 0) segments.push({ text: text.slice(0, start), highlighted: false });
  segments.push({ text: text.slice(start, end), highlighted: true });
  if (end < text.length) segments.push({ text: text.slice(end), highlighted: false });
  return segments;
}
