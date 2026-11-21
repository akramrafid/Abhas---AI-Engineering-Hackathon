/**
 * Clerk login is on when the app has Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in
 * apps/web/.env.local, written by `npx clerk@latest init` or `env pull`). Clerk v7 middleware needs real
 * keys, so a fresh clone with no keys runs with auth off and the dashboard open: the ≤ 3-minute,
 * zero-key setup keeps working. NEXT_PUBLIC_AUTH_DISABLED=1 forces auth off (Playwright e2e).
 */
export const AUTH_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED !== "1" &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
export const AFTER_AUTH_URL = "/dashboard";
