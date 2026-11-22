"use client";

import { useMemo, useState } from "react";
import { ChevronRight, MapPin, Search } from "@/components/icons";
import { clsx } from "clsx";
import { wardLabel, wardNumber } from "@/components/ward-map/geo";
import type { Ward } from "@/lib/api/client";
import type { DashboardTab, Lang } from "@/lib/i18n";
import { Dialog } from "./Dialog";
import { VIEW_META } from "./views";
import type { DockItem } from "./ViewDock";

export interface CommandSearchProps {
  views: readonly DockItem[];
  wards: readonly Ward[];
  lang: Lang;
  onSelectView: (tab: DashboardTab) => void;
  onSelectWard: (wardId: string) => void;
  onClose: () => void;
}

type Result =
  | { kind: "view"; id: DashboardTab; title: string; detail: string }
  | { kind: "ward"; id: string; title: string; detail: string };

/** Ctrl+K: jump to a view or a ward. Matches every typed word against name, city and ward code. */
export function CommandSearch({ views, wards, lang, onSelectView, onSelectWard, onClose }: CommandSearchProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const results = useMemo<Result[]>(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
    const viewResults: Result[] = views
      .map((v) => ({ kind: "view" as const, id: v.id, title: v.label, detail: VIEW_META[v.id].description[lang] }))
      .filter((r) => matches(`${r.title} ${r.detail} ${r.id}`));
    const wardResults: Result[] = terms.length
      ? wards
          .map((w) => ({
            kind: "ward" as const,
            id: w.ward_id,
            title: `${wardLabel(w.ward_id)} · ${w.city}`,
            detail: w.ward_id,
          }))
          .filter((r) => matches(`${r.title} ${r.detail} ward ${wardNumber(r.id)}`))
          .slice(0, 8)
      : [];
    return [...wardResults, ...viewResults];
  }, [query, views, wards, lang]);

  const choose = (result: Result) => {
    if (result.kind === "view") onSelectView(result.id);
    else onSelectWard(result.id);
    onClose();
  };

  return (
    <Dialog title="Search wards and views" onClose={onClose} testId="search-dialog">
      <label className="flex min-h-12 items-center gap-2.5 rounded-[10px] px-3 ring-1 ring-mist focus-within:ring-2 focus-within:ring-royal">
        <Search aria-hidden="true" className="h-4 w-4 text-slate" />
        <input
          type="search"
          value={query}
          placeholder="Ward 4 dhaka south, scenario, validation…"
          aria-label="Search wards and views"
          aria-controls="search-results"
          aria-activedescendant={results[cursor] ? `search-result-${cursor}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (event.key === "Enter" && results[cursor]) {
              event.preventDefault();
              choose(results[cursor]);
            }
          }}
          className="min-h-11 flex-1 bg-transparent text-body outline-none placeholder:text-slate"
        />
      </label>
      <ul id="search-results" role="listbox" aria-label="Results" className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {results.map((result, index) => {
          const Icon = result.kind === "view" ? VIEW_META[result.id].icon : MapPin;
          return (
            <li key={`${result.kind}-${result.id}`} id={`search-result-${index}`} role="option" aria-selected={index === cursor}>
              <button
                type="button"
                onClick={() => choose(result)}
                onMouseEnter={() => setCursor(index)}
                className={clsx(
                  "flex w-full cursor-pointer items-center gap-3 rounded-[10px] p-2.5 text-left",
                  index === cursor ? "bg-paper" : "",
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-royal" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{result.title}</span>
                  <span className={clsx("block truncate text-xs text-slate", result.kind === "ward" && "font-mono")}>
                    {result.detail}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate" />
              </button>
            </li>
          );
        })}
        {results.length === 0 ? (
          <li role="status" className="p-3 text-sm text-slate">
            No ward or view matches “{query}”.
          </li>
        ) : null}
      </ul>
    </Dialog>
  );
}
