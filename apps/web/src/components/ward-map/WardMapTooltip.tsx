import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { formatShortDate } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";
import type { MapMode, MapWard } from "./WardRiskMap";

export interface WardMapTooltipProps {
  x: number;
  y: number;
  title: string;
  ward: MapWard;
  mode: MapMode;
  pinned?: boolean;
  lang?: Lang;
}

/** Flips below the coordinate near the map's top edge so the card is never clipped. */
const FLIP_BELOW_PX = 165;

export function WardMapTooltip({
  x,
  y,
  title,
  ward,
  mode,
  pinned = false,
  lang = "en",
}: WardMapTooltipProps) {
  const below = y < FLIP_BELOW_PX;
  const bn = lang === "bn";
  const [lon, lat] = ward.position;

  return (
    <div
      role="status"
      data-testid="ward-map-tooltip"
      className={clsx(
        "pointer-events-none absolute z-20 w-60 -translate-x-1/2 rounded-xl bg-white/95 p-3.5 text-ink shadow-xl shadow-ink/45 ring-1 ring-mist/90 backdrop-blur-md transition-[left,top] duration-75",
        below ? "translate-y-[16px]" : "-translate-y-[calc(100%+16px)]",
      )}
      style={{ left: `clamp(8rem, ${x}px, calc(100% - 8rem))`, top: y }}
    >
      {/* Pointer caret visually anchoring card to the exact map dot */}
      <span
        aria-hidden="true"
        className={clsx(
          "absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white ring-mist/90",
          below
            ? "-top-1.5 border-l border-t border-mist/90"
            : "-bottom-1.5 border-b border-r border-mist/90",
        )}
      />

      <div className="flex items-start justify-between gap-2">
        <p className={clsx("text-sm font-bold leading-snug text-navy", bn && "font-bangla")}>
          {title}
        </p>
        {pinned ? (
          <span className="shrink-0 rounded-full bg-royal/10 px-2 py-0.5 text-[10px] font-bold text-royal">
            {bn ? "নির্বাচিত" : "Pinned"}
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-[10px] font-medium text-slate tnum">
        {lat.toFixed(3)}°N, {lon.toFixed(3)}°E
      </p>

      {mode === "risk" && ward.tier ? (
        <>
          <RiskTierBadge tier={ward.tier} size="sm" lang={lang} className="mt-2" />
          <p className={clsx("mt-2 text-xs font-semibold text-navy tnum", bn && "font-bangla")}>
            {ward.expected_cases !== null
              ? bn
                ? `${ward.expected_cases.toFixed(1)} প্রত্যাশিত রোগী`
                : `${ward.expected_cases.toFixed(1)} expected cases`
              : ""}
            {ward.target_week ? (
              <span className="font-normal text-slate">
                {` · ${formatShortDate(ward.target_week)}`}
              </span>
            ) : null}
          </p>
        </>
      ) : (
        <p className={clsx("mt-1.5 text-xs text-slate", bn && "font-bangla")}>
          {bn
            ? "বৃষ্টির সপ্তাহ। ২–৪ সপ্তাহ পর ঝুঁকি দেখা দেয়।"
            : "Rain week. Risk shows up 2 to 4 weeks later."}
        </p>
      )}
    </div>
  );
}
