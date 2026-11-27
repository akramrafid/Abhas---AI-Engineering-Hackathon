"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "@/components/icons";
import { clsx } from "clsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SelectField, type SelectOption } from "@/components/ui/Select";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import type { ApiError } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import type { OverflowResponse, Transfer } from "./api";

export interface StepRouteProps {
  horizon: number;
  serviceLevel: number;
  capacityOverrides: Record<string, number>;
  lang: Lang;
  data: OverflowResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onHorizonChange: (horizon: number) => void;
  onServiceLevelChange: (sl: number) => void;
  onCapacityOverrideChange: (wardId: string, capacity: number | null) => void;
  onResetOverrides: () => void;
}

const HORIZON_OPTIONS: readonly SelectOption[] = [
  { value: "1", label: "+1w" },
  { value: "2", label: "+2w" },
  { value: "3", label: "+3w (Peak window)" },
  { value: "4", label: "+4w" },
];

const SERVICE_LEVEL_OPTIONS: readonly SelectOption[] = [
  { value: "0.8", label: "P80 (0.80)" },
  { value: "0.9", label: "P90 (0.90 · Default)" },
  { value: "0.95", label: "P95 (0.95 · Conservative)" },
];

interface SankeyDiagramProps {
  transfers: readonly Transfer[];
}

