import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";
import { StatusClient } from "./StatusClient";

export const metadata: Metadata = buildPageMetadata({
  title: "System Status",
  description:
    "Live health and readiness status for the Abhas API, SHA-256 LightGBM forecast artifact, and SQLite ward store.",
  path: "/status",
});

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
