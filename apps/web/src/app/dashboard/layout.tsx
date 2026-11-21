import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { AFTER_AUTH_URL, AUTH_ENABLED, SIGN_IN_URL } from "@/lib/auth-config";

async function RequireSignIn({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect(`${SIGN_IN_URL}?redirect_url=${encodeURIComponent(AFTER_AUTH_URL)}`);
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED) return <>{children}</>;
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl p-6">
          <PanelSkeleton label="Checking your sign-in…" />
        </div>
      }
    >
      <RequireSignIn>{children}</RequireSignIn>
    </Suspense>
  );
}