function OverflowSankey({ transfers }: SankeyDiagramProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const layout = useMemo(() => {
    const senderTotals = new Map<string, { city: string; patients: number }>();
    const receiverTotals = new Map<string, { city: string; patients: number }>();

    for (const t of transfers) {
      const s = senderTotals.get(t.from_ward) ?? { city: t.city, patients: 0 };
      s.patients += t.patients;
      senderTotals.set(t.from_ward, s);

      const r = receiverTotals.get(t.to_ward) ?? { city: t.city, patients: 0 };
      r.patients += t.patients;
      receiverTotals.set(t.to_ward, r);
    }

    const senders = Array.from(senderTotals.entries()).sort(
      (a, b) => b[1].patients - a[1].patients || a[0].localeCompare(b[0]),
    );
    const receivers = Array.from(receiverTotals.entries()).sort(
      (a, b) => b[1].patients - a[1].patients || a[0].localeCompare(b[0]),
    );

    const rowHeight = 44;
    const rowGap = 12;
    const topPad = 32;
    const maxNodes = Math.max(senders.length, receivers.length, 1);
    const height = Math.max(180, topPad + maxNodes * (rowHeight + rowGap) + 20);
    const width = 760;
    const leftX = 24;
    const nodeW = 196;
    const rightX = width - nodeW - 24;

    const senderPos = new Map<string, { x: number; y: number; h: number }>();
    senders.forEach(([id], idx) => {
      senderPos.set(id, { x: leftX, y: topPad + idx * (rowHeight + rowGap), h: rowHeight });
    });

    const receiverPos = new Map<string, { x: number; y: number; h: number }>();
    receivers.forEach(([id], idx) => {
      receiverPos.set(id, { x: rightX, y: topPad + idx * (rowHeight + rowGap), h: rowHeight });
    });

    const maxPatients = Math.max(1, ...transfers.map((t) => t.patients));

    const links = transfers.map((t, idx) => {
      const sp = senderPos.get(t.from_ward)!;
      const rp = receiverPos.get(t.to_ward)!;
      const x1 = sp.x + nodeW;
      const y1 = sp.y + sp.h / 2;
      const x2 = rp.x;
      const y2 = rp.y + rp.h / 2;
      const mx = (x1 + x2) / 2;
      const strokeWidth = Math.max(4, Math.min(24, Math.round((t.patients / maxPatients) * 20) + 4));
      return {
        key: `${t.from_ward}->${t.to_ward}-${idx}`,
        transfer: t,
        path: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        midX: mx,
        midY: (y1 + y2) / 2,
        strokeWidth,
      };
    });

    return { width, height, nodeW, senders, receivers, senderPos, receiverPos, links };
  }, [transfers]);

  if (transfers.length === 0) {
    return (
      <div
        data-testid="overflow-sankey"
        className="rounded-xl border border-mist bg-paper p-5 text-sm text-slate"
      >
        No intra-city overflow transfers required for this horizon — all wards remain within bed capacity.
      </div>
    );
  }

  const activeLink =
    layout.links.find((l) => l.key === activeKey) ?? layout.links[0] ?? null;

  return (
    <div data-testid="overflow-sankey" className="space-y-3">
      <div
        className="overflow-x-auto rounded-xl border border-mist bg-white p-3"
        tabIndex={0}
        role="region"
        aria-label="Interactive intra-city bed overflow flow diagram"
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full min-w-[540px]"
          role="img"
          aria-label={`Intra-city bed overflow Sankey showing ${transfers.length} patient transfer routes`}
        >
          <title>Intra-city bed overflow transfers</title>
          <text
            x={24}
            y={18}
            fill="#4B5578"
            fontSize="11"
            fontWeight="600"
          >
            OVERFLOWING WARDS (SENDERS)
          </text>
          <text
            x={layout.width - layout.nodeW - 24}
            y={18}
            fill="#4B5578"
            fontSize="11"
            fontWeight="600"
          >
            HEADROOM WARDS (RECEIVERS)
          </text>

          {/* Curved flow ribbons */}
          {layout.links.map((link) => {
            const isActive = activeKey === null || activeKey === link.key;
            return (
              <g
                key={link.key}
                onMouseEnter={() => setActiveKey(link.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() =>
                  setActiveKey((cur) => (cur === link.key ? null : link.key))
                }
                className="cursor-pointer"
              >
                <path
                  d={link.path}
                  fill="none"
                  stroke="#2F5BFF"
                  strokeWidth={link.strokeWidth}
                  strokeOpacity={isActive ? 0.55 : 0.16}
                  strokeLinecap="round"
                />
                <circle
                  cx={link.midX}
                  cy={link.midY}
                  r={12}
                  fill={isActive ? "#0B1A5C" : "#4B5578"}
                />
                <text
                  x={link.midX}
                  y={link.midY + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="700"
                >
                  {link.transfer.patients}
                </text>
              </g>
            );
          })}

          {/* Sender nodes */}
          {layout.senders.map(([wardId, info]) => {
            const pos = layout.senderPos.get(wardId)!;
            return (
              <g key={`sender-${wardId}`}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={layout.nodeW}
                  height={pos.h}
                  rx={8}
                  fill="#0B1A5C"
                />
                <text
                  x={pos.x + 12}
                  y={pos.y + 18}
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="700"
                >
                  {wardId}
                </text>
                <text
                  x={pos.x + 12}
                  y={pos.y + 34}
                  fill="#DDE3F3"
                  fontSize="10"
                >
                  {info.city} · −{info.patients} out
                </text>
              </g>
            );
          })}

          {/* Receiver nodes */}
          {layout.receivers.map(([wardId, info]) => {
            const pos = layout.receiverPos.get(wardId)!;
            return (
              <g key={`receiver-${wardId}`}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={layout.nodeW}
                  height={pos.h}
                  rx={8}
                  fill="#F4F6FD"
                  stroke="#2F5BFF"
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x + 12}
                  y={pos.y + 18}
                  fill="#0B1A5C"
                  fontSize="12"
                  fontWeight="700"
                >
                  {wardId}
                </text>
                <text
                  x={pos.x + 12}
                  y={pos.y + 34}
                  fill="#4B5578"
                  fontSize="10"
                >
                  {info.city} · +{info.patients} in
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Keyboard-accessible flow selector & inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-paper px-3.5 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {layout.links.slice(0, 8).map((link) => (
            <button
              key={`pill-${link.key}`}
              type="button"
              aria-pressed={activeKey === link.key}
              onClick={() =>
                setActiveKey((cur) => (cur === link.key ? null : link.key))
              }
              className={clsx(
                "min-h-7 cursor-pointer rounded-md border px-2 font-mono text-[11px] font-semibold tnum",
                activeKey === link.key
                  ? "border-royal bg-royal text-white"
                  : "border-mist bg-white text-navy hover:border-royal",
              )}
            >
              {link.transfer.from_ward} → {link.transfer.to_ward}: {link.transfer.patients}
            </button>
          ))}
        </div>
        {activeLink ? (
          <p className="font-mono text-xs font-semibold text-navy tnum">
            Selected route: {activeLink.transfer.from_ward} → {activeLink.transfer.to_ward} (
            {activeLink.transfer.patients} patients · {activeLink.transfer.city})
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function StepRoute({
  horizon,
  serviceLevel,
  capacityOverrides,
  lang,
  data,
  isPending,
  isFetching,
  isError,
  error,
  onRetry,
  onHorizonChange,
  onServiceLevelChange,
  onCapacityOverrideChange,
  onResetOverrides,
}: StepRouteProps) {
  const bn = lang === "bn";
  const overrideCount = Object.keys(capacityOverrides).length;

  return (
    <div data-testid="command-panel-3" className="space-y-5">
      {/* Routing parameters & capacity method badge */}
      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className={bn ? "font-bangla" : undefined}>
              {bn
                ? "ধাপ ৩ · নগর-ভিত্তিক শয্যা ওভারফ্লো রাউটিং"
                : "Step 3 · Intra-city hospital bed overflow routing"}
            </CardTitle>
            <CardDescription className={bn ? "font-bangla" : undefined}>
              {bn
                ? "প্রতিটি নগরের ভেতরে অতিরিক্ত রোগী পাশের খালি শয্যাযুক্ত ওয়ার্ডে স্থানান্তর করুন এবং প্রয়োজনে ওয়ার্ডের শয্যা-ক্ষমতা সম্পাদনা করুন।"
                : "Balances peak hospital bed demand strictly inside each city corporation. Edit any ward capacity below to re-route transfers live."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="capacity-method-badge"
              className="inline-flex items-center rounded-md border border-navy bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-navy"
            >
              Derived from history (2016–2022 P95 × 1.10)
            </span>
            {overrideCount > 0 ? (
              <button
                type="button"
                data-testid="reset-capacity-overrides"
                onClick={onResetOverrides}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-mist bg-white px-2.5 text-xs font-semibold text-navy hover:border-royal hover:bg-paper"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                <span>Reset overrides ({overrideCount})</span>
              </button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              id="route-horizon-select"
              testId="route-horizon-select"
              label="Routing horizon"
              mono
              value={String(horizon)}
              options={HORIZON_OPTIONS}
              onChange={(e) => onHorizonChange(Number(e.target.value))}
            />
            <SelectField
              id="route-service-level"
              testId="route-service-level"
              label="Planned bed quantile"
              mono
              value={String(serviceLevel)}
              options={SERVICE_LEVEL_OPTIONS}
              onChange={(e) => onServiceLevelChange(Number(e.target.value))}
            />
            <div className="flex flex-col justify-end rounded-xl border border-mist bg-paper/60 px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-navy">Method formula</span>
              <span className="mt-0.5 font-mono text-[11px] text-slate tnum">
                {data?.capacity_method ??
                  "ceil(1.10 × P95 weekly hospital_beds_required, 2016–2022)"}
              </span>
            </div>
          </div>
          {isFetching ? (
            <p role="status" aria-live="polite" className="font-mono text-xs font-semibold text-navy">
              Re-routing bed transfers…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorBanner
          testId="step3-error-banner"
          retryTestId="step3-retry"
          title="Bed overflow routing failed"
          error={error}
          onRetry={onRetry}
        />
      ) : null}

      {isPending && !data ? (
        <PanelSkeleton
          testId="step3-loading"
          label="Solving intra-city hospital bed overflow routing…"
        />
      ) : null}

      {!isError && data && data.cities.length === 0 ? (
        <EmptyState
          title="No cities in routing scope"
          description="Choose a valid city or All cities scope to compute bed transfers."
        />
      ) : null}

      {!isError && data && data.cities.length > 0 ? (
        <>
          {/* Per-city utilisation before vs after cards */}
          <div
            data-testid="route-city-summaries"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {data.cities.map((c) => {
              const beforePct = c.utilisation_before * 100;
              const afterPct = c.utilisation_after * 100;
              return (
                <Card
                  key={c.city}
                  data-testid={`route-city-card-${c.city}`}
                >
                  <CardHeader className="flex-row items-start justify-between gap-2 py-3.5">
                    <div>
                      <CardTitle className="text-sm">{c.city}</CardTitle>
                      <CardDescription className="font-mono text-xs tnum">
                        {c.required_total} req / {c.capacity_total} beds · {c.transfers}{" "}
                        transfer{c.transfers === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                    <span
                      data-testid={`unroutable-badge-${c.city}`}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs font-semibold tnum whitespace-nowrap",
                        c.unroutable_patients > 0
                          ? "border-ink bg-ink text-white"
                          : "border-mist bg-paper text-navy",
                      )}
                    >
                      {c.unroutable_patients > 0 ? (
                        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : null}
                      <span>{c.unroutable_patients} unroutable</span>
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate">Utilisation before</span>
                        <span className="font-mono font-semibold text-ink tnum">
                          {beforePct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist">
                        <div
                          className="h-full rounded-full bg-slate"
                          style={{ width: `${Math.min(100, beforePct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-navy">Utilisation after</span>
                        <span className="font-mono font-bold text-navy tnum">
                          {afterPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-paper ring-1 ring-mist">
                        <div
                          className="h-full rounded-full bg-royal"
                          style={{ width: `${Math.min(100, afterPct)}%` }}
                        />
                      </div>
                    </div>

                    <p className="font-mono text-xs text-slate tnum">
                      Headroom after routing: <strong className="text-navy">{c.headroom_after}</strong>{" "}
                      beds
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Interactive SVG Sankey flow diagram */}
          <Card>
            <CardHeader>
              <CardTitle>Intra-city transfer flows ({data.transfers.length})</CardTitle>
              <CardDescription>
                Interactive flow diagram of patients routed from overflowing wards to same-city headroom wards.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <OverflowSankey transfers={data.transfers} />

              {data.transfers.length > 0 ? (
                <div
                  className="overflow-x-auto rounded-xl border border-mist"
                  tabIndex={0}
                  role="region"
                  aria-label="Intra-city patient transfer table"
                >
                  <table
                    data-testid="overflow-transfer-table"
                    className="w-full border-collapse text-left text-xs"
                  >
                    <thead>
                      <tr className="border-b border-mist bg-paper font-semibold text-slate">
                        <th scope="col" className="px-3.5 py-2.5">
                          City
                        </th>
                        <th scope="col" className="px-3.5 py-2.5">
                          From Ward (Overflow)
                        </th>
                        <th scope="col" className="px-3.5 py-2.5">
                          To Ward (Headroom)
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 text-right">
                          Patients Routed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist bg-white">
                      {data.transfers.map((t, idx) => (
                        <tr key={`${t.from_ward}-${t.to_ward}-${idx}`}>
                          <td className="px-3.5 py-2.5 text-slate">{t.city}</td>
                          <th
                            scope="row"
                            className="px-3.5 py-2.5 font-mono font-bold text-navy tnum"
                          >
                            {t.from_ward}
                          </th>
                          <td className="px-3.5 py-2.5 font-mono font-semibold text-ink tnum">
                            {t.to_ward}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-royal tnum">
                            {t.patients}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Per-ward bed capacity override & net deficits table */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Ward bed capacity, overrides & net deficits</CardTitle>
              <CardDescription>
                Override any ward capacity (1–500 beds) to test surge wards or real local hospital counts.
              </CardDescription>
            </CardHeader>
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Per-ward hospital bed status and capacity overrides table"
            >
              <table
                data-testid="overflow-ward-table"
                className="w-full border-collapse text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-mist bg-paper font-semibold text-slate">
                    <th scope="col" className="px-3.5 py-2.5">
                      Ward
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Req. Beds
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Capacity (Editable)
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Source
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Local Deficit
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Out / In
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Net Deficit
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Util. Before → After
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist bg-white">
                  {data.wards.map((w) => {
                    const inputVal = capacityOverrides[w.ward_id] ?? w.capacity;
                    const inputId = `capacity-override-${w.ward_id}`;
                    return (
                      <tr
                        key={w.ward_id}
                        data-testid={`route-ward-row-${w.ward_id}`}
                        className="hover:bg-paper/60"
                      >
                        <th scope="row" className="px-3.5 py-2.5">
                          <span className="font-mono font-bold text-navy tnum">
                            {w.ward_id}
                          </span>
                          <span className="block text-[11px] font-normal text-slate">
                            {w.city}
                          </span>
                        </th>
                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-ink tnum">
                          {w.beds_required}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <label htmlFor={inputId} className="sr-only">
                            Bed capacity for {w.ward_id}
                          </label>
                          <input
                            id={inputId}
                            data-testid={inputId}
                            type="number"
                            min={1}
                            max={500}
                            value={inputVal}
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              if (!Number.isFinite(parsed)) return;
                              const clamped = Math.max(1, Math.min(500, Math.round(parsed)));
                              onCapacityOverrideChange(w.ward_id, clamped);
                            }}
                            className="min-h-8 w-20 rounded-md border border-mist bg-paper/50 px-2 py-1 font-mono text-xs font-semibold text-navy tnum focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span
                            className={clsx(
                              "inline-flex rounded px-2 py-0.5 font-mono text-[11px] font-semibold",
                              w.capacity_source === "override" ||
                                capacityOverrides[w.ward_id] !== undefined
                                ? "bg-navy text-white"
                                : "border border-mist bg-paper text-slate",
                            )}
                          >
                            {capacityOverrides[w.ward_id] !== undefined
                              ? "override"
                              : w.capacity_source}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-ink tnum">
                          {w.local_deficit}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-slate tnum">
                          −{w.transferred_out} / +{w.transferred_in}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tnum">
                          <span
                            className={clsx(
                              "inline-flex rounded px-1.5 py-0.5 font-bold",
                              w.net_deficit > 0
                                ? "bg-ink text-white"
                                : "text-slate",
                            )}
                          >
                            {w.net_deficit}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-navy tnum">
                          {(w.utilisation_before * 100).toFixed(0)}% →{" "}
                          {(w.utilisation_after * 100).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
