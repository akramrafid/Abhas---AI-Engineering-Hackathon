import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { StatusClient } from "./StatusClient";

export const metadata: Metadata = {
  title: "System Status — Abhas (আভাস)",
  description: "Live health and readiness status for the Abhas API, LightGBM forecast artifact, and SQLite ward store.",
};

export default function StatusPage() {
  return (
    <PublicPageShell
      title="System Status"
      subtitle="Live readiness telemetry directly from this Abhas deployment's /readyz endpoint."
    >
      <StatusClient />
    </PublicPageShell>
  );
}
