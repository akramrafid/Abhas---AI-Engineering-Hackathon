"use client";

import { useSyncExternalStore } from "react";

const KEY = "abhas-theme";
const EVENT = "abhas-theme-change";
// Used when localStorage is blocked (private mode): the toggle still works for this visit.
let memoryDark = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === null ? memoryDark : stored === "dark";
  } catch {
    return memoryDark;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Dashboard theme, remembered per browser; the server always renders the light default. */
export function useDashboardTheme(): [boolean, () => void] {
  const dark = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    memoryDark = !read();
    try {
      window.localStorage.setItem(KEY, memoryDark ? "dark" : "light");
    } catch {
      // Not remembered across visits.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [dark, toggle];
}
