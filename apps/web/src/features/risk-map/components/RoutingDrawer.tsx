"use client";

import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Timer } from "@/components/icons";
import type { MapWard } from "@/components/ward-map/WardRiskMap";
import { cityDisplayName, wardLabel, type LonLat } from "@/components/ward-map/geo";
import { haversineKm, type HealthFacility } from "@/components/ward-map/facilities";
import type { NearestHospitalResult, RouteResult } from "@/components/ward-map/routing";
import type { Lang } from "@/lib/i18n";

export type InspectorTab = "wards" | "facility" | "route";

export interface RoutingDrawerProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  ledgerWards: readonly MapWard[];
  selectedWardId: string;
  onSelectWard: (wardId: string) => void;
  onHoverWard: (wardId: string | null) => void;
  selectedFacility: HealthFacility | null;
  startPoint: LonLat;
  routeResult: RouteResult | null;
  routePending: boolean;
  nearestResults: readonly NearestHospitalResult[];
  nearestEngine: "osrm" | "offline-fallback" | null;
  nearestPending: boolean;
  onRouteToFacility: (facility: HealthFacility) => void;
  onClearRoute: () => void;
  onInspectFacilityIn3D: (facility: HealthFacility) => void;
  lang: Lang;
}

export function RoutingDrawer({
  activeTab,
  onChangeTab,
  ledgerWards,
  selectedWardId,
  onSelectWard,
  onHoverWard,
  selectedFacility,
  startPoint,
  routeResult,
  routePending,
  nearestResults,
  nearestEngine,
  nearestPending,
  onRouteToFacility,
  onClearRoute,
  onInspectFacilityIn3D,
  lang,
}: RoutingDrawerProps) {
  const bn = lang === "bn";

  const tabs: ReadonlyArray<{ id: InspectorTab; labelEn: string; labelBn: string }> = [
    { id: "wards", labelEn: "Wards", labelBn: "ওয়ার্ড" },
    { id: "facility", labelEn: "Facility", labelBn: "হাসপাতাল" },
    { id: "route", labelEn: "Route & Nearest", labelBn: "রুট ও নিকটস্থ" },
  ];

  return (
    <aside
      aria-label={bn ? "মানচিত্র ও রুট বিশ্লেষক" : "Geospatial inspector"}
      className="flex flex-col rounded-[14px] border border-mist bg-white p-3.5 sm:p-4"
    >
      {/* 3-Tab Switcher */}
      <div
        role="tablist"
        aria-label={bn ? "তথ্য প্যানেল ট্যাব" : "Inspector tabs"}
        className="grid grid-cols-3 gap-1 rounded-lg bg-paper p-1 ring-1 ring-mist/70"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeTab(tab.id)}
              className={clsx(
                "min-h-8 cursor-pointer rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                bn && "font-bangla",
                active ? "bg-white text-navy shadow-sm ring-1 ring-mist" : "text-slate hover:text-ink",
              )}
            >
              {bn ? tab.labelBn : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Highest-Risk Wards Ledger (preserves data-testid="risk-map-ledger") */}
      {activeTab === "wards" ? (
        <section aria-labelledby="risk-map-ledger" className="mt-3.5">
          <h3
            id="risk-map-ledger"
            lang={lang}
            className={clsx("text-xs font-bold uppercase tracking-[0.06em] text-slate", bn && "font-bangla normal-case tracking-normal")}
          >
            {bn ? "সবচেয়ে বেশি ঝুঁকি" : "Highest risk in view"}
          </h3>
          <ol className="abhas-scroll mt-2.5 max-h-[30rem] divide-y divide-mist overflow-y-auto" data-testid="risk-map-ledger">
            {ledgerWards.map((ward) => (
              <li key={ward.ward_id}>
                <button
                  type="button"
                  onClick={() => onSelectWard(ward.ward_id)}
                  onMouseEnter={() => onHoverWard(ward.ward_id)}
                  onMouseLeave={() => onHoverWard(null)}
                  onFocus={() => onHoverWard(ward.ward_id)}
                  onBlur={() => onHoverWard(null)}
                  aria-current={ward.ward_id === selectedWardId ? "true" : undefined}
                  className={clsx(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-paper",
                    ward.ward_id === selectedWardId && "bg-paper",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block truncate text-sm font-semibold text-ink", bn && "font-bangla")}>
                      {wardLabel(ward.ward_id, lang)}
                    </span>
                    <span className={clsx("block truncate text-xs text-slate tnum", bn && "font-bangla")}>
                      {cityDisplayName(ward.city, lang)} · {ward.expected_cases?.toFixed(1)}{" "}
                      {bn ? "প্রত্যাশিত" : "expected"}
                    </span>
                  </span>
                  {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" lang={lang} className="shrink-0" /> : null}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* TAB 2: Selected Facility Details */}
      {activeTab === "facility" ? (
        <div className="mt-3.5 flex flex-1 flex-col justify-between gap-4">
          {selectedFacility ? (
            <>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      bn && "font-bangla",
                      selectedFacility.type === "hospital"
                        ? "bg-royal/10 text-royal"
                        : "bg-teal-600/10 text-teal-800",
                    )}
                  >
                    {selectedFacility.type === "hospital"
                      ? bn
                        ? "হাসপাতাল"
                        : "Hospital (OSM)"
                      : bn
                        ? "ক্লিনিক"
                        : "Clinic (OSM)"}
                  </span>
                  <span className={clsx("rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-slate ring-1 ring-mist", bn && "font-bangla")}>
                    {cityDisplayName(selectedFacility.city, lang)}
                  </span>
                </div>

                <h3 className={clsx("mt-2.5 text-base font-bold leading-snug text-navy", bn && "font-bangla")}>
                  {bn ? selectedFacility.nameBn : selectedFacility.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate">{selectedFacility.address}</p>

                <dl className="mt-4 space-y-2 rounded-lg border border-mist bg-paper p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className={clsx("text-slate", bn && "font-bangla")}>
                      {bn ? "জরুরি বিভাগ" : "Emergency"}
                    </dt>
                    <dd className="font-semibold text-navy">
                      {selectedFacility.emergency === "yes" ? (bn ? "আছে (ট্যাগ)" : "Tagged yes") : bn ? "অনির্ধারিত" : "Unknown"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className={clsx("text-slate", bn && "font-bangla")}>
                      {bn ? "ফোন" : "Phone"}
                    </dt>
                    <dd className="font-mono font-medium text-ink tnum">
                      {selectedFacility.phone ? (
                        <a href={`tel:${selectedFacility.phone.replace(/\s+/g, "")}`} className="text-royal underline">
                          {selectedFacility.phone}
                        </a>
                      ) : bn ? "উল্লেখ নেই" : "Not listed"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className={clsx("text-slate", bn && "font-bangla")}>
                      {bn ? "সরল দূরত্ব" : "Air distance"}
                    </dt>
                    <dd className="font-mono font-semibold text-navy tnum">
                      {haversineKm(startPoint, selectedFacility.position).toFixed(2)} km
                    </dd>
                  </div>
                  {selectedFacility.bedsTag ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className={clsx("text-slate", bn && "font-bangla")}>
                        {bn ? "শয্যা তথ্য" : "Capacity tag"}
                      </dt>
                      <dd className="text-ink tnum">{selectedFacility.bedsTag}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={routePending}
                  onClick={() => onRouteToFacility(selectedFacility)}
                  className={clsx(
                    "flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy disabled:opacity-60",
                    bn && "font-bangla",
                  )}
                >
                  <span>
                    {routePending
                      ? bn
                        ? "রুট খোঁজা হচ্ছে…"
                        : "Computing road route…"
                      : bn
                        ? "সড়কপথে রুট দেখুন"
                        : "Route here by road"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onInspectFacilityIn3D(selectedFacility)}
                  className={clsx(
                    "flex min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-mist bg-paper px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-mist/50",
                    bn && "font-bangla",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                  <span>{bn ? "৩ডি ভবন ও এলাকা জুম করুন" : "Inspect 3D buildings"}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-mist bg-paper p-6 text-center">
              <MapPin className="mx-auto h-5 w-5 text-slate" aria-hidden="true" />
              <p className={clsx("mt-2 text-xs font-medium text-ink", bn && "font-bangla")}>
                {bn
                  ? "বিস্তারিত ও সড়ক রুট দেখতে মানচিত্র বা তালিকা থেকে যেকোনো হাসপাতাল বেছে নিন।"
                  : "Click any hospital dot on the map or row in the directory to inspect details and route by road."}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 3: Nearest Hospitals & Active Road Route */}
      {activeTab === "route" ? (
        <div className="mt-3.5 space-y-4">
          {/* Active route summary */}
          {routeResult ? (
            <div className="rounded-xl border border-royal/30 bg-paper p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-royal">
                    {routeResult.engine === "osrm"
                      ? bn
                        ? "সড়ক নেটওয়ার্ক রুট (OSRM)"
                        : "Road network route (OSRM)"
                      : bn
                        ? "অফলাইন আনুমানিক রুট"
                        : "Offline corridor estimate"}
                  </p>
                  <p className={clsx("mt-0.5 text-sm font-bold text-navy", bn && "font-bangla")}>
                    {bn ? routeResult.destination.nameBn : routeResult.destination.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearRoute}
                  className="cursor-pointer rounded-md border border-mist bg-white px-2 py-1 text-[11px] font-semibold text-slate hover:text-ink"
                >
                  {bn ? "মুছুন" : "Clear"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-2.5 ring-1 ring-royal/30">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-royal">
                    <span className="h-1 w-3 rounded-full bg-royal" aria-hidden="true" />
                    {bn ? "দ্রুততম" : "Fastest"}
                  </span>
                  <p className="mt-1 font-mono text-base font-bold text-navy tnum">
                    {routeResult.fastest.durationMin} min
                  </p>
                  <p className="font-mono text-[11px] text-slate tnum">
                    {routeResult.fastest.distanceKm.toFixed(2)} km
                  </p>
                </div>
                {routeResult.shortest ? (
                  <div className="rounded-lg bg-white p-2.5 ring-1 ring-mist">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate">
                      <span className="h-0.5 w-3 border-b-2 border-dashed border-slate-500" aria-hidden="true" />
                      {bn ? "সংক্ষিপ্ততম" : "Shortest"}
                    </span>
                    <p className="mt-1 font-mono text-base font-bold text-ink tnum">
                      {routeResult.shortest.durationMin} min
                    </p>
                    <p className="font-mono text-[11px] text-slate tnum">
                      {routeResult.shortest.distanceKm.toFixed(2)} km
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center rounded-lg bg-white p-2.5 ring-1 ring-mist">
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate">
                      <Timer className="h-3 w-3 text-royal" aria-hidden="true" />
                      {bn ? "গণনা সময়" : "Compute"}
                    </span>
                    <p className="mt-1 font-mono text-xs font-semibold text-navy tnum">
                      {routeResult.computeMs} ms
                    </p>
                  </div>
                )}
              </div>

              <p className="mt-2.5 text-[11px] text-slate tnum">
                {bn ? "শুরু" : "Start"}: {startPoint[1].toFixed(4)}°N, {startPoint[0].toFixed(4)}°E · {routeResult.fastest.summary}
              </p>
            </div>
          ) : null}

          {/* Nearest hospitals ranked list */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className={clsx("text-xs font-bold uppercase tracking-[0.06em] text-slate", bn && "font-bangla normal-case tracking-normal")}>
                {bn ? "সড়কপথে নিকটতম হাসপাতাল" : "Nearest hospitals by road"}
              </h3>
              {nearestEngine ? (
                <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-slate ring-1 ring-mist">
                  {nearestEngine === "osrm" ? "OSRM live" : "Offline est."}
                </span>
              ) : null}
            </div>

            {nearestPending ? (
              <p className={clsx("mt-3 rounded-lg bg-paper p-4 text-center text-xs text-slate", bn && "font-bangla")}>
                {bn ? "সড়ক দূরত্ব হিসাব হচ্ছে…" : "Measuring road times across nearby hospitals…"}
              </p>
            ) : nearestResults.length > 0 ? (
              <ol className="abhas-scroll mt-2 max-h-[20rem] divide-y divide-mist overflow-y-auto">
                {nearestResults.map((item, idx) => {
                  const isActiveDest = routeResult?.destination.id === item.facility.id;
                  return (
                    <li key={item.facility.id}>
                      <button
                        type="button"
                        onClick={() => onRouteToFacility(item.facility)}
                        className={clsx(
                          "flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-paper",
                          isActiveDest && "bg-royal/[0.08]",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={clsx("truncate text-xs font-semibold text-navy", bn && "font-bangla")}>
                            <span className="mr-1.5 font-mono text-[11px] text-slate">{idx + 1}.</span>
                            {bn ? item.facility.nameBn : item.facility.name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate">
                            <span>{cityDisplayName(item.facility.city, lang)}</span>
                            {item.facility.emergency === "yes" ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700">
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                ER
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="shrink-0 text-right font-mono tnum">
                          <span className="block text-xs font-bold text-royal">{item.durationMin} min</span>
                          <span className="block text-[11px] text-slate">{item.distanceKm.toFixed(1)} km</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-mist bg-paper p-5 text-center">
                <Clock3 className="mx-auto h-5 w-5 text-slate" aria-hidden="true" />
                <p className={clsx("mt-2 text-xs text-slate", bn && "font-bangla")}>
                  {bn
                    ? "মানচিত্রের ওপরে 'নিকটস্থ হাসপাতাল' বোতামে চাপ দিন বা আপনার অবস্থান ব্যবহার করুন।"
                    : "Press “Nearest hospitals by road” above the map to rank travel times from your start point."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
