"use client";

import { UserButton } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/auth-config";

/** Signed-in account menu; renders nothing when auth is off (e2e, offline demo). */
export function UserMenu() {
  if (!AUTH_ENABLED) return null;
  return (
    <div data-testid="user-menu" className="inline-flex min-h-9 items-center">
      <UserButton
        appearance={{ elements: { avatarBox: "h-8 w-8 ring-2 ring-white/25" } }}
      />
    </div>
  );
}
