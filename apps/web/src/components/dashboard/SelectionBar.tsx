"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "@/components/icons";
import { clsx } from "clsx";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SelectField, type SelectOption } from "@/components/ui/Select";
import type { ApiError, City, Ward } from "@/lib/api/client";
import { formatOriginWeekOption } from "@/lib/dates";
import type { HorizonWindow } from "@/lib/demo-config";
import { UI_COPY, type Lang } from "@/lib/i18n";

export interface SelectionBarProps {
  cities: readonly City[];
  selectedCity: City;
  cityWards: readonly Ward[];
  selectedWardId: string;
  unknownWardId: string | null;
  mondayWeeks: readonly string[];
  selectedOriginWeek: string;
  windowKey: HorizonWindow;
  lang: Lang;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  onRetryWards: () => void;
  onChangeCity: (city: City) => void;
  onChangeWard: (wardId: string) => void;
  onChangeOriginWeek: (isoWeek: string) => void;
  onChangeWindow: (windowKey: HorizonWindow) => void;
}

export function SelectionBar({
  cities,
  selectedCity,
  cityWards,
  selectedWardId,
  unknownWardId,
  mondayWeeks,
  selectedOriginWeek,
  windowKey,
  lang,
  isLoading,
  isError,
  error,
  onRetryWards,
  onChangeCity,
  onChangeWard,
  onChangeOriginWeek,
  onChangeWindow,
}: SelectionBarProps) {
  const [wardQuery, setWardQuery] = useState("");
  const copy = UI_COPY[lang].controls;
  const toggleGroupRef = useRef<HTMLDivElement>(null);
  const togglePillRef = useRef<HTMLSpanElement>(null);

  const cityOptions = useMemo<SelectOption[]>(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities],
  );

  const filteredWards = useMemo(() => {
    const q = wardQuery.trim().toLowerCase();
    if (!q) return cityWards;
    const matches = cityWards.filter((w) => w.ward_id.toLowerCase().includes(q));
    return matches.length > 0 ? matches : cityWards;
  }, [cityWards, wardQuery]);

  const wardOptions = useMemo<SelectOption[]>(() => {
    const list = filteredWards.map((w) => ({ value: w.ward_id, label: w.ward_id }));
    if (selectedWardId && !list.some((o) => o.value === selectedWardId)) {
      list.unshift({ value: selectedWardId, label: selectedWardId });
    }
    if (unknownWardId) {
      return [{ value: "", label: `Unknown ward (${unknownWardId})` }, ...list];
    }
    return list;
  }, [filteredWards, selectedWardId, unknownWardId]);

  const weekOptions = useMemo<SelectOption[]>(
    () =>
      mondayWeeks.map((w) => ({
        value: w,
        label: formatOriginWeekOption(w),
      })),
    [mondayWeeks],
  );

  const windowChoices: ReadonlyArray<{ id: HorizonWindow; label: string }> = [
    { id: "1w", label: copy.window1w },
    { id: "2-4w", label: copy.window2to4w },
    { id: "1-4w", label: copy.window1to4w },
  ];

  // Smooth sliding active pill on the Forecast Window segmented control.
  useEffect(() => {
    const group = toggleGroupRef.current;
    const pill = togglePillRef.current;
    if (!group || !pill) return;
    const place = () => {
      const activeBtn = group.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!activeBtn) return;
      pill.style.width = `${activeBtn.offsetWidth}px`;
      pill.style.height = `${activeBtn.offsetHeight}px`;
      pill.style.transform = `translate3d(${activeBtn.offsetLeft}px, ${activeBtn.offsetTop}px, 0)`;
      pill.dataset.ready = "true";
    };
    const observer = new ResizeObserver(place);
    observer.observe(group);
    place();
    return () => observer.disconnect();
  }, [windowKey, lang]);

  return (
    <section
      aria-label="Forecast selection controls"
      className="no-print rounded-[16px] bg-white p-4 ring-1 ring-mist/90"
    >
      {isError ? (
        <ErrorBanner
          testId="wards-error-banner"
          retryTestId="retry-button"
          title="Could not load ward directory"
          error={error}
          onRetry={onRetryWards}
        />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(145px,0.9fr)_minmax(225px,1.3fr)_minmax(240px,1.35fr)_auto] lg:items-end">
          <SelectField
            id="city-select"
            label={copy.city}
            testId="city-select"
            value={selectedCity}
            disabled={isLoading}
            options={cityOptions}
            onChange={(e) => {
              setWardQuery("");
              onChangeCity(e.target.value as City);
            }}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ward-select"
                className={clsx(
                  "text-[11px] font-semibold tracking-tight text-slate",
                  lang === "bn" && "font-bangla",
                )}
              >
                {copy.ward}
              </label>
              <label htmlFor="ward-search-input" className="sr-only">
                Filter ward options
              </label>
              <div className="relative flex items-center">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 h-3 w-3 text-slate/80"
                />
                <input
                  id="ward-search-input"
                  data-testid="ward-search-input"
                  type="search"
                  value={wardQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWardQuery(val);
                    const trimmed = val.trim().toLowerCase();
                    if (trimmed) {
                      const firstMatch = cityWards.find((w) =>
                        w.ward_id.toLowerCase().includes(trimmed),
                      );
                      if (firstMatch && firstMatch.ward_id !== selectedWardId) {
                        onChangeWard(firstMatch.ward_id);
                      }
                    }
                  }}
                  placeholder={copy.wardFilterPlaceholder}
                  className="w-32 rounded-full border border-mist/90 bg-paper/70 py-0.5 pl-6 pr-2.5 text-[11px] font-medium text-ink placeholder:text-slate/75 transition-all hover:border-royal/40 focus-visible:w-36 focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal/15"
                />
              </div>
            </div>
            <select
              id="ward-select"
              data-testid="ward-select"
              value={selectedWardId}
              disabled={isLoading || wardOptions.length === 0}
              onChange={(e) => {
                if (!e.target.value) return;
                onChangeWard(e.target.value);
              }}
              className="min-h-10 rounded-xl border border-mist/95 bg-paper/45 px-3 py-2 text-sm font-medium text-navy tnum transition-all duration-150 hover:border-royal/40 hover:bg-white focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-royal/12 disabled:cursor-not-allowed disabled:bg-paper disabled:text-slate"
            >
              {(wardOptions.length > 0
                ? wardOptions
                : [{ value: "", label: "Loading wards…" }]
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <SelectField
            id="origin-week-select"
            label={copy.originWeek}
            testId="origin-week-select"
            mono
            value={selectedOriginWeek}
            disabled={isLoading}
            options={weekOptions}
            onChange={(e) => onChangeOriginWeek(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <span
              className={clsx(
                "text-[11px] font-semibold tracking-tight text-slate",
                lang === "bn" && "font-bangla",
              )}
            >
              {copy.forecastWindow}
            </span>
            <div
              ref={toggleGroupRef}
              data-testid="window-toggle"
              role="group"
              aria-label="Forecast horizon window"
              className="relative inline-flex min-h-10 items-center rounded-xl border border-mist/95 bg-paper/80 p-1"
            >
              <span
                ref={togglePillRef}
                aria-hidden="true"
                className="invisible absolute left-0 top-0 rounded-lg bg-[linear-gradient(135deg,#2F5BFF_0%,#1D42E0_100%)] data-[ready=true]:visible data-[ready=true]:transition-[transform,width,height] data-[ready=true]:duration-250 data-[ready=true]:ease-[cubic-bezier(0.16,1,0.3,1)]"
              />
              {windowChoices.map((w) => {
                const active = windowKey === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    data-testid={`window-${w.id}`}
                    aria-pressed={active}
                    onClick={() => onChangeWindow(w.id)}
                    className={clsx(
                      "relative z-10 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold tnum transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                      lang === "bn" && "font-bangla",
                      active ? "text-white" : "text-navy hover:text-royal",
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
