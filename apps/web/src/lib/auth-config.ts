/**
 * Clerk login is on when the app has Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in
 * apps/web/.env.local, written by `npx clerk@latest init` or `env pull`). Clerk v7 middleware needs real
 * keys, so a fresh clone with no keys runs with auth off and the dashboard open: the <= 3-minute,
 * zero-key setup keeps working. NEXT_PUBLIC_ABHAS_OFFLINE=1 or NEXT_PUBLIC_AUTH_DISABLED=1 forces
 * Clerk off so offline operation and Playwright e2e never depend on external auth endpoints (ADR-0015).
 */
export const OFFLINE_MODE =
  process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1" ||
  process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "true";

export const AUTH_ENABLED =
  !OFFLINE_MODE &&
  process.env.NEXT_PUBLIC_AUTH_DISABLED !== "1" &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
export const AFTER_AUTH_URL = "/dashboard";
