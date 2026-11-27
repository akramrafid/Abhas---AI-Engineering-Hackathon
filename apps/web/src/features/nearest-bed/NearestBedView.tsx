"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { clsx } from "clsx";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import type { City, Ward } from "@/lib/api/client";
import { useReadyzQuery } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import { useConnectivity } from "@/lib/useConnectivity";
import {
  useAmbulanceRequestsQuery,
  useCreateAmbulanceRequestMutation,
  useHospitalsQuery,
  useUpdateBedsMutation,
  type AmbulanceSeverity,
} from "./api";
import { NearestBedMap } from "./NearestBedMap";
import {
  CITY_FALLBACK_COORDS,
  inferNearestCity,
  rankHospitalsClient,
  safeTelHref,
} from "./ranking";

export interface NearestBedViewProps {
  cities: readonly City[];
  wards: readonly Ward[];
  lang: Lang;
}

type GeoMode = "picker" | "geolocated" | "denied" | "locating";

const ALL_CITIES: readonly City[] = [
  "Dhaka South",
  "Dhaka North",
  "Chattogram",
  "Gazipur",
  "Narayanganj",
];

function fmtAge(hours: number, bn: boolean): string {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return bn ? `${mins} মিনিট আগে` : `${mins}m ago`;
  }
  return bn ? `${hours.toFixed(1)} ঘণ্টা আগে` : `${hours.toFixed(1)}h ago`;
}

