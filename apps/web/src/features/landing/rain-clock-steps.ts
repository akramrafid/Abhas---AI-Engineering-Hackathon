import type { RiskTier } from "@/components/brand/RiskTierBadge";
import type { MapView } from "@/components/ward-map/geo";
import type { MapMode, MapWard } from "@/components/ward-map/WardRiskMap";
import { DEMO_CONFIG } from "@/lib/demo-config";

/** Forecast origins shown on the landing page (both verified against the dataset in demo-config). */
export const STORM_ORIGIN = DEMO_CONFIG.originWeek; // 2024-08-05: 216 mm on DSCC Ward 4
export const DRY_ORIGIN = DEMO_CONFIG.scenarioBaseline.originWeek; // 2024-05-27: pre-monsoon
export const SPOTLIGHT_WARD = DEMO_CONFIG.wardId; // DSCC_Ward_04

export type StepId = "rain" | "h1" | "h2" | "h3" | "h4" | "dry";

export interface RainClockStep {
  id: StepId;
  clockLabel: string;
  origin: "storm" | "dry";
  mode: MapMode;
  horizon: number | null;
  view: MapView;
}

export const RAIN_CLOCK_STEPS: readonly RainClockStep[] = [
  { id: "rain", clockLabel: "Rain", origin: "storm", mode: "rain", horizon: null, view: "dhaka" },
  { id: "h1", clockLabel: "+1 wk", origin: "storm", mode: "risk", horizon: 1, view: "dhaka" },
  { id: "h2", clockLabel: "+2 wk", origin: "storm", mode: "risk", horizon: 2, view: "dhaka" },
  { id: "h3", clockLabel: "+3 wk", origin: "storm", mode: "risk", horizon: 3, view: "dhaka" },
  { id: "h4", clockLabel: "+4 wk", origin: "storm", mode: "risk", horizon: 4, view: "all" },
  { id: "dry", clockLabel: "Dry week", origin: "dry", mode: "risk", horizon: 3, view: "all" },
];

export const DHAKA_AREA = new Set(["Dhaka North", "Dhaka South", "Gazipur", "Narayanganj"]);

export type TierCounts = Record<RiskTier, number> & { total: number };

export function countTiers(wards: readonly MapWard[], onlyCities?: Set<string>): TierCounts {
  const counts: TierCounts = { Low: 0, Medium: 0, High: 0, Critical: 0, total: 0 };
  for (const ward of wards) {
    if (onlyCities && !onlyCities.has(ward.city)) continue;
    if (!ward.tier) continue;
    counts[ward.tier] += 1;
    counts.total += 1;
  }
  return counts;
}
