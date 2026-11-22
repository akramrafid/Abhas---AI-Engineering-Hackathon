import type { Metadata } from "next";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Terms of use, early-warning decision-support scope, and open-data attributions for Abhas.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <PublicPageShell
      title="Terms of Service"
      subtitle="Clear expectations for using Abhas as a dengue early-warning decision-support tool."
    >
      <div className="space-y-6 rounded-[14px] border border-mist bg-white p-6 text-sm leading-7 text-slate sm:p-8">
        <section>
          <h2 className="text-base font-bold text-navy">1. Decision-support scope</h2>
          <p className="mt-1.5">
            Abhas provides statistical risk forecasts to assist municipal health officers with planning and resource
            allocation. It is not a clinical diagnosis tool and does not replace official directives from DGHS, IEDCR,
            or city corporation health authorities.
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold text-navy">2. Hackathon dataset disclosure</h2>
          <p className="mt-1.5">
            The bundled 2016–2025 ward dataset is provided for demonstration and evaluation. Operational deployment in a
            city corporation requires connecting verified local epidemiological surveillance records.
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold text-navy">3. Open-data &amp; library attribution</h2>
          <p className="mt-1.5">
            Weather data by Open-Meteo.com (CC BY 4.0). Basemap tiles © OpenStreetMap contributors © CARTO. Fonts
            bundled locally via Fontsource (Poppins &amp; Noto Sans Bengali).
          </p>
        </section>
      </div>
    </PublicPageShell>
  );
}
