"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { MapPin, Search } from "@/components/icons";
import type { City } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";
import { cityDisplayName } from "@/components/ward-map/geo";
import { BANGLADESH_FACILITIES, type FacilityType, type HealthFacility } from "@/components/ward-map/facilities";

export interface FacilityDirectoryProps {
  selectedCityFilter: City | "all";
  onChangeCityFilter: (city: City | "all") => void;
  typeFilter: "all" | FacilityType;
  selectedFacilityId: string | null;
  onSelectFacility: (facility: HealthFacility) => void;
  lang: Lang;
}

const CITIES: readonly (City | "all")[] = [
  "all",
  "Dhaka South",
  "Dhaka North",
  "Chattogram",
  "Gazipur",
  "Narayanganj",
];

export function FacilityDirectory({
  selectedCityFilter,
  onChangeCityFilter,
  typeFilter,
  selectedFacilityId,
  onSelectFacility,
  lang,
}: FacilityDirectoryProps) {
  const bn = lang === "bn";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BANGLADESH_FACILITIES.filter((f) => {
      if (selectedCityFilter !== "all" && f.city !== selectedCityFilter) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.nameBn.toLowerCase().includes(q) ||
        f.address.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q)
      );
    });
  }, [query, selectedCityFilter, typeFilter]);

  return (
    <section
      aria-labelledby="facility-directory-heading"
      className="flex flex-col rounded-[14px] border border-mist bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="facility-directory-heading"
            lang={lang}
            className={clsx("text-base font-bold text-navy", bn && "font-bangla")}
          >
            {bn
              ? `স্বাস্থ্যকেন্দ্র ও হাসপাতাল তালিকা (${filtered.length})`
              : `Facility directory (${filtered.length})`}
          </h3>
          <p lang={lang} className={clsx("mt-0.5 text-xs text-slate", bn && "font-bangla")}>
            {bn
              ? "পাঁচটি সিটি করপোরেশনের হাসপাতাল ও ক্লিনিক। মানচিত্রে দেখতে যেকোনো সারিতে ক্লিক করুন।"
              : "OpenStreetMap reference hospitals and clinics across all five city corporations. Click a row to inspect in 3D."}
          </p>
        </div>

        <label className="relative block w-full sm:w-60">
          <span className="sr-only">{bn ? "হাসপাতাল খুঁজুন" : "Filter facilities"}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={bn ? "নাম বা এলাকা খুঁজুন..." : "Filter by name or area…"}
            className={clsx(
              "w-full rounded-lg border border-mist bg-paper py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-slate focus:border-royal focus:bg-white focus:outline-none",
              bn && "font-bangla",
            )}
          />
        </label>
      </div>

      {/* City quick filter pills */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={bn ? "শহর অনুযায়ী ফিল্টার" : "Filter directory by city"}>
        {CITIES.map((city) => {
          const active = selectedCityFilter === city;
          return (
            <button
              key={city}
              type="button"
              onClick={() => onChangeCityFilter(city)}
              aria-pressed={active}
              className={clsx(
                "min-h-7 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                bn && "font-bangla",
                active
                  ? "border-royal bg-royal text-white"
                  : "border-mist bg-paper text-navy hover:bg-mist/50",
              )}
            >
              {city === "all" ? (bn ? "সব শহর" : "All cities") : cityDisplayName(city, lang)}
            </button>
          );
        })}
      </div>

      {/* Scrollable directory table */}
      <div className="abhas-scroll mt-3 max-h-[24rem] overflow-auto rounded-lg border border-mist">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-mist bg-paper text-[11px] font-semibold text-slate">
            <tr>
              <th scope="col" className={clsx("px-3 py-2.5", bn && "font-bangla")}>
                {bn ? "নাম ও ঠিকানা" : "Name"}
              </th>
              <th scope="col" className={clsx("px-3 py-2.5", bn && "font-bangla")}>
                {bn ? "ধরন" : "Type"}
              </th>
              <th scope="col" className={clsx("px-3 py-2.5", bn && "font-bangla")}>
                {bn ? "নগর" : "City"}
              </th>
              <th scope="col" className={clsx("px-3 py-2.5", bn && "font-bangla")}>
                {bn ? "জরুরি সেবা" : "Emergency"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={clsx("px-3 py-6 text-center text-slate", bn && "font-bangla")}>
                  {bn ? "কোনো স্বাস্থ্যকেন্দ্র পাওয়া যায়নি।" : "No matching facilities in directory."}
                </td>
              </tr>
            ) : (
              filtered.map((fac) => {
                const selected = fac.id === selectedFacilityId;
                return (
                  <tr
                    key={fac.id}
                    className={clsx(
                      "transition-colors",
                      selected ? "bg-royal/[0.08]" : "hover:bg-paper",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectFacility(fac)}
                        className="group flex w-full cursor-pointer items-start gap-2 text-left focus:outline-none focus-visible:underline"
                      >
                        <MapPin
                          className={clsx(
                            "mt-0.5 h-3.5 w-3.5 shrink-0",
                            fac.type === "hospital" ? "text-royal" : "text-teal-700",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className={clsx("block font-semibold text-navy group-hover:text-royal", bn && "font-bangla")}>
                            {bn ? fac.nameBn : fac.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate">
                            {fac.address}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          bn && "font-bangla",
                          fac.type === "hospital"
                            ? "bg-navy/10 text-navy"
                            : "bg-teal-600/10 text-teal-900",
                        )}
                      >
                        {fac.type === "hospital"
                          ? bn
                            ? "হাসপাতাল"
                            : "hospital"
                          : bn
                            ? "ক্লিনিক"
                            : "clinic"}
                      </span>
                    </td>
                    <td className={clsx("whitespace-nowrap px-3 py-2.5 text-ink", bn && "font-bangla")}>
                      {cityDisplayName(fac.city, lang)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate tnum">
                      {fac.emergency === "yes" ? (bn ? "আছে (ট্যাগ)" : "yes (tagged)") : bn ? "অনির্ধারিত" : "unknown"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p lang={lang} className={clsx("mt-2.5 text-[11px] leading-relaxed text-slate", bn && "font-bangla")}>
        {bn
          ? "স্বাস্থ্যকেন্দ্র ও সড়ক তথ্য © OpenStreetMap অবদানকারীরা (ODbL)। লাইভ শয্যা বা চিকিৎসক উপস্থিতির তথ্য এখানে নেই।"
          : "Facility & road data © OpenStreetMap contributors, ODbL 1.0. No live doctor rosters, bed availability, or admission counts exist in these sources."}
      </p>
    </section>
  );
}
