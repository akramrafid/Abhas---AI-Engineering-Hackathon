"use client";

export type AnalyticsEventName =
  | "cta_open_dashboard"
  | "cta_watch_tour"
  | "cta_request_pilot"
  | "cta_view_validation"
  | "cta_whatsapp_contact"
  | "nav_section_click"
  | "lang_toggle"
  | "pilot_form_submit";

export interface AnalyticsPayload {
  event: AnalyticsEventName;
  location: string;
  label?: string;
  lang?: "en" | "bn";
}

/**
 * Privacy-first, zero-cookie conversion & CTA event tracker.
 * Emits a typed DOM CustomEvent (`abhas:analytics`) so any external collector
 * (Plausible, PostHog, or self-hosted telemetry) can subscribe without adding cookies.
 */
export function trackEvent(payload: AnalyticsPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("abhas:analytics", {
        detail: { ...payload, ts: Date.now(), path: window.location.pathname },
      }),
    );
  } catch {
    // Never block user interaction on telemetry failure.
  }
}
