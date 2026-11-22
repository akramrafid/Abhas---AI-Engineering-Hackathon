"use client";

import type { KeyboardEvent } from "react";
import { clsx } from "clsx";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  testId: string;
}

export interface TabNavProps<T extends string> {
  tabs: readonly TabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  ariaLabel?: string;
}

export function TabNav<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = "Dashboard views",
}: TabNavProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = tabs[(index + 1) % tabs.length];
      onChange(next.id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = tabs[(index - 1 + tabs.length) % tabs.length];
      onChange(prev.id);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(tabs[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 overflow-x-auto"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`tab-btn-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            data-testid={tab.testId}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={clsx(
              "inline-flex min-h-11 items-center border-b-2 px-4 py-2.5 text-sm whitespace-nowrap cursor-pointer",
              selected
                ? "border-royal font-semibold text-navy"
                : "border-transparent font-medium text-slate hover:border-mist hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
