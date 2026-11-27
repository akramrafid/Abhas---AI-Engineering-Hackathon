"use client";

import { useSyncExternalStore } from "react";
import type { Lang } from "./i18n";

const ENV_OFFLINE = process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1";

function subscribeOnline(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function getOnlineServerSnapshot(): boolean {
  return true;
}

export type ConnectivityMode = "browser-offline" | "api-offline" | "online";

export interface ConnectivityState {
  browserOffline: boolean;
  apiOffline: boolean;
  isOffline: boolean;
  mode: ConnectivityMode;
  label: (lang: Lang) => string;
}

/**
 * Combines browser network status (`navigator.onLine` + `online`/`offline` events),
 * `NEXT_PUBLIC_ABHAS_OFFLINE`, and the API's `offline` boolean so every offline badge
 * reacts honestly to both kill-switch mode and real Wi-Fi disconnects (QA Q7).
 */
export function useConnectivity(apiOfflineFlag?: boolean): ConnectivityState {
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const browserOffline = !browserOnline;
  const apiOffline = ENV_OFFLINE || Boolean(apiOfflineFlag);
  const isOffline = browserOffline || apiOffline;
  const mode: ConnectivityMode = browserOffline
    ? "browser-offline"
    : apiOffline
      ? "api-offline"
      : "online";

  return {
    browserOffline,
    apiOffline,
    isOffline,
    mode,
    label: (lang: Lang) => {
      if (mode === "browser-offline") {
        return lang === "bn" ? "অফলাইন (নেটওয়ার্ক)" : "Offline (network)";
      }
      if (mode === "api-offline") {
        return lang === "bn" ? "অফলাইন মোড" : "Offline mode";
      }
      return lang === "bn" ? "লোকাল এপিআই" : "Local API";
    },
  };
}
