import type { Driver, RiskTier } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface SuggestedAction {
  id: string;
  category: "hospital" | "larviciding" | "sanitation" | "surveillance";
  label: string;
}

const RAIN_KEYS = new Set<Driver["key"]>(["rain_2_4w", "recent_rain", "water_logging"]);
const SANITATION_KEYS = new Set<Driver["key"]>(["sanitation", "crowding"]);

/**
 * Deterministic public-health action rules derived from peak risk tier and SHAP drivers (§11):
 * - Critical tier -> hospital bed, IV saline & NS1 test-kit stock alert
 * - Rain / water-logging positive driver -> larviciding & drain clearing
 * - Sanitation / crowding positive driver -> community clean-up & source reduction
 * - High tier -> hotspot larviciding & clinic alert
 * - Medium / Low baseline -> site inspection / routine surveillance
 */
export function deriveSuggestedActions(
  tier: RiskTier,
  drivers: readonly Driver[],
  lang: Lang = "en",
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const positiveKeys = new Set(
    drivers.filter((d) => d.effect_pct > 0).map((d) => d.key),
  );

  const rainDriven = Array.from(positiveKeys).some((k) => RAIN_KEYS.has(k));
  const sanitationDriven = Array.from(positiveKeys).some((k) => SANITATION_KEYS.has(k));

  if (tier === "Critical") {
    actions.push({
      id: "hospital-stock-alert",
      category: "hospital",
      label:
        lang === "bn"
          ? "হাসপাতাল ও ক্লিনিকে শয্যা, স্যালাইন ও এনএস১ কিট মজুত সতর্কতা জারি করুন"
          : "Hospital stock alert: ready beds, IV saline, and NS1 test kits",
    });
  }

  if (rainDriven && (tier === "Critical" || tier === "High" || tier === "Medium")) {
    actions.push({
      id: "larviciding-drain-clearing",
      category: "larviciding",
      label:
        lang === "bn"
          ? "জমে থাকা পানিতে লার্ভিসাইড প্রয়োগ ও ড্রেন পরিষ্কার করুন"
          : "Larviciding & drain clearing across standing-water hotspots",
    });
  }

  if (sanitationDriven && (tier === "Critical" || tier === "High" || tier === "Medium")) {
    actions.push({
      id: "community-cleanup",
      category: "sanitation",
      label:
        lang === "bn"
          ? "কমিউনিটি পরিচ্ছন্নতা ও পাত্র অপসারণ অভিযান চালান"
          : "Community clean-up & container source-reduction drive",
    });
  }

  if (actions.length === 0) {
    if (tier === "High") {
      actions.push({
        id: "high-hotspot-larvicide",
        category: "larviciding",
        label:
          lang === "bn"
            ? "হটস্পটে লার্ভিসাইড প্রয়োগ করুন ও স্থানীয় ক্লিনিক সতর্ক করুন"
            : "Larvicide hotspots and alert local ward clinics",
      });
    } else if (tier === "Medium") {
      actions.push({
        id: "medium-inspect",
        category: "surveillance",
        label:
          lang === "bn"
            ? "এই সপ্তাহে ছাদ, টায়ার ও নির্মাণস্থলের প্রজননস্থল পরিদর্শন করুন"
            : "Inspect rooftop tanks, tyres, and construction breeding sites",
      });
    } else {
      actions.push({
        id: "low-routine",
        category: "surveillance",
        label:
          lang === "bn"
            ? "নিয়মিত সাপ্তাহিক মশা ও লার্ভা নজরদারি চালিয়ে যান"
            : "Maintain routine weekly entomological surveillance",
      });
    }
  }

  return actions;
}

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

/**
 * Neutralize spreadsheet formula injection (OWASP CSV Injection defense):
 * prefix any cell starting with =, +, -, @, tab, or carriage-return with a single quote ('),
 * then RFC-4180 quote when commas, quotes, or newlines are present.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_TRIGGER_RE.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export interface PriorityCsvRow {
  rank: number;
  wardId: string;
  city: string;
  originWeek: string;
  peakTier: RiskTier;
  peakHorizon: number;
  peakTargetWeek: string;
  expectedCases: number;
  p10: number;
  p90: number;
  riskScore: number;
  actByDate: string;
  topDriver: string;
  suggestedActions: string;
}

export function buildPriorityCsv(rows: readonly PriorityCsvRow[]): string {
  const headers = [
    "rank",
    "ward_id",
    "city",
    "origin_week",
    "peak_tier",
    "peak_horizon_weeks",
    "peak_target_week",
    "expected_cases",
    "band_p10",
    "band_p90",
    "risk_score",
    "act_by_date",
    "top_driver",
    "suggested_actions",
  ];

  const lines = [headers.map(sanitizeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.rank,
        row.wardId,
        row.city,
        row.originWeek,
        row.peakTier,
        row.peakHorizon,
        row.peakTargetWeek,
        row.expectedCases.toFixed(1),
        row.p10.toFixed(1),
        row.p90.toFixed(1),
        row.riskScore,
        row.actByDate,
        row.topDriver,
        row.suggestedActions,
      ]
        .map(sanitizeCsvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
