import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/LandingPage";

export const metadata: Metadata = {
  title: "Abhas (আভাস) — Dengue early warning, ward by ward",
  description:
    "Rain today. Risk in three weeks. Act now. Ward-level dengue forecasts 1 to 4 weeks ahead for Dhaka and Chattogram.",
};

export default function HomePage() {
  return <LandingPage />;
}
