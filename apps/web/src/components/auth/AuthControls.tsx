import { Suspense } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { clsx } from "clsx";
import { AUTH_ENABLED, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth-config";
import { UserMenu } from "./UserMenu";

const quiet =
  "inline-flex min-h-9 items-center rounded-full border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/15 active:scale-[0.97]";
const solid =
  "relative inline-flex min-h-9 items-center overflow-hidden rounded-full bg-royal px-4 text-sm font-semibold text-white shadow-[0_6px_20px_-4px_rgba(47,91,255,0.65),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all duration-300 hover:bg-white hover:text-royal hover:shadow-[0_8px_24px_-4px_rgba(255,255,255,0.4)] active:scale-[0.97]";

/** Sign in / Create account when signed out; Dashboard + account menu when signed in. */
export function AuthControls({ className }: { className?: string }) {
  if (!AUTH_ENABLED) {
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <Link href="/dashboard" className={solid} data-testid="nav-dashboard-link">
          Open dashboard
        </Link>
      </div>
    );
  }
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <Suspense fallback={<span className="inline-block h-10 w-44" aria-hidden="true" />}>
        <Show when="signed-out">
          <Link href={SIGN_IN_URL} className={quiet} data-testid="nav-sign-in">
            Sign in
          </Link>
          <Link href={SIGN_UP_URL} className={solid} data-testid="nav-sign-up">
            Create account
          </Link>
        </Show>
        <Show when="signed-in">
          <Link href="/dashboard" className={solid} data-testid="nav-dashboard-link">
            Open dashboard
          </Link>
          <UserMenu />
        </Show>
      </Suspense>
    </div>
  );
}
