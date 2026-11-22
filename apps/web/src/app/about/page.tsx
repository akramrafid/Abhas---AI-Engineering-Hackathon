import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/components/layout/PublicPageShell";

export const metadata: Metadata = {
  title: "About Abhas — Dengue Early Warning for Bangladesh",
  description:
    "Mission, epidemiological methodology, honest dataset disclosure, and engineering principles behind Abhas (আভাস).",
};

export default function AboutPage() {
  return (
    <PublicPageShell
      title="About Abhas (আভাস)"
      subtitle="Built to give Bangladesh city corporation health officers a three-week head start before monsoon dengue surges hit hospital wards."
    >
      <section className="rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Why we built Abhas</h2>
        <p className="mt-3 text-sm leading-7 text-slate sm:text-base">
          Dengue control fails when action begins after hospital admissions peak. Across 522 weeks of ward history,
          rainfall strongly leads dengue surges by two to four weeks — peaking at a 3-week lag (deseasonalized
          r = 0.47 vs r = 0.03 in the same week). Abhas translates that biological breeding clock into a ward-by-ward
          operations console in Bangla and English that runs on a standard health-office laptop.
        </p>
      </section>

      <section className="rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Scientific honesty &amp; model card summary</h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate">
          <li>
            <strong className="text-navy">Dataset disclosure:</strong> Abhas is trained and evaluated on the organisers&apos;
            60-ward, 2016–2025 dataset (31,320 rows). Because the dataset looks simulated, hold-out accuracy is presented
            as an engineering demonstration rather than a real-world clinical claim.
          </li>
          <li>
            <strong className="text-navy">Strict chronological evaluation:</strong> Trained on 2016–2022, tuned &amp; conformalized
            on 2023, and scored once on locked 2024–2025 hold-out years — zero future leakage.
          </li>
          <li>
            <strong className="text-navy">Schematic map honesty:</strong> Official ward polygons are absent in the dataset,
            so ward dots are positioned near city corporation centres and labelled as approximate.
          </li>
        </ul>
      </section>

      <section className="rounded-[14px] border border-mist bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-navy">Built for public-sector pilots</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          Abhas is open-source and seeks pilot collaborations with Dhaka North (DNCC), Dhaka South (DSCC), Chattogram (CCC),
          Gazipur (GCC), Narayanganj (NCC), IEDCR, and DGHS MIS teams.{" "}
          <Link href="/contact" className="font-semibold text-royal hover:underline">
            Request a municipal pilot →
          </Link>
        </p>
      </section>
    </PublicPageShell>
  );
}
