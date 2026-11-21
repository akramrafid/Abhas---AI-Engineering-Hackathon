import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { AUTH_ENABLED, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth-config";

// The dashboard used to live at "/". Old links such as "/?demo=1" keep working.
const DASHBOARD_PARAMS = ["demo", "ward", "origin", "window", "tab", "lang"];

function redirectLegacyDashboardUrl(req: NextRequest): NextResponse | null {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname !== "/" || !DASHBOARD_PARAMS.some((key) => searchParams.has(key))) {
    return null;
  }
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  return NextResponse.redirect(url);
}

// Clerk only attaches the session here; the dashboard layout enforces sign-in (resource-based check).
const withClerk = clerkMiddleware(
  async (_auth, req) => redirectLegacyDashboardUrl(req) ?? NextResponse.next(),
  { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL },
);

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!AUTH_ENABLED) return redirectLegacyDashboardUrl(req) ?? NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
