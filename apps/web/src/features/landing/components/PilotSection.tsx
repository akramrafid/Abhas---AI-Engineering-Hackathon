"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Mail, MessageCircle } from "@/components/icons";
import { clsx } from "clsx";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";

const BENCHMARKS = [
  { metric: "~20% lower MAE", detail: "1.01 vs 1.26 seasonal baseline on locked 2024–2025 hold-out (+3w)" },
  { metric: "83.3% pass rate", detail: "40 of 48 locked critical & tiered hold-out cases, 11/11 quality floors" },
  { metric: "0.611 Recall@15", detail: "Beats climatology (0.570) at ranking top-15 hotspot wards; MRR 0.888" },
  { metric: "$0 software fee", detail: "Open pilot on existing office laptops; zero required external API keys" },
] as const;

const ORG_OPTIONS = [
  "Dhaka North City Corporation (DNCC)",
  "Dhaka South City Corporation (DSCC)",
  "Chattogram City Corporation (CCC)",
  "Gazipur City Corporation (GCC)",
  "Narayanganj City Corporation (NCC)",
  "DGHS / IEDCR / Public Health Research",
  "Other Municipality or NGO",
] as const;

export function PilotSection() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  const [name, setName] = useState("");
  const [org, setOrg] = useState<string>(ORG_OPTIONS[0]);
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) return;
    trackEvent({ event: "pilot_form_submit", location: "landing_pilot", label: org, lang });
    setSubmitted(true);
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    "Hello Abhas team, I would like to discuss a municipal dengue early-warning pilot.",
  )}`;

  return (
    <section
      id="pilot"
      aria-labelledby="pilot-heading"
      className="scroll-mt-20 border-t border-mist bg-paper px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5.5fr)_minmax(0,6.5fr)] lg:gap-16">
        {/* Left: Honest validation proof + pilot partners wanted */}
        <div>
          <h2
            id="pilot-heading"
            lang={lang}
            className={clsx(
              "text-balance text-[clamp(1.85rem,3.6vw,2.85rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight",
            )}
          >
            {bn
              ? "পাইলট অংশীদার সিটি কর্পোরেশন খুঁজছি — প্রমাণিত মডেলের ভিত্তিতে।"
              : "Pilot partners wanted. Backed by locked validation, not invented quotes."}
          </h2>
          <p
            lang={lang}
            className={clsx("mt-4 text-body leading-7 text-slate", bn && "font-bangla")}
          >
            {bn
              ? "আমরা কোনো কাল্পনিক প্রশংসাপত্র ব্যবহার করি না। আভাস এখনো মাঠপর্যায়ের পাইলটের জন্য উন্মুক্ত — বাংলাদেশের যেকোনো সিটি কর্পোরেশন বা স্বাস্থ্য দপ্তরের সাথে বিনা খরচে পাইলট চালু করতে আমরা প্রস্তুত।"
              : "We do not publish fabricated testimonials. Abhas is an open early-warning platform seeking municipal pilot partners across Bangladesh — judge the model directly on its locked 2024–2025 validation numbers."}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENCHMARKS.map((item) => (
              <div
                key={item.metric}
                className="rounded-[12px] border border-mist bg-white p-4"
              >
                <dt className="text-lg font-extrabold tracking-tight text-navy tnum">
                  {item.metric}
                </dt>
                <dd className="mt-1 text-xs leading-5 text-slate">{item.detail}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard?demo=1&tab=validation"
              onClick={() =>
                trackEvent({ event: "cta_view_validation", location: "pilot_section", lang })
              }
              className="group inline-flex min-h-10 items-center gap-1.5 rounded-full border border-mist bg-white px-4 text-sm font-semibold text-navy transition-colors hover:border-royal hover:text-royal"
            >
              Inspect live validation dashboard
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEvent({ event: "cta_whatsapp_contact", location: "pilot_section", lang })
              }
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-mist bg-white px-4 text-sm font-semibold text-navy transition-colors hover:border-royal hover:text-royal"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4 text-royal" />
              WhatsApp pilot desk
            </a>
          </div>
        </div>

        {/* Right: Request a pilot form (replaces self-serve SaaS pricing) */}
        <div className="rounded-[16px] border border-mist bg-white p-6 sm:p-8">
          <h3
            lang={lang}
            className={clsx("text-xl font-bold text-navy", bn && "font-bangla")}
          >
            {bn ? "সিটি কর্পোরেশন পাইলটের অনুরোধ করুন" : "Request a city corporation pilot"}
          </h3>
          <p
            lang={lang}
            className={clsx("mt-1.5 text-sm text-slate", bn && "font-bangla")}
          >
            {bn
              ? "কোনো সাবস্ক্রিপশন ফি নেই। আপনার দপ্তরের জন্য ডেমো ও ডেটা ইন্টিগ্রেশন পরিকল্পনা শেয়ার করব।"
              : "Zero license fees for municipal health offices. Tell us your city and we will prepare a local demo and data-feed onboarding plan."}
          </p>

          {submitted ? (
            <div
              role="status"
              data-testid="pilot-form-success"
              className="mt-6 rounded-[12px] border border-royal/25 bg-paper p-5"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-royal" />
                <div>
                  <p className="text-sm font-bold text-navy">Pilot inquiry recorded for {org}</p>
                  <p className="mt-1 text-sm text-slate">
                    Thank you, {name}. You can also launch the interactive dashboard immediately or
                    reach our team directly by email or WhatsApp.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href="/dashboard?demo=1"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-royal px-3.5 text-xs font-semibold text-white hover:bg-navy"
                    >
                      Open live dashboard
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitted(false);
                        setName("");
                        setContact("");
                        setNotes("");
                      }}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-mist bg-white px-3.5 text-xs font-semibold text-navy hover:bg-paper"
                    >
                      Submit another inquiry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pilot-name" className="block text-xs font-semibold text-navy">
                    Your name &amp; role
                  </label>
                  <input
                    id="pilot-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Farhana Rahman, CHO"
                    className="mt-1.5 w-full rounded-[10px] border border-mist bg-paper/60 px-3 py-2.5 text-sm text-ink placeholder:text-slate focus:border-royal focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal/15"
                  />
                </div>
                <div>
                  <label htmlFor="pilot-contact" className="block text-xs font-semibold text-navy">
                    Official email or WhatsApp
                  </label>
                  <input
                    id="pilot-contact"
                    type="text"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="health@dncc.gov.bd or +880…"
                    className="mt-1.5 w-full rounded-[10px] border border-mist bg-paper/60 px-3 py-2.5 text-sm text-ink placeholder:text-slate focus:border-royal focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal/15"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pilot-org" className="block text-xs font-semibold text-navy">
                  City corporation or agency
                </label>
                <select
                  id="pilot-org"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  className="mt-1.5 w-full rounded-[10px] border border-mist bg-paper/60 px-3 py-2.5 text-sm text-ink focus:border-royal focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal/15"
                >
                  {ORG_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pilot-notes" className="block text-xs font-semibold text-navy">
                  What would you like to pilot first? (optional)
                </label>
                <textarea
                  id="pilot-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Weekly ward surveillance feed, SMS alerts, or local laptop deployment…"
                  className="mt-1.5 w-full resize-none rounded-[10px] border border-mist bg-paper/60 px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-royal focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal/15"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  data-testid="pilot-submit"
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-royal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy"
                >
                  {bn ? "পাইলট অনুরোধ পাঠান" : "Request a pilot"}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
                <a
                  href="mailto:pilot@abhas.dev?subject=Abhas%20City%20Corporation%20Pilot"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate hover:text-navy"
                >
                  <Mail aria-hidden="true" className="h-3.5 w-3.5" />
                  pilot@abhas.dev
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