export function NearestBedView({ cities, wards, lang }: NearestBedViewProps) {
  const bn = lang === "bn";
  const readyzQuery = useReadyzQuery();
  const connectivity = useConnectivity(readyzQuery.data?.offline);

  const cityList = cities.length > 0 ? cities : ALL_CITIES;
  const [geoMode, setGeoMode] = useState<GeoMode>("picker");
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<City>("Dhaka South");
  const [selectedWardId, setSelectedWardId] = useState<string>("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number }>(
    () => CITY_FALLBACK_COORDS["Dhaka South"],
  );
  const [showAllHospitals, setShowAllHospitals] = useState(false);

  // Selected hospital for ambulance request & manager bed-board form
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<AmbulanceSeverity>("High");
  const [bedsRequested, setBedsRequested] = useState<number>(1);
  const [dispatcherNote, setDispatcherNote] = useState<string>("");
  const [requestStatusMsg, setRequestStatusMsg] = useState<string | null>(null);

  // Manager bed-board update state
  const [managerMode, setManagerMode] = useState<boolean>(false);
  const [boardFreeBeds, setBoardFreeBeds] = useState<string>("5");
  const [boardTotalBeds, setBoardTotalBeds] = useState<string>("20");
  const [boardNote, setBoardNote] = useState<string>("");
  const [boardFeedback, setBoardFeedback] = useState<string | null>(null);

  const hospitalsQuery = useHospitalsQuery(null, true);
  const requestsQuery = useAmbulanceRequestsQuery(true);
  const createReqMutation = useCreateAmbulanceRequestMutation();
  const updateBedsMutation = useUpdateBedsMutation();

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMode("denied");
      setGeoMessage(
        bn
          ? "এই ব্রাউজারে লোকেশন সমর্থিত নয় — শহর/ওয়ার্ড নির্বাচন ব্যবহার করুন।"
          : "Geolocation unavailable in this browser — using city/ward picker.",
      );
      return;
    }
    setGeoMode("locating");
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserCoords({ lat, lon });
        setSelectedCity(inferNearestCity(lat, lon));
        setGeoMode("geolocated");
        setGeoMessage(null);
      },
      () => {
        setGeoMode("denied");
        setGeoMessage(
          bn
            ? "লোকেশন অনুমতি পাওয়া যায়নি (বা ৫ সেকেন্ড সময় শেষ) — শহর/ওয়ার্ড পিকার চালু আছে।"
            : "Location denied or timed out (5 s) — using city/ward fallback picker.",
        );
      },
      { timeout: 5_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }, [bn]);

  // If browser geolocation permission is ALREADY granted (e.g. Playwright setGeolocation), apply automatically.
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation ||
      !navigator.permissions?.query
    ) {
      return;
    }
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (active && status.state === "granted") {
          requestGeolocation();
        }
      })
      .catch(() => {
        // Ignore browsers without Permissions API geolocation support
      });
    return () => {
      active = false;
    };
  }, [requestGeolocation]);

  const cityWards = useMemo(
    () => wards.filter((w) => w.city === selectedCity),
    [wards, selectedCity],
  );

  const handleCityPickerChange = (city: City) => {
    setSelectedCity(city);
    setSelectedWardId("");
    setGeoMode("picker");
    setUserCoords(CITY_FALLBACK_COORDS[city]);
  };

  const handleWardPickerChange = (wardId: string) => {
    setSelectedWardId(wardId);
    setGeoMode("picker");
    const base = CITY_FALLBACK_COORDS[selectedCity];
    if (!wardId) {
      setUserCoords(base);
      return;
    }
    // Slight deterministic ward offset inside the selected city so ward selection visibly updates reference
    const idx = Math.max(0, cityWards.findIndex((w) => w.ward_id === wardId));
    const angle = idx * 0.9;
    const radius = 0.008 + (idx % 4) * 0.004;
    setUserCoords({
      lat: Number((base.lat + Math.sin(angle) * radius).toFixed(5)),
      lon: Number((base.lon + Math.cos(angle) * radius).toFixed(5)),
    });
  };

  const ranked = useMemo(() => {
    const list = hospitalsQuery.data?.hospitals ?? [];
    if (list.length === 0) return [];
    return rankHospitalsClient(list, {
      userLat: userCoords.lat,
      userLon: userCoords.lon,
      userCity: selectedCity,
      staleAfterHours: hospitalsQuery.data?.stale_after_hours ?? 6.0,
    });
  }, [hospitalsQuery.data, userCoords, selectedCity]);

  const activeHospital = useMemo(() => {
    if (ranked.length === 0) return null;
    if (selectedHospitalId) {
      const found = ranked.find((r) => r.hospital.id === selectedHospitalId);
      if (found) return found.hospital;
    }
    return ranked[0].hospital;
  }, [ranked, selectedHospitalId]);

  const handleSelectHospital = (id: string) => {
    setSelectedHospitalId(id);
    const found = ranked.find((r) => r.hospital.id === id)?.hospital;
    if (found) {
      setBoardFreeBeds(String(found.free_beds));
      setBoardTotalBeds(String(found.total_beds));
    }
  };

  const handleSubmitAmbulance = (e: FormEvent) => {
    e.preventDefault();
    if (!activeHospital) return;
    setRequestStatusMsg(null);
    createReqMutation.mutate(
      {
        hospital_id: activeHospital.id,
        city: activeHospital.city,
        severity,
        beds_requested: bedsRequested,
        dispatcher_note: dispatcherNote.trim() || null,
      },
      {
        onSuccess: (rec) => {
          setDispatcherNote("");
          setRequestStatusMsg(
            bn
              ? `অনুরোধ লগ হয়েছে: ${rec.hospital_name} (${rec.severity})`
              : `Logged request for ${rec.hospital_name} (${rec.severity}, ${rec.beds_requested} bed${rec.beds_requested > 1 ? "s" : ""}).`,
          );
        },
        onError: (err) => {
          setRequestStatusMsg(err.detail ?? err.title);
        },
      },
    );
  };

  const handleSubmitBedBoard = (e: FormEvent) => {
    e.preventDefault();
    if (!activeHospital) return;
    setBoardFeedback(null);
    const freeNum = Number.parseInt(boardFreeBeds, 10);
    const totalNum = Number.parseInt(boardTotalBeds, 10);
    if (!Number.isFinite(freeNum) || !Number.isFinite(totalNum)) return;
    updateBedsMutation.mutate(
      {
        hospitalId: activeHospital.id,
        free_beds: freeNum,
        total_beds: totalNum,
        note: boardNote.trim() || null,
        managerRole: managerMode,
      },
      {
        onSuccess: (res) => {
          setBoardNote("");
          setBoardFeedback(
            bn
              ? `আপডেট সফল: ${res.hospital.name} — ${res.hospital.free_beds}/${res.hospital.total_beds} শয্যা (বোর্ড)`
              : `Updated ${res.hospital.name}: ${res.hospital.free_beds}/${res.hospital.total_beds} free beds (source: board).`,
          );
        },
        onError: (err) => {
          setBoardFeedback(err.detail ?? err.title);
        },
      },
    );
  };

  if (hospitalsQuery.isError) {
    return (
      <ErrorBanner
        testId="nearest-bed-error"
        title={
          bn
            ? "হাসপাতালের তালিকা লোড করা যায়নি"
            : "Could not load hospital bed directory"
        }
        error={hospitalsQuery.error}
        onRetry={() => {
          void hospitalsQuery.refetch();
        }}
      />
    );
  }

  if (hospitalsQuery.isPending) {
    return (
      <PanelSkeleton
        testId="nearest-bed-loading"
        label={
          bn
            ? "নিকটতম হাসপাতাল ও শয্যার তথ্য লোড হচ্ছে…"
            : "Loading hospital directory and bed availability…"
        }
      />
    );
  }

  const data = hospitalsQuery.data;
  if (!data) return null;

  const visibleRanked = showAllHospitals ? ranked : ranked.slice(0, 8);

  return (
    <div data-testid="nearest-bed-view" className="space-y-5">
      {/* Top emergency + demo data banner */}
      <section className="rounded-2xl bg-white p-4 text-ink ring-1 ring-mist/90 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              lang={lang}
              className={clsx(
                "font-mono text-[11px] font-semibold uppercase tracking-wider text-royal",
                bn && "font-bangla normal-case tracking-normal",
              )}
            >
              {bn
                ? "ADR-0018 · কন্ট্রোল-রুম শয্যা ও অ্যাম্বুলেন্স সমন্বয়"
                : "ADR-0018 · Control-Room Bed & Ambulance Coordination"}
            </p>
            <h2
              lang={lang}
              className={clsx(
                "mt-1 text-lg font-bold tracking-tight text-navy",
                bn && "font-bangla",
              )}
            >
              {bn ? "নিকটতম শয্যা ও অ্যাম্বুলেন্স" : "Nearest Bed & Ambulance"}
            </h2>
          </div>

          <a
            href="tel:999"
            data-testid="call-999-primary"
            className={clsx(
              "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#991B1B] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#7F1D1D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2",
              bn && "font-bangla",
            )}
          >
            {bn ? "জরুরি কল ৯৯৯ (Call 999)" : "Call 999 · National Emergency"}
          </a>
        </div>

        {/* Clearly labelled DEMO bed data + ODbL + Privacy notice */}
        <div
          data-testid="facilities-demo-banner"
          role="note"
          className="mt-4 rounded-xl border border-[#C2410C]/35 bg-[#FFF7ED] px-4 py-3 text-xs text-[#7C2D12]"
        >
          <p className={clsx("font-semibold", bn && "font-bangla")}>
            {bn
              ? "ডেমো শয্যা তথ্য (Demo bed data): প্রদর্শিত শয্যার সংখ্যা ডেমো হিসেবে সিড করা — বাস্তব ভর্তির আগে হাসপাতালে ফোন করুন বা ৯৯৯-এ কল করুন।"
              : `Demo bed data: ${data.bed_data_disclaimer}`}
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#9A3412]">
            {data.attribution} · Snapshot {data.snapshot_date} ·{" "}
            {bn
              ? "ব্যবহারকারীর লোকেশন কেবল ব্রাউজারেই থাকে — সার্ভারে পাঠানো হয় না।"
              : "Privacy: location stays in your browser and is never sent to the API."}
          </p>
        </div>

        {/* Location control bar: Geolocation (5s timeout) + City/Ward fallback picker */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            data-testid="geolocate-btn"
            onClick={requestGeolocation}
            disabled={geoMode === "locating"}
            className={clsx(
              "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-royal px-4 py-2 text-xs font-semibold text-white transition hover:bg-navy disabled:opacity-60",
              bn && "font-bangla",
            )}
          >
            {geoMode === "locating"
              ? bn
                ? "অবস্থান খোঁজা হচ্ছে (৫ সেকেন্ড)…"
                : "Locating (5 s timeout)…"
              : bn
                ? "আমার বর্তমান অবস্থান ব্যবহার করুন"
                : "Use my location (browser-only)"}
          </button>

          <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
            <span className={clsx(bn && "font-bangla")}>
              {bn ? "বিকল্প শহর নির্বাচন" : "Fallback city picker"}
            </span>
            <select
              data-testid="location-city-select"
              value={selectedCity}
              onChange={(e) => handleCityPickerChange(e.target.value as City)}
              className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs font-medium text-ink"
            >
              {cityList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
            <span className={clsx(bn && "font-bangla")}>
              {bn ? "বিকল্প ওয়ার্ড নির্বাচন" : "Optional ward centroid"}
            </span>
            <select
              data-testid="location-ward-select"
              value={selectedWardId}
              onChange={(e) => handleWardPickerChange(e.target.value)}
              className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs font-medium text-ink"
            >
              <option value="">
                {bn ? `${selectedCity} কেন্দ্র` : `${selectedCity} center`}
              </option>
              {cityWards.map((w) => (
                <option key={w.ward_id} value={w.ward_id}>
                  {w.ward_id}
                </option>
              ))}
            </select>
          </label>

          <div
            data-testid="location-source-badge"
            className="flex flex-col justify-center rounded-xl border border-mist/80 bg-paper px-3 py-2 text-xs"
          >
            <span className="font-semibold text-navy">
              {geoMode === "geolocated"
                ? bn
                  ? "ব্রাউজার GPS সক্রিয় (ক্লায়েন্ট-সাইড)"
                  : "Browser GPS active (client-side)"
                : bn
                  ? `নির্বাচিত শহর: ${selectedCity}`
                  : `Fallback city: ${selectedCity}`}
            </span>
            <span className="font-mono text-[11px] text-slate">
              {bn
                ? "র‍্যাঙ্কিং: তাজা (≤৬ ঘ.) → পুরোনো → পূর্ণ"
                : "Rank: Fresh (≤6h) → Stale → City alt"}
            </span>
          </div>
        </div>

        {geoMessage ? (
          <p
            data-testid="geo-fallback-notice"
            className={clsx("mt-2 text-xs text-slate", bn && "font-bangla")}
          >
            {geoMessage}
          </p>
        ) : null}
      </section>

      {/* MapLibre map (tiles online, local GeoJSON-only offline) */}
      <NearestBedMap
        ranked={ranked}
        userLat={userCoords.lat}
        userLon={userCoords.lon}
        selectedHospitalId={activeHospital?.id ?? null}
        onSelectHospital={handleSelectHospital}
        offline={connectivity.isOffline}
        attribution={data.attribution}
        lang={lang}
      />

      {/* Ranked hospital cards */}
      <section aria-labelledby="ranked-hospitals-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="ranked-hospitals-heading"
            lang={lang}
            className={clsx("text-base font-bold text-navy", bn && "font-bangla")}
          >
            {bn
              ? `র‍্যাঙ্ককৃত হাসপাতালসমূহ (${ranked.length}টি)`
              : `Ranked hospitals (${ranked.length})`}
          </h3>
          {ranked.length > 8 ? (
            <button
              type="button"
              onClick={() => setShowAllHospitals((p) => !p)}
              className="cursor-pointer rounded-lg border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
            >
              {showAllHospitals
                ? bn
                  ? "শীর্ষ ৮টি দেখুন"
                  : "Show top 8"
                : bn
                  ? `সব ${ranked.length}টি দেখুন`
                  : `Show all ${ranked.length}`}
            </button>
          ) : null}
        </div>

        <div
          data-testid="ranked-hospitals-list"
          className="grid gap-3 md:grid-cols-2"
        >
          {visibleRanked.map((item, idx) => {
            const h = item.hospital;
            const telHref = safeTelHref(h.tel_href);
            const isSelected = activeHospital?.id === h.id;
            return (
              <article
                key={h.id}
                data-testid={`hospital-card-${idx + 1}`}
                data-hospital-id={h.id}
                data-hospital-city={h.city}
                className={clsx(
                  "flex flex-col justify-between rounded-2xl bg-white p-4 ring-1 transition",
                  isSelected
                    ? "ring-2 ring-royal"
                    : "ring-mist/90 hover:ring-royal/50",
                )}
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-md bg-navy px-2 py-0.5 font-mono text-[11px] font-bold text-white tnum">
                          #{idx + 1}
                        </span>
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            item.rankTier === 1
                              ? "bg-[#CCFBF1] text-[#115E59]"
                              : item.rankTier === 2
                                ? "bg-[#FEF3C7] text-[#78350F]"
                                : "bg-[#FEE2E2] text-[#991B1B]",
                          )}
                        >
                          {item.rankTier === 1
                            ? bn
                              ? "তাজা খালি শয্যা"
                              : "Fresh beds open"
                            : item.rankTier === 2
                              ? bn
                                ? "পুরোনো তথ্য (>৬ ঘণ্টা)"
                                : "Stale data (>6 h)"
                              : bn
                                ? "পূর্ণ · বিকল্প"
                                : "Full · City alt"}
                        </span>
                        <span className="inline-flex rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate ring-1 ring-mist">
                          {h.data_source === "demo"
                            ? bn
                              ? "ডেমো"
                              : "DEMO"
                            : bn
                              ? "বোর্ড"
                              : "BOARD"}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-bold text-navy break-words">
                        {h.name}
                      </h4>
                      <p className="text-xs text-slate">
                        {h.city}
                        {h.address ? ` · ${h.address}` : ""}
                      </p>
                    </div>
                    <RiskTierBadge tier={h.forecast_tier} lang={lang} />
                  </div>

                  {/* Distance, ETA estimate, Free beds, Age */}
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-paper p-2.5 text-xs">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase text-slate">
                        {bn ? "খালি শয্যা" : "Free beds"}
                      </span>
                      <span className="font-mono text-sm font-bold text-navy tnum">
                        {h.free_beds}/{h.total_beds}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase text-slate">
                        {bn ? "তথ্যের বয়স" : "Data age"}
                      </span>
                      <span className="font-mono text-xs font-semibold text-navy tnum">
                        {fmtAge(h.age_hours, bn)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase text-slate">
                        {bn ? "আনুমানিক দূরত্ব" : "Straight-line"}
                      </span>
                      <span className="font-mono text-xs font-semibold text-royal tnum">
                        {item.distanceKm.toFixed(1)} km · ~{item.etaMinutes}m{" "}
                        <span className="font-sans font-normal text-slate">
                          ({bn ? "আনুমানিক" : "estimate"})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: Verified tel: link (if present), Call 999, Select for dispatch/board */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {telHref && h.phone ? (
                    <a
                      href={telHref}
                      data-testid={`hospital-tel-${h.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg border border-royal/30 bg-paper px-3 py-1.5 font-mono text-xs font-semibold text-navy hover:bg-royal hover:text-white"
                    >
                      {h.phone}
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate">
                      {bn ? "যাচাইকৃত ফোন নেই" : "No verified OSM phone"}
                    </span>
                  )}

                  <a
                    href="tel:999"
                    className="inline-flex min-h-9 items-center rounded-lg bg-[#991B1B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7F1D1D]"
                  >
                    {bn ? "কল ৯৯৯" : "Call 999"}
                  </a>

                  <button
                    type="button"
                    onClick={() => handleSelectHospital(h.id)}
                    className="ml-auto inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
                  >
                    {isSelected
                      ? bn
                        ? "নির্বাচিত"
                        : "Selected"
                      : bn
                        ? "নির্বাচন করুন"
                        : "Select"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Bottom 2-column control-room forms: Ambulance Request Log + Manager Bed-Board */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Control-room Ambulance Request Log (zero patient PII) */}
        <section
          data-testid="ambulance-request-section"
          className="rounded-2xl bg-white p-5 ring-1 ring-mist/90"
        >
          <h3
            lang={lang}
            className={clsx("text-base font-bold text-navy", bn && "font-bangla")}
          >
            {bn
              ? "অ্যাম্বুলেন্স সমন্বয় লগ (রোগীর ব্যক্তিগত তথ্য ছাড়া)"
              : "Ambulance request log (no patient PII)"}
          </h3>
          <p className="mt-1 text-xs text-slate">
            {bn
              ? "রোগীর নাম, ফোন নম্বর বা এনআইডি লিখবেন না — কেবল হাসপাতালের সমন্বয় তথ্য দিন।"
              : "Log hospital coordination only. Do NOT enter patient names, phone numbers, NIDs, or personal addresses."}
          </p>

          <form onSubmit={handleSubmitAmbulance} className="mt-3 space-y-3">
            <div className="rounded-lg bg-paper px-3 py-2 text-xs">
              <span className="font-semibold text-slate">
                {bn ? "লক্ষ্য হাসপাতাল: " : "Target hospital: "}
              </span>
              <span className="font-bold text-navy">
                {activeHospital ? `${activeHospital.name} (${activeHospital.city})` : "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
                <span>{bn ? "তীব্রতা" : "Severity"}</span>
                <select
                  data-testid="amb-severity-select"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as AmbulanceSeverity)}
                  className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
                >
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
                <span>{bn ? "প্রয়োজনীয় শয্যা" : "Beds requested"}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  data-testid="amb-beds-input"
                  value={bedsRequested}
                  onChange={(e) =>
                    setBedsRequested(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                  }
                  className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
              <span>{bn ? "ডিসপ্যাচার নোট (ঐচ্ছিক)" : "Dispatcher note (optional, no PII)"}</span>
              <input
                type="text"
                maxLength={200}
                data-testid="amb-note-input"
                placeholder={
                  bn
                    ? "যেমন: অ্যাম্বুলেন্স ইউনিট ৩ রওনা হয়েছে"
                    : "e.g., Unit 3 en route, dengue triage bay requested"
                }
                value={dispatcherNote}
                onChange={(e) => setDispatcherNote(e.target.value)}
                className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
              />
            </label>

            <button
              type="submit"
              data-testid="amb-submit-btn"
              disabled={!activeHospital || createReqMutation.isPending}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-royal px-4 py-2 text-xs font-semibold text-white hover:bg-navy disabled:opacity-50"
            >
              {bn ? "অ্যাম্বুলেন্স অনুরোধ লগ করুন" : "Log ambulance request"}
            </button>

            {requestStatusMsg ? (
              <p
                data-testid="amb-status-msg"
                className="text-xs font-semibold text-navy"
              >
                {requestStatusMsg}
              </p>
            ) : null}
          </form>

          {/* Recent request log */}
          <div data-testid="ambulance-request-log" className="mt-4 space-y-2 border-t border-mist pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate">
              {bn ? "সাম্প্রতিক লগ" : "Recent requests"}
            </p>
            {(requestsQuery.data?.requests ?? []).length === 0 ? (
              <p className="text-xs text-slate">
                {bn ? "এখনো কোনো অনুরোধ লগ হয়নি।" : "No ambulance requests logged yet."}
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {(requestsQuery.data?.requests ?? []).slice(0, 6).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg bg-paper px-3 py-2 text-ink"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-navy">{r.hospital_name}</span>
                      <span className="font-mono text-[11px] font-semibold text-royal">
                        {r.severity} · {r.beds_requested} bed
                      </span>
                    </div>
                    {r.dispatcher_note ? (
                      <p className="mt-0.5 text-[11px] text-slate">{r.dispatcher_note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Manager Bed-Board Form */}
        <section
          data-testid="manager-bed-board"
          className="rounded-2xl bg-white p-5 ring-1 ring-mist/90"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              lang={lang}
              className={clsx("text-base font-bold text-navy", bn && "font-bangla")}
            >
              {bn ? "হাসপাতাল বেড-বোর্ড আপডেট (ম্যানেজার)" : "Hospital bed-board update (manager)"}
            </h3>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-navy">
              <input
                type="checkbox"
                data-testid="manager-role-toggle"
                checked={managerMode}
                onChange={(e) => setManagerMode(e.target.checked)}
                className="h-4 w-4 rounded border-mist"
              />
              <span>{bn ? "ম্যানেজার ভূমিকা" : "Manager role"}</span>
            </label>
          </div>

          <p className="mt-1 text-xs text-slate">
            {bn
              ? "শুধুমাত্র ম্যানেজার ভূমিকায় শয্যা আপডেট অনুমোদিত। আপডেট করলে ডেমো চিহ্ন বদলে 'বোর্ড' হবে।"
              : "Protected by manager role check (HTTP 403 otherwise). Submitting replaces DEMO counts with live board counts."}
          </p>

          <form onSubmit={handleSubmitBedBoard} className="mt-3 space-y-3">
            <div className="rounded-lg bg-paper px-3 py-2 text-xs">
              <span className="font-semibold text-slate">
                {bn ? "নির্বাচিত হাসপাতাল: " : "Selected facility: "}
              </span>
              <span className="font-bold text-navy">
                {activeHospital ? activeHospital.name : "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
                <span>{bn ? "খালি শয্যা" : "Free beds"}</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  data-testid="board-free-input"
                  value={boardFreeBeds}
                  onChange={(e) => setBoardFreeBeds(e.target.value)}
                  className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
                <span>{bn ? "মোট ডেঙ্গু শয্যা" : "Total dengue beds"}</span>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  data-testid="board-total-input"
                  value={boardTotalBeds}
                  onChange={(e) => setBoardTotalBeds(e.target.value)}
                  className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs font-semibold text-navy">
              <span>{bn ? "বোর্ড নোট (ঐচ্ছিক)" : "Board note (optional)"}</span>
              <input
                type="text"
                maxLength={160}
                data-testid="board-note-input"
                placeholder={bn ? "যেমন: ডেঙ্গু ওয়ার্ড-২ খোলা হয়েছে" : "e.g., Ward 2 triage opened"}
                value={boardNote}
                onChange={(e) => setBoardNote(e.target.value)}
                className="min-h-10 rounded-lg border border-mist bg-white px-3 text-xs text-ink"
              />
            </label>

            <button
              type="submit"
              data-testid="board-submit-btn"
              disabled={!activeHospital || updateBedsMutation.isPending}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-navy px-4 py-2 text-xs font-semibold text-white hover:bg-royal disabled:opacity-50"
            >
              {bn ? "শয্যা সংখ্যা আপডেট করুন" : "Update bed board"}
            </button>

            {boardFeedback ? (
              <p
                data-testid="board-feedback-msg"
                className="text-xs font-semibold text-navy"
              >
                {boardFeedback}
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
