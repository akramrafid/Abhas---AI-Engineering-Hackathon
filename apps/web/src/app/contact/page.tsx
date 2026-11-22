import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PilotSection } from "@/features/landing/components/PilotSection";

export const metadata: Metadata = {
  title: "Request a Pilot & Contact — Abhas (আভাস)",
  description:
    "Schedule a municipal dengue early-warning pilot for Bangladesh city corporations via form, email, or WhatsApp.",
};

export default function ContactPage() {
  return (
    <PublicPageShell
      title="Request a Municipal Pilot"
      subtitle="Zero software license fees for Bangladesh city corporations, health offices, and public-health researchers."
    >
      <div className="-mx-4 overflow-hidden rounded-[16px] border border-mist sm:mx-0">
        <PilotSection />
      </div>
    </PublicPageShell>
  );
}
