"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { clsx } from "clsx";
import { AUTH_ENABLED, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth-config";
import type { Lang } from "@/lib/i18n";
import { UserMenu } from "./UserMenu";

const quiet =
  "hidden min-[460px]:inline-flex min-h-9 whitespace-nowrap items-center rounded-full border border-white/15 bg-white/[0.06] px-3 text-xs font-semibold text-white backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/15 active:scale-[0.97] sm:px-4 sm:text-sm";
const solid =
  "relative inline-flex min-h-9 whitespace-nowrap items-center overflow-hidden rounded-full bg-royal px-3 text-xs font-semibold text-white shadow-[0_6px_20px_-4px_rgba(47,91,255,0.65),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all duration-300 hover:bg-white hover:text-royal hover:shadow-[0_8px_24px_-4px_rgba(255,255,255,0.4)] active:scale-[0.97] sm:px-4 sm:text-sm";

/** Sign in / Create account when signed out; Dashboard + account menu when signed in. */
export function AuthControls({ className }: { className?: string }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("abhas-lang");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "bn" || saved === "en") setLang(saved);
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

  const bn = lang === "bn";
  const dashboardHref = bn ? "/dashboard?lang=bn" : "/dashboard";
  const signInLabel = bn ? "সাইন ইন" : "Sign in";
  const signUpLabel = bn ? "অ্যাকাউন্ট খুলুন" : "Create account";
  const dashboardLabel = bn ? "ড্যাশবোর্ড খুলুন" : "Open dashboard";

  if (!AUTH_ENABLED) {
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <Link href={dashboardHref} className={clsx(solid, bn && "font-bangla")} data-testid="nav-dashboard-link">
          {dashboardLabel}
        </Link>
      </div>
    );
  }
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <Suspense fallback={<span className="inline-block h-10 w-44" aria-hidden="true" />}>
        <Show when="signed-out">
          <Link href={SIGN_IN_URL} className={clsx(quiet, bn && "font-bangla")} data-testid="nav-sign-in">
            {signInLabel}
          </Link>
          <Link href={SIGN_UP_URL} className={clsx(solid, bn && "font-bangla")} data-testid="nav-sign-up">
            {signUpLabel}
          </Link>
        </Show>
        <Show when="signed-in">
          <Link href={dashboardHref} className={clsx(solid, bn && "font-bangla")} data-testid="nav-dashboard-link">
            {dashboardLabel}
          </Link>
          <UserMenu />
        </Show>
      </Suspense>
    </div>
  );
}
