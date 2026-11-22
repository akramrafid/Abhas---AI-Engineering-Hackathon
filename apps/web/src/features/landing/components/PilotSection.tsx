"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  LineChart,
  Mail,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "@/components/icons";
import { clsx } from "clsx";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";

const BENCHMARKS = [
  {
    icon: LineChart,
    value: "~20%",
    unit: "lower MAE",
    badge: "1.01 vs 1.26",
    detail: "Beats seasonal baseline on locked 2024–2025 hold-out (+3w).",
  },
  {
    icon: CheckCircle2,
    value: "83.3%",
    unit: "eval pass rate",
    badge: "40 / 48 cases",
    detail: "Locked critical & tiered hold-out cases with 11/11 quality floors.",
  },
  {
    icon: MapPin,
    value: "0.611",
    unit: "Recall@15",
    badge: "MRR 0.888",
    detail: "Beats climatology (0.570) at ranking top-15 hotspot wards.",
  },
  {
    icon: ShieldCheck,
    value: "$0",
    unit: "software fee",
    badge: "Offline-ready",
    detail: "Open municipal pilot on existing office laptops; zero paid API keys.",
  },
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

const PILOT_TOPICS = [
  "Weekly ward forecast",
  "SMS officer alerts",
  "Local laptop deployment",
  "DGHS / MIS feed sync",
] as const;

export function PilotSection() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  const [name, setName] = useState("");
  const [org, setOrg] = useState<string>(ORG_OPTIONS[0]);
  const [contact, setContact] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic],
    );
  };

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
      className="relative scroll-mt-20 overflow-hidden border-t border-mist bg-paper px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(55%_55%_at_20%_0%,rgba(47,91,255,0.06),transparent_72%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5.5fr)_minmax(0,6.5fr)] lg:items-start lg:gap-14">
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
            className={clsx("mt-4 text-base leading-7 text-slate", bn && "font-bangla")}
          >
            {bn
              ? "আমরা কোনো কাল্পনিক প্রশংসাপত্র ব্যবহার করি না। আভাস এখনো মাঠপর্যায়ের পাইলটের জন্য উন্মুক্ত — বাংলাদেশের যেকোনো সিটি কর্পোরেশন বা স্বাস্থ্য দপ্তরের সাথে বিনা খরচে পাইলট চালু করতে আমরা প্রস্তুত।"
              : "We do not publish fabricated testimonials. Abhas is an open early-warning platform seeking municipal pilot partners across Bangladesh — judge the model directly on its locked 2024–2025 validation numbers."}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENCHMARKS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.unit}
                  className="group rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_14px_30px_-18px_rgba(11,26,92,0.12)] ring-1 ring-mist/90 transition-all duration-200 hover:-translate-y-0.5 hover:ring-royal/30 hover:shadow-[0_12px_28px_-14px_rgba(47,91,255,0.18)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                      <Icon aria-hidden="true" className="h-4.5 w-4.5" />
                    </span>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-mist tnum">
                      {item.badge}
                    </span>
                  </div>
                  <dt className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold tracking-tight text-navy tnum">
                      {item.value}
                    </span>
                    <span className="text-xs font-semibold text-slate">{item.unit}</span>
                  </dt>
                  <dd className="mt-1.5 text-xs leading-5 text-slate">{item.detail}</dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard?demo=1&tab=validation"
              onClick={() =>
                trackEvent({ event: "cta_view_validation", location: "pilot_section", lang })
              }
              className="group inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-navy shadow-[0_1px_2px_rgba(11,26,92,0.05)] ring-1 ring-mist transition-all hover:text-royal hover:ring-royal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
            >
              <LineChart aria-hidden="true" className="h-4 w-4 text-royal" />
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
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-navy shadow-[0_1px_2px_rgba(11,26,92,0.05)] ring-1 ring-mist transition-all hover:text-royal hover:ring-royal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4 text-royal" />
              WhatsApp pilot desk
            </a>
          </div>
        </div>

        {/* Right: Executive Pilot Intake Card */}
        <div className="flex flex-col justify-between overflow-hidden rounded-[22px] bg-white shadow-[0_2px_6px_rgba(11,26,92,0.05),0_26px_58px_-24px_rgba(11,26,92,0.18)] ring-1 ring-mist/90">
          <div>
            <header className="relative overflow-hidden bg-[linear-gradient(135deg,#0B1A5C_0%,#122A88_62%,#1E3FBF_100%)] px-6 py-6 text-white sm:px-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-royal/35 blur-3xl"
              />
              <div className="relative flex flex-wrap items-center justify-between gap-2">
                <h3
                  lang={lang}
                  className={clsx("text-xl font-bold tracking-tight text-white", bn && "font-bangla")}
                >
                  {bn ? "সিটি কর্পোরেশন পাইলটের অনুরোধ করুন" : "Request a city corporation pilot"}
                </h3>
                <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm">
                  $0 license fee
                </span>
              </div>
              <p
                lang={lang}
                className={clsx("relative mt-2 text-sm leading-6 text-mist/90", bn && "font-bangla")}
              >
                {bn
                  ? "কোনো সাবস্ক্রিপশন ফি নেই। আপনার দপ্তরের জন্য ডেমো ও ডেটা ইন্টিগ্রেশন পরিকল্পনা শেয়ার করব।"
                  : "Tell us your city and we will prepare a local ward demo and data-feed onboarding plan."}
              </p>
            </header>

            <div className="p-6 sm:p-8">
              {submitted ? (
                <div
                  role="status"
                  data-testid="pilot-form-success"
                  className="rounded-2xl bg-paper p-5 ring-1 ring-royal/25"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-royal text-white">
                      <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-navy">
                        Pilot inquiry recorded for {org}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate">
                        Thank you, {name}. You can also launch the interactive dashboard immediately
                        or reach our team directly by email or WhatsApp.
                      </p>
                      {selectedTopics.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {selectedTopics.map((topic) => (
                            <span
                              key={topic}
                              className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-mist"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href="/dashboard?demo=1"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-royal px-4 text-xs font-semibold text-white transition-colors hover:bg-navy"
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
                            setSelectedTopics([]);
                            setNotes("");
                          }}
                          className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-mist bg-white px-3.5 text-xs font-semibold text-navy hover:bg-paper"
                        >
                          Submit another inquiry
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
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
                        className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/75 transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="pilot-contact"
                        className="block text-xs font-semibold text-navy"
                      >
                        Official email or WhatsApp
                      </label>
                      <input
                        id="pilot-contact"
                        type="text"
                        required
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder="health@dncc.gov.bd or +880…"
                        className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/75 transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
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
                      className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                    >
                      {ORG_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-navy">
                      Priority modules (optional)
                    </span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PILOT_TOPICS.map((topic) => {
                        const active = selectedTopics.includes(topic);
                        return (
                          <button
                            key={topic}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleTopic(topic)}
                            className={clsx(
                              "rounded-full px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                              active
                                ? "bg-royal text-white shadow-xs"
                                : "bg-paper text-slate ring-1 ring-mist hover:text-navy hover:ring-navy/25",
                            )}
                          >
                            {topic}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pilot-notes" className="block text-xs font-semibold text-navy">
                      Notes or ward scope (optional)
                    </label>
                    <textarea
                      id="pilot-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Target wards, preferred language, or existing surveillance CSV format…"
                      className="mt-1.5 w-full resize-none rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/75 transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                    />
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      data-testid="pilot-submit"
                      className="group inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#2F5BFF_0%,#1D42E0_100%)] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(47,91,255,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgba(47,91,255,0.75)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
                    >
                      {bn ? "পাইলট অনুরোধ পাঠান" : "Request a city pilot"}
                      <ArrowRight
                        aria-hidden="true"
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-mist/80 bg-paper/75 px-6 py-4 sm:px-8">
            <p className="text-xs font-medium text-slate">
              Onboarding: <span className="text-navy">Local demo</span> ·{" "}
              <span className="text-navy">CSV mapping</span> ·{" "}
              <span className="text-navy">Offline handoff</span>
            </p>
            <a
              href="mailto:pilot@abhas.dev?subject=Abhas%20City%20Corporation%20Pilot"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-royal transition-colors hover:text-navy"
            >
              <Mail aria-hidden="true" className="h-3.5 w-3.5" />
              pilot@abhas.dev
            </a>
          </footer>
        </div>
      </div>
    </section>
  );
}
