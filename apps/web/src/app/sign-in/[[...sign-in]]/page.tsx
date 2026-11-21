import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { AUTH_ENABLED } from "@/lib/auth-config";

export const metadata: Metadata = { title: "Sign in · Abhas" };

export default function SignInPage() {
  if (!AUTH_ENABLED) redirect("/dashboard");
  return (
    <AuthShell
      title="Sign in to see which wards surge, and when."
      lede="The dashboard shows each ward's dengue risk for the next 1 to 4 weeks, with the rain that drives it."
    >
      <Suspense fallback={<p className="text-sm text-slate">Loading sign-in…</p>}>
        <SignIn />
      </Suspense>
    </AuthShell>
  );
}
