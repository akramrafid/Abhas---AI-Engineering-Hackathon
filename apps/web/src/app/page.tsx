import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingPage } from "@/features/landing/LandingPage";
import { buildHomeJsonLd, buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Abhas (আভাস) — Dengue Early Warning, Ward by Ward",
    description:
      "Rain today. Risk in three weeks. Act now. Ward-level dengue forecasts 1 to 4 weeks ahead for 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur, and Narayanganj.",
    path: "/",
  }),
  title: {
    absolute: "Abhas (আভাস) — Dengue Early Warning, Ward by Ward",
  },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={buildHomeJsonLd()} />
      <LandingPage />
    </>
  );
}
