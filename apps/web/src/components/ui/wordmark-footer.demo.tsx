import React from "react";
import { WordmarkFooter } from "@/components/ui/wordmark-footer";

export function WordmarkFooterDemo() {
  return (
    <div className="w-full">
      <WordmarkFooter
        name="Abhas"
        localizedName="আভাস"
        legalName="Abhas Dengue Early Warning System"
        year={2026}
        description="Rain today. Outbreak risk in three weeks. Act now. Ward-level dengue forecasting for Bangladesh City Corporations."
        status="Live weather & surveillance data active"
        email="contact@abhas.gov.bd"
        columns={[
          {
            title: "Operations",
            links: [
              { label: "Overview Dashboard", href: "/dashboard?demo=1" },
              { label: "City Risk Heatmap", href: "/dashboard?tab=heatmap&demo=1" },
              { label: "Priority Ward List", href: "/dashboard?tab=priority&demo=1" },
              { label: "Rain Lags Evidence", href: "/dashboard?tab=lags&demo=1" },
            ],
          },
          {
            title: "Science & Model",
            links: [
              { label: "Model Architecture", href: "/brand" },
              { label: "Hold-Out Validation", href: "/dashboard?tab=validation&demo=1" },
              { label: "Threat Model & Security", href: "/brand" },
              { label: "Open-Meteo CC BY 4.0", href: "https://open-meteo.com/", external: true },
            ],
          },
          {
            title: "Legal & Standards",
            links: [
              { label: "WCAG 2.2 AA Accessibility", href: "/brand" },
              { label: "Data Protection & Privacy", href: "#" },
              { label: "DGHS Surveillance Protocol", href: "#" },
            ],
          },
        ]}
        credit={{
          label: "Built for AI Engineering Hackathon 2026",
          href: "https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon",
        }}
      />
    </div>
  );
}

export default WordmarkFooterDemo;
