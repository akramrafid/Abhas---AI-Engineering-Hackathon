import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";
import { ThankYouReceipt } from "./ThankYouReceipt";

export const metadata: Metadata = buildPageMetadata({
  title: "Thank You — Pilot Request Received",
  description:
    "Confirmation page for Abhas municipal dengue early-warning pilot and contact inquiries across Bangladesh city corporations.",
  path: "/thank-you",
  noIndex: true,
});

export default function ThankYouPage() {
  return (
    <PublicPageShell
      title="Request received."
      subtitle="We have logged your pilot onboarding inquiry for Abhas (আভাস). You can continue exploring the live 60-ward forecast console right away."
    >
      <Suspense
        fallback={
          <div className="rounded-[16px] border border-mist bg-white p-8 text-sm text-slate">
            Loading confirmation…
          </div>
        }
      >
        <ThankYouReceipt />
      </Suspense>
    </PublicPageShell>
  );
}
