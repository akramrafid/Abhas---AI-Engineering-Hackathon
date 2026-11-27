import { clsx } from "clsx";
import { CITY_CENTROIDS, MAP_VIEWS, wardLabel, type MapView } from "./geo";
import type { MapMode, MapWard } from "./WardRiskMap";

const TIER_FILL = {
  Low: "var(--color-risk-low)",
  Medium: "var(--color-risk-medium)",
  High: "var(--color-risk-high)",
  Critical: "var(--color-risk-critical)",
} as const;

export interface WardMapFallbackProps {
  wards: readonly MapWard[];
  view: MapView;
  mode: MapMode;
  label: string;
  highlightWardId: string | null;
  onSelectWard?: (wardId: string) => void;
  testId?: string;
  className?: string;
}

/** Plain SVG schematic plot of the same ward positions, used when WebGL is unavailable. */
export function WardMapFallback({
  wards,
  view,
  mode,
  label,
  highlightWardId,
  onSelectWard,
  testId = "ward-risk-map",
  className,
}: WardMapFallbackProps) {
  const [west, south, east, north] = MAP_VIEWS[view];
  const width = 1000;
  const height = Math.round(
    (width * (north - south)) / ((east - west) * Math.cos((23.7 * Math.PI) / 180)),
  );
  const project = (lon: number, lat: number): [number, number] => [
    ((lon - west) / (east - west)) * width,
    ((north - lat) / (north - south)) * height,
  ];

  const vLines = [0.2, 0.4, 0.6, 0.8].map((t) => Math.round(width * t));
  const hLines = [0.2, 0.4, 0.6, 0.8].map((t) => Math.round(height * t));

  return (
    <div
      className={clsx("relative overflow-hidden bg-ink", className)}
      data-testid={testId}
      data-map-mode={mode}
      data-map-ready="fallback"
      data-map-offline="true"
    >
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-full w-full">
        {vLines.map((x) => (
          <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#1b2a52" strokeWidth={1} />
        ))}
        {hLines.map((y) => (
          <line key={`h-${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#1b2a52" strokeWidth={1} />
        ))}
        {Object.entries(CITY_CENTROIDS).map(([city, [lon, lat]]) => {
          const [cx, cy] = project(lon, lat);
          if (cx < -60 || cx > width + 60 || cy < -60 || cy > height + 60) return null;
          return (
            <circle
              key={city}
              cx={cx}
              cy={cy}
              r={46}
              fill="var(--color-navy)"
              fillOpacity={0.35}
              stroke="var(--color-royal)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />
          );
        })}
        {wards.map((ward) => {
          const [x, y] = project(ward.position[0], ward.position[1]);
          const fill = mode === "risk" && ward.tier ? TIER_FILL[ward.tier] : "var(--color-royal)";
          const isHighlighted = ward.ward_id === highlightWardId;
          return (
            <circle
              key={ward.ward_id}
              cx={x}
              cy={y}
              r={isHighlighted ? 11 : 8}
              fill={fill}
              stroke={isHighlighted ? "var(--color-white)" : "var(--color-ink)"}
              strokeWidth={isHighlighted ? 3 : 1}
              className={onSelectWard ? "cursor-pointer" : undefined}
              onClick={onSelectWard ? () => onSelectWard(ward.ward_id) : undefined}
            >
              <title>{`${wardLabel(ward.ward_id)} · ${ward.city}${ward.tier ? ` · ${ward.tier}` : ""}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
