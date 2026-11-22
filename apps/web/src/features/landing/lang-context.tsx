"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

export type LandingLang = "en" | "bn";

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

  const setLang = useCallback((next: LandingLang) => {
    setLangState(next);
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
