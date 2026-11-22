import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { formatShortDate } from "@/lib/dates";
import type { MapMode, MapWard } from "./WardRiskMap";

export interface WardMapTooltipProps {
  x: number;
  y: number;
  title: string;
  ward: MapWard;
  mode: MapMode;
}

/** Flips below the cursor near the map's top edge so the card is never clipped. */
const FLIP_BELOW_PX = 150;

export function WardMapTooltip({ x, y, title, ward, mode }: WardMapTooltipProps) {
  const below = y < FLIP_BELOW_PX;
  return (
    <div
      role="status"
      data-testid="ward-map-tooltip"
      className={`pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-lg bg-white p-3 text-ink shadow-xl shadow-ink/40 ${
        below ? "translate-y-[14px]" : "-translate-y-[calc(100%+14px)]"
      }`}
      style={{ left: `clamp(7.5rem, ${x}px, calc(100% - 7.5rem))`, top: y }}
    >
      <p className="text-sm font-bold">{title}</p>
      {mode === "risk" && ward.tier ? (
        <>
          <RiskTierBadge tier={ward.tier} size="sm" className="mt-2" />
          <p className="mt-2 font-mono text-xs text-slate tnum">
            {ward.expected_cases !== null ? `${ward.expected_cases.toFixed(1)} expected cases` : ""}
            {ward.target_week ? ` · week of ${formatShortDate(ward.target_week)}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate">Rain week. Risk shows up 2 to 4 weeks later.</p>
      )}
    </div>
  );
}
