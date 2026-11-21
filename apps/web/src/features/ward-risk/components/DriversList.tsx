import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";
import type { Driver } from "@/lib/api/client";

export interface DriversListProps {
  drivers: readonly Driver[];
  horizonLabel: string;
}

export function DriversList({ drivers, horizonLabel }: DriversListProps) {
  const topDrivers = drivers.slice(0, 4);
  const maxAbs = Math.max(10, ...topDrivers.map((d) => Math.abs(d.effect_pct)));

  if (topDrivers.length === 0) {
    return (
      <div
        data-testid="drivers-panel"
        className="rounded-md border border-mist bg-paper p-4 text-sm text-slate"
      >
        No feature attribution drivers returned for {horizonLabel}.
      </div>
    );
  }

  return (
    <div data-testid="drivers-panel" className="space-y-3">
      <p className="text-xs font-medium text-slate">
        Multiplicative SHAP effect on expected cases ({horizonLabel})
      </p>
      <ul className="space-y-3">
        {topDrivers.map((driver) => {
          const isUp = driver.direction === "up";
          const sign = driver.effect_pct > 0 ? "+" : "";
          const formattedPct = `${sign}${Math.round(driver.effect_pct)}%`;
          const widthPct = Math.max(6, Math.min(100, (Math.abs(driver.effect_pct) / maxAbs) * 100));

          return (
            <li
              key={driver.key}
              data-testid={`driver-row-${driver.key}`}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  {isUp ? (
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-royal"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowDownRight
                      className="h-4 w-4 shrink-0 text-slate"
                      aria-hidden="true"
                    />
                  )}
                  <span>{driver.label}</span>
                </span>
                <span
                  className={clsx(
                    "font-mono text-sm font-semibold tnum",
                    isUp ? "text-navy" : "text-slate",
                  )}
                >
                  {formattedPct}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-sm bg-paper border border-mist"
                aria-hidden="true"
              >
                <div
                  className={clsx(
                    "h-full rounded-sm",
                    isUp ? "bg-royal" : "bg-slate",
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
