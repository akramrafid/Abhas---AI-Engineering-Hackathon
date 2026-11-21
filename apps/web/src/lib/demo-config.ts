import type { City } from "@/lib/api/client";

export type HorizonWindow = "1-4w" | "2-4w";

export const WINDOW_HORIZONS: Record<HorizonWindow, readonly number[]> = {
  "1-4w": [1, 2, 3, 4],
  "2-4w": [2, 3, 4],
};

/**
 * Pinned demo state for `/?demo=1` (AC-11, offline dataset mode).
 *
 * Measured in `data/raw/hackathon_preli_dataset.xlsx`:
 * - Origin week 2024-08-05 (Monday): monsoon heavy rain (216.4 mm in DSCC_Ward_04;
 *   >200 mm across 6 DSCC wards) followed 3 weeks later (2024-08-26) by a Critical
 *   peak of 23 cases in DSCC_Ward_04 (h+2=10, h+3=23, h+4=11).
 * - If running against the single-ward skeleton stub (DSCC_Ward_07 only), the UI
 *   falls back cleanly to the first ward in Dhaka South.
 */
export const DEMO_CONFIG = {
  city: "Dhaka South" as City,
  wardId: "DSCC_Ward_04",
  originWeek: "2024-08-05",
  window: "2-4w" as HorizonWindow,
  scenarioRainfallMm: 120,
} as const;

export const DEFAULT_FIRST_FORECAST_ORIGIN = "2016-02-29";
export const DEFAULT_DATA_END = "2025-12-29";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function parseIsoUtc(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ts = Date.UTC(year, month - 1, day);
  return Number.isFinite(ts) ? ts : null;
}

function formatUtcIso(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Generate every Monday ISO date within [firstOrigin, dataEnd], newest first.
 */
export function generateMondayWeeks(firstOrigin: string, dataEnd: string): string[] {
  const startTs = parseIsoUtc(firstOrigin);
  const endTs = parseIsoUtc(dataEnd);
  if (startTs === null || endTs === null || startTs > endTs) {
    return [DEMO_CONFIG.originWeek];
  }

  // Align startTs forward to Monday (UTC day 1) if needed.
  const startDay = new Date(startTs).getUTCDay();
  const offsetDays = startDay === 1 ? 0 : (8 - startDay) % 7;
  const firstMonday = startTs + offsetDays * MS_PER_DAY;

  const weeks: string[] = [];
  for (let ts = firstMonday; ts <= endTs; ts += MS_PER_WEEK) {
    weeks.push(formatUtcIso(ts));
  }
  return weeks.reverse();
}

export function isValidMondayInRange(
  isoDate: string,
  firstOrigin: string,
  dataEnd: string,
): boolean {
  const ts = parseIsoUtc(isoDate);
  const startTs = parseIsoUtc(firstOrigin);
  const endTs = parseIsoUtc(dataEnd);
  if (ts === null || startTs === null || endTs === null) return false;
  if (ts < startTs || ts > endTs) return false;
  return new Date(ts).getUTCDay() === 1;
}
