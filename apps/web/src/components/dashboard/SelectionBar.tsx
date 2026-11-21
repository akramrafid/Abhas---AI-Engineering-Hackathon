"use client";

import { useMemo, useState } from "react";
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

  return (
    <section
      aria-label="Forecast selection controls"
      className="no-print rounded-lg border border-mist bg-white p-3.5"
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(140px,0.9fr)_minmax(210px,1.25fr)_minmax(240px,1.35fr)_auto] lg:items-end">
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

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ward-select"
                className={clsx(
                  "text-xs font-semibold text-slate",
                  lang === "bn" && "font-bangla",
                )}
              >
                {copy.ward}
              </label>
              <label htmlFor="ward-search-input" className="sr-only">
                Filter ward options
              </label>
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
                className="w-28 rounded-sm border border-mist bg-paper px-2 py-0.5 text-xs text-ink placeholder:text-slate focus-visible:border-royal"
              />
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
              className="min-h-10 rounded-md border border-mist bg-white px-3 py-1.5 font-mono text-sm text-ink tnum hover:border-slate focus-visible:border-royal disabled:cursor-not-allowed disabled:bg-paper disabled:text-slate"
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

          <div className="flex flex-col gap-1">
            <span
              className={clsx(
                "text-xs font-semibold text-slate",
                lang === "bn" && "font-bangla",
              )}
            >
              {copy.forecastWindow}
            </span>
            <div
              data-testid="window-toggle"
              role="group"
              aria-label="Forecast horizon window"
              className="inline-flex min-h-10 rounded-md border border-mist bg-paper p-0.5"
            >
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
                      "cursor-pointer rounded-sm px-2.5 text-xs font-semibold tnum",
                      lang === "bn" ? "font-bangla" : "font-mono",
                      active
                        ? "bg-royal text-white"
                        : "text-navy hover:bg-white",
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
