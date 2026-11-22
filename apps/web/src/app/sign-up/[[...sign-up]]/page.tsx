import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Create account",
  description: "Create a municipal health office account for Abhas.",
  path: "/sign-up",
  noIndex: true,
});

export default function SignUpPage() {
  if (!AUTH_ENABLED) redirect("/dashboard");
  return (
    <AuthShell
      title="Create an account for your health office."
      lede="One account opens the ward forecasts, the rain-lag view and the weekly priority list for all five city corporations."
    >
      <Suspense fallback={<p className="text-sm text-slate">Loading sign-up…</p>}>
        <SignUp />
      </Suspense>
    </AuthShell>
  );
}
