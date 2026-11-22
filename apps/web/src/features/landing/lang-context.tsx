"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

export type LandingLang = "en" | "bn";

const STORAGE_KEY = "abhas-lang";

interface LandingLangContextValue {
  lang: LandingLang;
  setLang: (next: LandingLang) => void;
}

const LandingLangContext = createContext<LandingLangContextValue>({
  lang: "en",
  setLang: () => {},
});

export function LandingLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LandingLang>("en");

  // Hydrate saved language preference after mount to keep SSR hydration deterministic.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "bn" || saved === "en") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // Ignore storage access failures in private/sandboxed contexts.
    }
  }, []);

  const setLang = useCallback((next: LandingLang) => {
    setLangState(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent("abhas:lang", { detail: next }));
    } catch {
      // Ignore storage failures.
    }
    trackEvent({ event: "lang_toggle", location: "landing", lang: next });
  }, []);

  return (
    <LandingLangContext.Provider value={{ lang, setLang }}>
      {children}
    </LandingLangContext.Provider>
  );
}

export function useLandingLang(): LandingLangContextValue {
  return useContext(LandingLangContext);
}
