"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { clsx } from "clsx";
import type { DashboardTab, Lang } from "@/lib/i18n";
import { VIEW_META } from "./views";

export interface DockItem {
  id: DashboardTab;
  label: string;
  testId: string;
}

export interface ViewDockProps {
  items: readonly DockItem[];
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
  lang: Lang;
  dark: boolean;
}

/**
 * Floating view dock: a vertical rail beside the content on desktop, a bottom bar on phones.
 * Keeps tab semantics (role=tab, aria-controls, arrow keys), and a Royal pill glides to the active view.
 */
export function ViewDock({ items, active, onChange, lang, dark }: ViewDockProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const place = () => {
      const current = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!current) return;
      pill.style.width = `${current.offsetWidth}px`;
      pill.style.height = `${current.offsetHeight}px`;
      pill.style.transform = `translate3d(${current.offsetLeft}px, ${current.offsetTop}px, 0)`;
      pill.dataset.ready = "true";
    };
    const observer = new ResizeObserver(place);
    observer.observe(list);
    place();
    return () => observer.disconnect();
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      onChange(items[(index + step + items.length) % items.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(items[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(items[items.length - 1].id);
    }
  };

  return (
    <nav
      aria-label="Dashboard views"
      className={clsx(
        "no-print z-30 rounded-[18px] p-1.5 ring-1 backdrop-blur-md transition-colors duration-200",
        "fixed inset-x-2 bottom-2 lg:sticky lg:inset-auto lg:top-24 lg:self-start",
        dark
          ? "bg-navy/92 ring-white/12"
          : "bg-white/92 ring-mist/90",
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label="Dashboard views"
        aria-orientation="vertical"
        className="relative flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
      >
        <span
          ref={pillRef}
          aria-hidden="true"
          className="invisible absolute left-0 top-0 rounded-[12px] bg-[linear-gradient(135deg,#2F5BFF_0%,#1D42E0_100%)] data-[ready=true]:visible data-[ready=true]:transition-[transform,width,height] data-[ready=true]:duration-300 data-[ready=true]:ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
        {items.map((item, index) => {
          const selected = item.id === active;
          const Icon = VIEW_META[item.id].icon;
          return (
            <button
              key={item.id}
              id={`tab-btn-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              data-testid={item.testId}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              lang={lang}
              className={clsx(
                "group relative z-10 flex min-h-[3.25rem] min-w-[4.75rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] px-2 py-2 text-[11px] font-semibold leading-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal lg:w-[5.75rem]",
                lang === "bn" && "font-bangla",
                selected
                  ? "text-white"
                  : dark
                    ? "text-mist hover:bg-white/10 hover:text-white"
                    : "text-slate hover:bg-paper hover:text-navy",
              )}
            >
              <Icon
                aria-hidden="true"
                className={clsx(
                  "h-[19px] w-[19px] transition-transform duration-200",
                  selected ? "scale-105" : "group-hover:scale-105",
                )}
              />
              <span className="text-center">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
