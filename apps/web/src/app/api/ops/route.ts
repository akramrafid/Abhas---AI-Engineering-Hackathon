import "server-only";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { serverEnv } from "@/lib/server-env";

// Server-side proxy for the ops telemetry endpoint. OPS_TOKEN (no NEXT_PUBLIC_ prefix) stays on the
// server; the browser only ever calls this same-origin route.
const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function apiBaseUrl(): string {
  const raw = (serverEnv("API_BASE_URL") || process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).trim();
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : DEFAULT_API_BASE_URL;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

function problem(status: number, slug: string, title: string, detail: string) {
  return NextResponse.json(
    { type: `https://abhas.dev/problems/${slug}`, title, status, detail },
    { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  if (AUTH_ENABLED) {
    const { userId } = await auth();
    if (!userId) return problem(401, "unauthenticated", "Sign-in required", "Sign in to view ops telemetry.");
  }

  const headers: Record<string, string> = { Accept: "application/json, application/problem+json" };
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers["X-Request-ID"] = requestId.slice(0, 64);
  const token = serverEnv("OPS_TOKEN");
  if (token) headers["X-Ops-Token"] = token;

  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/v1/ops`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return problem(503, "api-unavailable", "API unavailable", "The forecast API did not answer. Start it and retry.");
  }
}
