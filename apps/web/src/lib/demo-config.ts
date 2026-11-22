import type { City } from "@/lib/api/client";
import { formatUtcIso, parseIsoUtc } from "@/lib/dates";

export type HorizonWindow = "1w" | "2-4w" | "1-4w";

export const VALID_WINDOWS: readonly HorizonWindow[] = ["1w", "2-4w", "1-4w"] as const;

export function isHorizonWindow(value: string | null): value is HorizonWindow {
  return value !== null && (VALID_WINDOWS as readonly string[]).includes(value);
}

export const WINDOW_HORIZONS: Record<HorizonWindow, readonly number[]> = {
  "1w": [1],
  "2-4w": [2, 3, 4],
  "1-4w": [1, 2, 3, 4],
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
  // AC-7 baseline (CR-2): non-Critical Dhaka South ward-week with < 20 mm rain
  // (2024-08-05 had 216.38 mm in DSCC_Ward_04). Verified via GET /api/v1/wards/DSCC_Ward_04/history:
  // pre-monsoon Monday 2024-05-27 had 10.33 mm observed rainfall and 0 dengue cases
  // (h+1..+4 actuals: 2, 1, 4, 4 — all non-Critical), so 120 mm models a realistic surge.
  scenarioBaseline: {
    wardId: "DSCC_Ward_04",
    originWeek: "2024-05-27",
  },
} as const;

export const DEFAULT_FIRST_FORECAST_ORIGIN = "2016-02-29";
export const DEFAULT_DATA_END = "2025-12-29";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

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
