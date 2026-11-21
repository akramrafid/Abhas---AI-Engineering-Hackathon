"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { clsx } from "clsx";
import { RiskTierBadge, TIER_ORDER } from "@/components/brand/RiskTierBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { StubDataBanner } from "@/components/ui/StubDataBanner";
import { PrintableWardBrief } from "@/components/ward-brief/PrintableWardBrief";
import { useCityForecastQuery } from "@/lib/api/queries";
import type {
  City,
  HorizonForecast,
  RiskTier,
  Ward,
  WardForecast,
  WeatherMode,
} from "@/lib/api/client";
import {
  buildPriorityCsv,
  deriveSuggestedActions,
  type PriorityCsvRow,
} from "@/lib/actions";
import { computeActByDate, getIsoWeekInfo } from "@/lib/dates";
import { WINDOW_HORIZONS, type HorizonWindow } from "@/lib/demo-config";
import { formatDriverLabel, UI_COPY, type Lang } from "@/lib/i18n";

export interface PriorityListViewProps {
  city: City;
  cityWards: readonly Ward[];
  selectedWardId: string;
  originWeek: string;
  windowKey: HorizonWindow;
  source: WeatherMode;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
  onResetCity: () => void;
}

const TIER_RANK: Record<RiskTier, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

function findPeakHorizon(horizons: readonly HorizonForecast[]): HorizonForecast | null {
  if (horizons.length === 0) return null;
  return horizons.reduce((best, cur) => {
    const rankDiff = TIER_RANK[cur.tier] - TIER_RANK[best.tier];
    if (rankDiff !== 0) return rankDiff > 0 ? cur : best;
    return cur.expected_cases > best.expected_cases ? cur : best;
  }, horizons[0]);
}

