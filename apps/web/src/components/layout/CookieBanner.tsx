"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ShieldCheck } from "@/components/icons";
import type { Lang } from "@/lib/i18n";

const CONSENT_KEY = "abhas-cookie-consent";
const CONSENT_EVENT = "abhas-cookie-consent-change";

function readConsent(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return "essential";
  }
}

function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Non-intrusive cookie consent notice positioned bottom-left (clear of the bottom-right AI chat button).
 * Uses strictly Abhas Ink/Royal/White tokens (zero Lime) and remembers the user's choice locally.
 */
export function CookieBanner() {
  // Server snapshot returns "hidden" so SSR never flashes the banner before checking localStorage.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "hidden");
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("abhas-lang");
      if (saved === "bn" || saved === "en") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLang(saved);
      }
    } catch {
      // ignore
    }
    const onLang = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "bn" || detail === "en") setLang(detail);
    };
    window.addEventListener("abhas:lang", onLang);
    return () => window.removeEventListener("abhas:lang", onLang);
  }, []);

  if (consent !== null) return null;

  const bn = lang === "bn";

  const saveChoice = (value: "accepted" | "essential") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // ignore storage failure in private browsing
    }
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  return (
    <aside
      role="region"
      aria-label={bn ? "কুকি ও গোপনীয়তা বিজ্ঞপ্তি" : "Cookie and privacy notice"}
      data-testid="cookie-banner"
      className="no-print fixed bottom-4 left-4 right-4 z-40 max-w-md rounded-[14px] bg-ink p-4 text-white shadow-xl shadow-ink/40 ring-1 ring-white/15 sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-royal" />
        <div className="min-w-0 flex-1">
          <p className={clsx("text-xs font-bold text-white", bn && "font-bangla")}>
            {bn ? "কুকি ও গোপনীয়তা" : "Cookies & privacy"}
          </p>
          <p className={clsx("mt-1 text-xs leading-5 text-mist", bn && "font-bangla")}>
            {bn
              ? "আভাস কোনো বিজ্ঞাপন বা ট্র্যাকিং কুকি ব্যবহার করে না—শুধুমাত্র ভাষা, থিম এবং লগইন সেশনের জন্য প্রয়োজনীয় স্টোরেজ ব্যবহার করা হয়।"
              : "Abhas uses zero advertising or cross-site tracking cookies—only essential storage for language, theme, and sign-in sessions."}{" "}
            <Link href="/privacy" className="font-semibold text-white underline underline-offset-2 hover:text-mist">
              {bn ? "গোপনীয়তা নীতি" : "Privacy policy"}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveChoice("accepted")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-full bg-royal px-3.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-royal",
                bn && "font-bangla",
              )}
            >
              {bn ? "গ্রহণ করুন" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => saveChoice("essential")}
              className={clsx(
                "min-h-8 cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/15",
                bn && "font-bangla",
              )}
            >
              {bn ? "শুধু প্রয়োজনীয়" : "Essential only"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
