import { Suspense } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { clsx } from "clsx";
import { AUTH_ENABLED, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth-config";
import { UserMenu } from "./UserMenu";

const quiet =
  "inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10";
const solid =
  "inline-flex min-h-10 items-center rounded-md bg-royal px-4 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-royal";

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
