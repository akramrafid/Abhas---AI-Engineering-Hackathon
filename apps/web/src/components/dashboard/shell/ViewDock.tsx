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
 * Keeps tab semantics (role=tab, aria-controls, arrow keys), and a pill slides to the active view.
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
      pill.style.transform = `translate(${current.offsetLeft}px, ${current.offsetTop}px)`;
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
        "no-print z-30 rounded-[14px] p-1.5 ring-1",
        "fixed inset-x-2 bottom-2 lg:sticky lg:inset-auto lg:top-24 lg:self-start",
        dark ? "bg-navy ring-white/10" : "bg-white ring-mist",
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
          className="invisible absolute left-0 top-0 rounded-[10px] bg-royal data-[ready=true]:visible data-[ready=true]:transition-[transform,width,height] data-[ready=true]:duration-300 data-[ready=true]:ease-out"
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
                "relative z-10 flex min-h-12 min-w-[4.75rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] px-2 py-1.5 text-[11px] font-semibold leading-tight transition-colors duration-300 lg:w-[5.5rem]",
                lang === "bn" && "font-bangla",
                selected ? "text-white" : dark ? "text-mist hover:bg-white/10 hover:text-white" : "text-slate hover:bg-paper hover:text-navy",
              )}
            >
              <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.9} />
              <span className="text-center">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