export function PriorityListView({
  city,
  cityWards,
  selectedWardId,
  originWeek,
  windowKey,
  source,
  lang,
  onSelectWard,
  onResetCity,
}: PriorityListViewProps) {
  const [tierFilter, setTierFilter] = useState<RiskTier | "ALL">("ALL");
  const [briefWardId, setBriefWardId] = useState<string | null>(null);
  const copy = UI_COPY[lang].priority;

  const wardIds = useMemo(() => cityWards.map((w) => w.ward_id), [cityWards]);
  const horizons = WINDOW_HORIZONS[windowKey];

  const forecastQuery = useCityForecastQuery({
    wardIds,
    originWeek,
    horizons,
    source,
    enabled: wardIds.length > 0 && Boolean(originWeek),
  });

  const wardMetaMap = useMemo(() => {
    const m = new Map<string, Ward>();
    for (const w of cityWards) m.set(w.ward_id, w);
    return m;
  }, [cityWards]);

  const rankedItems = useMemo(() => {
    const list = forecastQuery.data?.forecasts ?? [];
    const sorted = [...list].sort((a, b) => {
      const tierDiff = TIER_RANK[b.peak_tier] - TIER_RANK[a.peak_tier];
      if (tierDiff !== 0) return tierDiff;
      const peakA = findPeakHorizon(a.horizons);
      const peakB = findPeakHorizon(b.horizons);
      const caseDiff = (peakB?.expected_cases ?? 0) - (peakA?.expected_cases ?? 0);
      if (caseDiff !== 0) return caseDiff;
      return a.ward_id.localeCompare(b.ward_id);
    });

    return sorted
      .map((fc, idx) => {
        const peak = findPeakHorizon(fc.horizons);
        if (!peak) return null;
        const actBy = computeActByDate(peak.target_week, originWeek);
        const actions = deriveSuggestedActions(fc.peak_tier, peak.drivers, lang);
        const topDriver = peak.drivers[0]
          ? `${formatDriverLabel(peak.drivers[0], lang)} (${peak.drivers[0].effect_pct > 0 ? "+" : ""}${Math.round(peak.drivers[0].effect_pct)}%)`
          : "—";
        return {
          rank: idx + 1,
          forecast: fc,
          peak,
          actBy,
          actions,
          topDriver,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [forecastQuery.data?.forecasts, originWeek, lang]);

  const visibleItems = useMemo(() => {
    if (tierFilter === "ALL") return rankedItems;
    return rankedItems.filter((item) => item.forecast.peak_tier === tierFilter);
  }, [rankedItems, tierFilter]);

  if (forecastQuery.isError) {
    return (
      <ErrorBanner
        testId="priority-error-banner"
        retryTestId="priority-retry"
        title="Could not load city priority list"
        error={forecastQuery.error}
        onRetry={() => {
          void forecastQuery.refetch();
        }}
      />
    );
  }

  if (forecastQuery.isPending) {
    return (
      <PanelSkeleton
        testId="priority-loading"
        label="Ranking city wards by dengue risk…"
      />
    );
  }

  const response = forecastQuery.data;
  if (!response || rankedItems.length === 0) {
    return (
      <EmptyState
        testId="priority-empty-state"
        title={copy.emptyTitle}
        description={copy.emptyDesc}
        actionLabel="Reset to Dhaka South"
        onAction={onResetCity}
      />
    );
  }

  const activeBriefItem =
    rankedItems.find((r) => r.forecast.ward_id === (briefWardId ?? selectedWardId)) ??
    rankedItems[0];
  const originInfo = getIsoWeekInfo(response.origin_week);

  const handleExportCsv = () => {
    const csvRows: PriorityCsvRow[] = visibleItems.map((item) => ({
      rank: item.rank,
      wardId: item.forecast.ward_id,
      city: item.forecast.city,
      originWeek: response.origin_week,
      peakTier: item.forecast.peak_tier,
      peakHorizon: item.peak.horizon,
      peakTargetWeek: item.peak.target_week,
      expectedCases: item.peak.expected_cases,
      p10: item.peak.p10,
      p90: item.peak.p90,
      riskScore: item.peak.risk_score,
      actByDate: item.actBy.isoDate,
      topDriver: item.topDriver,
      suggestedActions: item.actions.map((a) => a.label).join("; "),
    }));

    const csvText = buildPriorityCsv(csvRows);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const slugCity = city.toLowerCase().replace(/\s+/g, "-");
    anchor.href = url;
    anchor.download = `abhas-priority-${slugCity}-${response.origin_week}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrintWard = (fc: WardForecast) => {
    setBriefWardId(fc.ward_id);
    if (typeof window !== "undefined") {
      setTimeout(() => window.print(), 50);
    }
  };

  return (
    <div data-testid="priority-panel" className="space-y-5">
      <StubDataBanner modelVersion={response.model_version} />

      <PrintableWardBrief
        forecast={activeBriefItem.forecast}
        wardMeta={wardMetaMap.get(activeBriefItem.forecast.ward_id)}
        originWeek={response.origin_week}
        modelVersion={response.model_version}
        lang={lang}
      />

      <Card className="no-print overflow-hidden">
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.title} — {city}
            </CardTitle>
            <CardDescription className={lang === "bn" ? "font-bangla" : undefined}>
              {copy.description}
            </CardDescription>
            <p className="mt-1 font-mono text-xs text-slate tnum">
              Origin {originInfo ? `${originInfo.shortLabel} (${response.origin_week})` : response.origin_week} ·{" "}
              {visibleItems.length} / {rankedItems.length} wards · Model {response.model_version}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="priority-export-csv"
              onClick={handleExportCsv}
              className={clsx(
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-royal px-4 py-2 text-xs font-semibold text-white hover:bg-navy",
                lang === "bn" && "font-bangla",
              )}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{copy.exportCsv}</span>
            </button>

            <button
              type="button"
              data-testid="priority-print-brief"
              onClick={() => handlePrintWard(activeBriefItem.forecast)}
              className={clsx(
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-mist bg-white px-4 py-2 text-xs font-semibold text-navy hover:border-royal hover:bg-paper",
                lang === "bn" && "font-bangla",
              )}
            >
              <Printer className="h-4 w-4 text-royal" aria-hidden="true" />
              <span>{copy.printBrief}</span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="border-b border-mist bg-paper py-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter priority list by risk tier"
          >
            <button
              type="button"
              data-testid="priority-filter-all"
              aria-pressed={tierFilter === "ALL"}
              onClick={() => setTierFilter("ALL")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-md border px-2.5 text-xs font-semibold",
                tierFilter === "ALL"
                  ? "border-royal bg-royal text-white"
                  : "border-mist bg-white text-navy hover:bg-paper",
              )}
            >
              {copy.allTiers} ({rankedItems.length})
            </button>
            {([...TIER_ORDER].reverse() as RiskTier[]).map((tier) => {
              const count = rankedItems.filter((i) => i.forecast.peak_tier === tier).length;
              return (
                <button
                  key={tier}
                  type="button"
                  data-testid={`priority-filter-${tier.toLowerCase()}`}
                  aria-pressed={tierFilter === tier}
                  onClick={() => setTierFilter(tier)}
                  className={clsx(
                    "min-h-8 cursor-pointer rounded-md border px-2.5 font-mono text-xs font-semibold tnum",
                    tierFilter === tier
                      ? "border-royal bg-royal text-white"
                      : "border-mist bg-white text-navy hover:bg-paper",
                  )}
                >
                  {tier} ({count})
                </button>
              );
            })}
          </div>
        </CardContent>

        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Ranked ward priority table"
        >
          <table
            data-testid="priority-table"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr className="border-b border-mist bg-paper text-xs font-semibold text-slate">
                <th scope="col" className="px-3 py-2.5">{copy.rankCol}</th>
                <th scope="col" className="px-3 py-2.5">{copy.wardCol}</th>
                <th scope="col" className="px-3 py-2.5">{copy.tierCol}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{copy.expectedCol}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{copy.scoreCol}</th>
                <th scope="col" className="px-3 py-2.5">{copy.actByCol}</th>
                <th scope="col" className="px-3 py-2.5">{copy.actionsCol}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{copy.briefCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {visibleItems.map((item) => (
                <tr
                  key={item.forecast.ward_id}
                  data-testid={`priority-row-${item.forecast.ward_id}`}
                  className="bg-white align-top hover:bg-paper/60"
                >
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-slate tnum">
                    {item.rank}
                  </td>
                  <th scope="row" className="px-3 py-3 font-mono text-xs font-bold text-navy tnum">
                    <button
                      type="button"
                      onClick={() => onSelectWard(item.forecast.ward_id)}
                      className="cursor-pointer text-left text-navy underline-offset-2 hover:text-royal hover:underline"
                    >
                      {item.forecast.ward_id}
                    </button>
                    <p className="mt-0.5 font-sans text-[11px] font-normal text-slate">
                      Top: {item.topDriver}
                    </p>
                  </th>
                  <td className="px-3 py-3">
                    <RiskTierBadge tier={item.forecast.peak_tier} size="sm" lang={lang} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs tnum">
                    <span className="font-semibold text-ink">
                      {item.peak.expected_cases.toFixed(1)}
                    </span>{" "}
                    <span className="text-slate">
                      ({item.peak.p10.toFixed(1)}–{item.peak.p90.toFixed(1)})
                    </span>
                    <p className="text-[11px] text-slate">+{item.peak.horizon}w</p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-navy tnum">
                    {item.peak.risk_score}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-navy tnum">
                    <span className="font-semibold">{item.actBy.displayDate}</span>
                    <p className="text-[11px] text-slate">Peak {item.peak.target_week}</p>
                  </td>
                  <td className="px-3 py-3">
                    <ul
                      lang={lang}
                      className={clsx(
                        "list-disc space-y-1 pl-4 text-xs text-ink",
                        lang === "bn" && "font-bangla",
                      )}
                    >
                      {item.actions.map((act) => (
                        <li key={act.id}>{act.label}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrintWard(item.forecast)}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-mist bg-paper px-2.5 py-1 text-xs font-semibold text-navy hover:border-royal hover:bg-white"
                    >
                      <Printer className="h-3 w-3 text-royal" aria-hidden="true" />
                      <span>{copy.printOneWard}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
