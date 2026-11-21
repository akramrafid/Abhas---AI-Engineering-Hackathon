const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function parseIsoUtc(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ts = Date.UTC(year, month - 1, day);
  return Number.isFinite(ts) ? ts : null;
}

export function formatUtcIso(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(isoDate: string, deltaDays: number): string | null {
  const ts = parseIsoUtc(isoDate);
  if (ts === null) return null;
  return formatUtcIso(ts + deltaDays * MS_PER_DAY);
}

export function formatShortDate(isoDate: string): string {
  const ts = parseIsoUtc(isoDate);
  if (ts === null) return isoDate;
  const d = new Date(ts);
  const day = d.getUTCDate();
  const mon = SHORT_MONTHS[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  return `${day} ${mon} ${yr}`;
}

export interface IsoWeekInfo {
  isoYear: number;
  isoWeek: number;
  mondayIso: string;
  sundayIso: string;
  rangeLabel: string;
  shortLabel: string;
}

/**
 * Format an ISO Monday date (e.g. "2024-08-05") as ISO week + Mon–Sun date range:
 * "W32 2024 · 5–11 Aug"
 */
export function getIsoWeekInfo(isoMonday: string): IsoWeekInfo | null {
  const startTs = parseIsoUtc(isoMonday);
  if (startTs === null) return null;

  const start = new Date(startTs);
  const endTs = startTs + 6 * MS_PER_DAY;
  const end = new Date(endTs);

  const dayNum = start.getUTCDay() || 7;
  const thursdayTs = startTs + (4 - dayNum) * MS_PER_DAY;
  const thursday = new Date(thursdayTs);
  const isoYear = thursday.getUTCFullYear();
  const jan1Ts = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((thursdayTs - jan1Ts) / MS_PER_DAY + 1) / 7);

  const startDay = start.getUTCDate();
  const startMon = SHORT_MONTHS[start.getUTCMonth()];
  const endDay = end.getUTCDate();
  const endMon = SHORT_MONTHS[end.getUTCMonth()];

  const rangeLabel =
    startMon === endMon
      ? `${startDay}–${endDay} ${startMon}`
      : `${startDay} ${startMon}–${endDay} ${endMon}`;

  const weekTag = `W${String(isoWeek).padStart(2, "0")} ${isoYear}`;
  return {
    isoYear,
    isoWeek,
    mondayIso: isoMonday,
    sundayIso: formatUtcIso(endTs),
    rangeLabel,
    shortLabel: `${weekTag} · ${rangeLabel}`,
  };
}

export function formatOriginWeekOption(isoMonday: string): string {
  const info = getIsoWeekInfo(isoMonday);
  if (!info) return `${isoMonday} (Mon)`;
  return `${info.shortLabel} (${isoMonday})`;
}

export interface ActByDeadline {
  isoDate: string;
  displayDate: string;
  urgent: boolean;
}

/**
 * Compute the larviciding / pre-emptive action deadline:
 * 14 days before the peak target week (clamped to originWeek if peak is < 2 weeks away).
 */
export function computeActByDate(
  peakTargetWeek: string,
  originWeek: string,
): ActByDeadline {
  const targetTs = parseIsoUtc(peakTargetWeek);
  const originTs = parseIsoUtc(originWeek);
  if (targetTs === null) {
    return {
      isoDate: originWeek,
      displayDate: formatShortDate(originWeek),
      urgent: true,
    };
  }
  const rawActTs = targetTs - 14 * MS_PER_DAY;
  if (originTs !== null && rawActTs <= originTs) {
    return {
      isoDate: originWeek,
      displayDate: formatShortDate(originWeek),
      urgent: true,
    };
  }
  const isoDate = formatUtcIso(rawActTs);
  return {
    isoDate,
    displayDate: formatShortDate(isoDate),
    urgent: false,
  };
}
