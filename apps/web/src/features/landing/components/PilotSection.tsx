"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  LineChart,
  Lock,
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
    unitEn: "lower MAE",
    unitBn: "কম MAE",
    badge: "1.01 vs 1.26",
    detailEn: "Beats seasonal baseline on locked 2024–2025 hold-out (+3w).",
    detailBn: "লকড ২০২৪–২০২৫ হোল্ড-আউটে (+৩ সপ্তাহ) মৌসুমি গড়ের চেয়ে কম ত্রুটি।",
  },
  {
    icon: CheckCircle2,
    value: "83.3%",
    unitEn: "eval pass rate",
    unitBn: "ইভ্যাল পাস হার",
    badge: "40 / 48",
    detailEn: "Locked critical & tiered hold-out cases with 11/11 quality floors.",
    detailBn: "লকড ৪৮টি কেসের মধ্যে ৪০টি পাস এবং ১১/১১ মানদণ্ড পূরণ।",
  },
  {
    icon: MapPin,
    value: "0.611",
    unitEn: "Recall@15",
    unitBn: "Recall@15",
    badge: "MRR 0.888",
    detailEn: "Beats climatology (0.570) at ranking top-15 hotspot wards.",
    detailBn: "শীর্ষ ১৫ হটস্পট ওয়ার্ড শনাক্তকরণে জলবায়ু গড়ের (০.৫৭০) চেয়ে এগিয়ে।",
  },
  {
    icon: ShieldCheck,
    value: "$0",
    unitEn: "software fee",
    unitBn: "সফটওয়্যার ফি",
    badgeEn: "Offline-ready",
    badgeBn: "অফলাইন-প্রস্তুত",
    detailEn: "Open municipal pilot on existing office laptops; zero paid API keys.",
    detailBn: "অফিসের বিদ্যমান ল্যাপটপে বিনামূল্যে পাইলট; কোনো পেইড এপিআই কী লাগে না।",
  },
] as const;

const ORG_OPTIONS = [
  { en: "Dhaka North City Corporation (DNCC)", bn: "ঢাকা উত্তর সিটি কর্পোরেশন (DNCC)" },
  { en: "Dhaka South City Corporation (DSCC)", bn: "ঢাকা দক্ষিণ সিটি কর্পোরেশন (DSCC)" },
  { en: "Chattogram City Corporation (CCC)", bn: "চট্টগ্রাম সিটি কর্পোরেশন (CCC)" },
  { en: "Gazipur City Corporation (GCC)", bn: "গাজীপুর সিটি কর্পোরেশন (GCC)" },
  { en: "Narayanganj City Corporation (NCC)", bn: "নারায়ণগঞ্জ সিটি কর্পোরেশন (NCC)" },
  { en: "DGHS / IEDCR / Public Health Research", bn: "স্বাস্থ্য অধিদপ্তর (DGHS) / IEDCR / জনস্বাস্থ্য গবেষণা" },
  { en: "Other Municipality or NGO", bn: "অন্যান্য পৌরসভা বা এনজিও" },
] as const;

const WHATSAPP_NUMBER_E164 = "8801641414949";

const PILOT_TOPICS = [
  { id: "Weekly ward forecast", en: "Weekly ward forecast", bn: "সাপ্তাহিক ওয়ার্ড পূর্বাভাস" },
  { id: "SMS officer alerts", en: "SMS officer alerts", bn: "এসএমএস কর্মকর্তা সতর্কতা" },
  { id: "Local laptop deployment", en: "Local laptop deployment", bn: "অফিস ল্যাপটপ ইনস্টলেশন" },
  { id: "DGHS / MIS feed sync", en: "DGHS / MIS feed sync", bn: "DGHS / MIS ডেটা সংযোগ" },
] as const;

function agencyCode(org: string): string {
  const paren = /\(([A-Z]{2,5})\)/.exec(org);
  if (paren) return paren[1];
  if (org.includes("DGHS")) return "DGHS";
  return "MUNI";
}

interface SubmissionReceipt {
  refId: string;
  submittedAt: string;
  name: string;
  org: string;
  contact: string;
  topics: string[];
  notes: string;
}

export function PilotSection() {
  const router = useRouter();
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  const [name, setName] = useState("");
  const [org, setOrg] = useState<string>(ORG_OPTIONS[0].en);
  const [contact, setContact] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const toggleTopic = (topicId: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicId) ? prev.filter((item) => item !== topicId) : [...prev, topicId],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanContact = contact.trim();
    if (!cleanName || !cleanContact) return;

    const code = agencyCode(org);
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const refId = `ABH-${code}-${suffix}`;
    const submittedAt = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    trackEvent({ event: "pilot_form_submit", location: "landing_pilot", label: org, lang });
    setReceipt({
      refId,
      submittedAt,
      name: cleanName,
      org,
      contact: cleanContact,
      topics: [...selectedTopics],
      notes: notes.trim(),
    });
    const qs = new URLSearchParams({ ref: refId, org, name: cleanName });
    router.push(`/thank-you?${qs.toString()}`);
  };

  const handleCopyRef = async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.refId);
      setCopiedRef(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      // Ignore if clipboard API is unavailable.
    }
  };

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER_E164}?text=${encodeURIComponent(
    "Hello Abhas team, I would like to discuss a municipal dengue early-warning pilot.",
  )}`;

  const receiptSummaryText = receipt
    ? [
        `Ref: ${receipt.refId}`,
        `Name & role: ${receipt.name}`,
        `Agency: ${receipt.org}`,
        `Contact: ${receipt.contact}`,
        receipt.topics.length > 0 ? `Modules: ${receipt.topics.join(", ")}` : null,
        receipt.notes ? `Notes: ${receipt.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const receiptWhatsappHref = `https://wa.me/${WHATSAPP_NUMBER_E164}?text=${encodeURIComponent(
    `Hello Abhas Pilot Desk,\nI just submitted a municipal pilot request:\n${receiptSummaryText}`,
  )}`;

  const receiptMailtoHref = receipt
    ? `mailto:pilot@abhas.dev?subject=${encodeURIComponent(
        `Abhas Pilot Request [${receipt.refId}] — ${receipt.org}`,
      )}&body=${encodeURIComponent(
        `Hello Abhas Pilot Desk,\n\nPlease find our municipal pilot request details below:\n\n${receiptSummaryText}\n`,
      )}`
    : "mailto:pilot@abhas.dev?subject=Abhas%20City%20Corporation%20Pilot";

  return (
    <section
      id="pilot"
      aria-labelledby="pilot-heading"
      lang={lang}
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
            className={clsx(
              "text-balance text-[clamp(1.85rem,3.6vw,2.85rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "পাইলট অংশীদার সিটি কর্পোরেশন খুঁজছি — প্রমাণিত মডেলের ভিত্তিতে।"
              : "Pilot partners wanted. Backed by locked validation, not invented quotes."}
          </h2>
          <p className={clsx("mt-4 text-base leading-7 text-slate", bn && "font-bangla")}>
            {bn
              ? "আমরা কোনো কাল্পনিক প্রশংসাপত্র ব্যবহার করি না। আভাস এখনো মাঠপর্যায়ের পাইলটের জন্য উন্মুক্ত — বাংলাদেশের যেকোনো সিটি কর্পোরেশন বা স্বাস্থ্য দপ্তরের সাথে বিনা খরচে পাইলট চালু করতে আমরা প্রস্তুত।"
              : "We do not publish fabricated testimonials. Abhas is an open early-warning platform seeking municipal pilot partners across Bangladesh — judge the model directly on its locked 2024–2025 validation numbers."}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENCHMARKS.map((item) => {
              const Icon = item.icon;
              const badgeText =
                "badgeBn" in item ? (bn ? item.badgeBn : item.badgeEn) : item.badge;
              return (
                <div
                  key={item.unitEn}
                  className="group rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_14px_30px_-18px_rgba(11,26,92,0.12)] ring-1 ring-mist/90 transition-all duration-200 hover:-translate-y-0.5 hover:ring-royal/30 hover:shadow-[0_12px_28px_-14px_rgba(47,91,255,0.18)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                      <Icon aria-hidden="true" className="h-4.5 w-4.5" />
                    </span>
                    <span className={clsx("rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-mist tnum", bn && "font-bangla")}>
                      {badgeText}
                    </span>
                  </div>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold tracking-tight text-navy tnum">
                      {item.value}
                    </span>
                    <span className={clsx("text-xs font-semibold text-slate", bn && "font-bangla")}>
                      {bn ? item.unitBn : item.unitEn}
                    </span>
                  </p>
                  <p className={clsx("mt-1.5 text-xs leading-5 text-slate", bn && "font-bangla")}>
                    {bn ? item.detailBn : item.detailEn}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard?demo=1&tab=validation&lang=${lang}`}
              prefetch={false}
              onClick={() =>
                trackEvent({ event: "cta_view_validation", location: "pilot_section", lang })
              }
              className={clsx(
                "group inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-navy shadow-[0_1px_2px_rgba(11,26,92,0.05)] ring-1 ring-mist transition-all hover:text-royal hover:ring-royal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                bn && "font-bangla",
              )}
            >
              <LineChart aria-hidden="true" className="h-4 w-4 text-royal" />
              {bn ? "লাইভ যাচাই ড্যাশবোর্ড দেখুন" : "Inspect live validation dashboard"}
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp Abhas pilot desk (+880 1641-414949)"
              aria-label={bn ? "হোয়াটসঅ্যাপ পাইলট ডেস্ক (+৮৮০ ১৬৪১-৪১৪৯৪৯)" : "WhatsApp pilot desk (+880 1641-414949)"}
              onClick={() =>
                trackEvent({ event: "cta_whatsapp_contact", location: "pilot_section", lang })
              }
              className={clsx(
                "inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-navy shadow-[0_1px_2px_rgba(11,26,92,0.05)] ring-1 ring-mist transition-all hover:text-royal hover:ring-royal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                bn && "font-bangla",
              )}
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4 text-royal" />
              {bn ? "হোয়াটসঅ্যাপ পাইলট ডেস্ক" : "WhatsApp pilot desk"}
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
                <h3 className={clsx("text-xl font-bold tracking-tight text-white", bn && "font-bangla")}>
                  {receipt
                    ? bn
                      ? "পাইলট অনুরোধ নিশ্চিত হয়েছে"
                      : "Pilot request confirmed"
                    : bn
                      ? "সিটি কর্পোরেশন পাইলটের অনুরোধ করুন"
                      : "Request a city corporation pilot"}
                </h3>
                <span className={clsx("inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm tnum", bn && "font-bangla")}>
                  {receipt ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {receipt.refId}
                    </>
                  ) : bn ? (
                    "$০ লাইসেন্স ফি"
                  ) : (
                    "$0 license fee"
                  )}
                </span>
              </div>
              <p className={clsx("relative mt-2 text-sm leading-6 text-mist/90", bn && "font-bangla")}>
                {receipt
                  ? bn
                    ? "ধন্যবাদ। আমাদের বাংলাদেশ পাইলট টিম আপনার তথ্য যাচাই করে ২৪ ঘণ্টার মধ্যে যোগাযোগ করবে।"
                    : "Your request is logged with our Bangladesh municipal pilot desk. Here is your confirmation receipt and exact onboarding timeline."
                  : bn
                    ? "কোনো সাবস্ক্রিপশন ফি নেই। আপনার দপ্তরের জন্য ডেমো ও ডেটা ইন্টিগ্রেশন পরিকল্পনা শেয়ার করব।"
                    : "Tell us your city and we will prepare a local ward demo and data-feed onboarding plan."}
              </p>
            </header>

            <div className="p-6 sm:p-8">
              {receipt ? (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="pilot-form-success"
                  className={clsx("abhas-ward-enter space-y-5", bn && "font-bangla")}
                >
                  <div className="rounded-2xl bg-royal/[0.06] p-4 ring-1 ring-royal/25">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal text-white">
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-navy">
                            {bn
                              ? `ধন্যবাদ, ${receipt.name} — আপনার অনুরোধ গৃহীত হয়েছে`
                              : `Thank you, ${receipt.name} — we have received your request`}
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyRef}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-navy ring-1 ring-mist transition-colors hover:text-royal hover:ring-royal/40 tnum"
                          >
                            {copiedRef ? (
                              <>
                                <Check aria-hidden="true" className="h-3 w-3 text-royal" />
                                {bn ? "কপি হয়েছে" : "Copied"}
                              </>
                            ) : (
                              <>
                                <Copy aria-hidden="true" className="h-3 w-3 text-slate" />
                                {receipt.refId}
                              </>
                            )}
                          </button>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate">
                          {bn
                            ? `আমাদের ইঞ্জিনিয়ারিং টিম ${receipt.contact}-এ ২৪ ঘণ্টার মধ্যে যোগাযোগ করে পরবর্তী ধাপ নিশ্চিত করবে।`
                            : `Our pilot engineering desk will contact you via ${receipt.contact} within 24 hours with a tailored ward walkthrough for ${receipt.org}.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <dl className="grid gap-2.5 rounded-2xl bg-paper/75 p-4 text-xs ring-1 ring-mist/85 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-slate">{bn ? "দপ্তর" : "Agency"}</dt>
                      <dd className="mt-0.5 font-bold text-navy">{receipt.org}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate">{bn ? "সময়" : "Logged at"}</dt>
                      <dd className="mt-0.5 font-semibold text-navy tnum">{receipt.submittedAt}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate">{bn ? "যোগাযোগের মাধ্যম" : "Contact channel"}</dt>
                      <dd className="mt-0.5 font-semibold text-navy">{receipt.contact}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate">{bn ? "প্রতিক্রিয়ার সময়" : "Response SLA"}</dt>
                      <dd className="mt-0.5 inline-flex items-center gap-1 font-semibold text-royal">
                        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                        {bn ? "২৪ ঘণ্টার মধ্যে (BST)" : "Within 24 hours (BST)"}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-navy">
                      {bn ? "পরবর্তী ৩টি ধাপ" : "What our team does next"}
                    </p>
                    <ol className="space-y-2 text-xs">
                      {[
                        {
                          step: "01",
                          title: bn ? "২৪ ঘণ্টার মধ্যে সরাসরি যোগাযোগ" : "Direct confirmation within 24 hours",
                          desc: bn
                            ? `লক্ষ্য ওয়ার্ড ও ভাষা নিশ্চিত করতে ${receipt.contact}-এ যোগাযোগ করা হবে।`
                            : `We reach out to ${receipt.contact} to confirm target wards, language (EN/বাংলা), and officer access.`,
                        },
                        {
                          step: "02",
                          title: bn ? "আপনার শহরের জন্য লাইভ ওয়ার্ড ডেমো" : "Live ward demo for your city corporation",
                          desc: bn
                            ? "৪৮ ঘণ্টার মধ্যে ১–৪ সপ্তাহের গ্রাফ, প্রিন্টযোগ্য এ৪ ব্রিফ ও CSV এক্সপোর্ট প্রদর্শন।"
                            : "48-hour session showing +1w to +4w rainfall lag risk curves, printable A4 briefs, and CSV exports.",
                        },
                        {
                          step: "03",
                          title: bn ? "বিনামূল্যে অফলাইন হ্যান্ডঅফ ও ডেটা ম্যাপিং" : "Zero-fee offline handoff & data mapping",
                          desc: bn
                            ? "কোনো রোগীর ব্যক্তিগত তথ্য ছাড়াই সাপ্তাহিক CSV ম্যাপিং এবং অফিস ল্যাপটপে সেটআপ।"
                            : "Map your weekly aggregate CSV (zero patient PII) and run the 954.6 KiB model locally on office hardware.",
                        },
                      ].map((item) => (
                        <li
                          key={item.step}
                          className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-mist/85"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy text-[10px] font-bold text-white tnum">
                            {item.step}
                          </span>
                          <div>
                            <p className="font-bold text-navy">{item.title}</p>
                            <p className="mt-0.5 leading-5 text-slate">{item.desc}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard?demo=1&lang=${lang}`}
                        className="group inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#2F5BFF_0%,#1D42E0_100%)] px-4 text-xs font-semibold text-white transition-all hover:brightness-105"
                      >
                        {bn ? "লাইভ ওয়ার্ড ড্যাশবোর্ড দেখুন" : "Explore live ward dashboard"}
                        <ArrowRight
                          aria-hidden="true"
                          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                      <a
                        href={receiptWhatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-paper px-3.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors hover:text-royal hover:ring-royal/40"
                      >
                        <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                        {bn ? "হোয়াটসঅ্যাপে পাঠান" : "Fast-track on WhatsApp"}
                      </a>
                      <a
                        href={receiptMailtoHref}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-paper px-3.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors hover:text-royal hover:ring-royal/40"
                      >
                        <Mail aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                        {bn ? "ইমেইলে কপি পাঠান" : "Email receipt copy"}
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate">
                      <span className="inline-flex items-center gap-1.5">
                        <Lock aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
                        {bn
                          ? "শুধুমাত্র পাইলট সময়সূচীর জন্য ব্যবহৃত · কোনো রোগীর তথ্য সংগ্রহ হয় না"
                          : "Used strictly for pilot scheduling · zero patient PII collected"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setReceipt(null);
                          setName("");
                          setContact("");
                          setSelectedTopics([]);
                          setNotes("");
                        }}
                        className="cursor-pointer font-semibold text-royal hover:text-navy hover:underline"
                      >
                        {bn ? "আরেকটি অনুরোধ পাঠান" : "Submit another inquiry"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className={clsx("space-y-4", bn && "font-bangla")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="pilot-name" className="block text-xs font-semibold text-navy">
                        {bn ? "আপনার নাম ও পদবি" : "Your name & role"}
                      </label>
                      <input
                        id="pilot-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={bn ? "ডা. ফারহানা রহমান, সিএইচও" : "Dr. Farhana Rahman, CHO"}
                        className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/75 transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                      />
                    </div>
                    <div>
                      <label htmlFor="pilot-contact" className="block text-xs font-semibold text-navy">
                        {bn ? "অফিসিয়াল ইমেইল বা হোয়াটসঅ্যাপ" : "Official email or WhatsApp"}
                      </label>
                      <input
                        id="pilot-contact"
                        type="text"
                        required
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder={bn ? "health@dncc.gov.bd বা ০১..." : "health@dncc.gov.bd or +880…"}
                        className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/75 transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pilot-org" className="block text-xs font-semibold text-navy">
                      {bn ? "সিটি কর্পোরেশন বা সংস্থা" : "City corporation or agency"}
                    </label>
                    <select
                      id="pilot-org"
                      value={org}
                      onChange={(e) => setOrg(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-mist bg-paper/55 px-3.5 py-2.5 text-sm text-ink transition-all hover:border-navy/25 focus:border-royal focus:bg-white focus:outline-none focus:ring-4 focus:ring-royal/12"
                    >
                      {ORG_OPTIONS.map((opt) => (
                        <option key={opt.en} value={opt.en}>
                          {bn ? opt.bn : opt.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-navy">
                      {bn ? "অগ্রাধিকার মডিউল (ঐচ্ছিক)" : "Priority modules (optional)"}
                    </span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PILOT_TOPICS.map((topic) => {
                        const active = selectedTopics.includes(topic.id);
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleTopic(topic.id)}
                            className={clsx(
                              "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                              active
                                ? "bg-royal text-white shadow-xs"
                                : "bg-paper text-slate ring-1 ring-mist hover:text-navy hover:ring-navy/25",
                            )}
                          >
                            {bn ? topic.bn : topic.en}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pilot-notes" className="block text-xs font-semibold text-navy">
                      {bn ? "মন্তব্য বা ওয়ার্ড পরিধি (ঐচ্ছিক)" : "Notes or ward scope (optional)"}
                    </label>
                    <textarea
                      id="pilot-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={
                        bn
                          ? "লক্ষ্য ওয়ার্ড, পছন্দের ভাষা বা বর্তমান CSV ফরম্যাট…"
                          : "Target wards, preferred language, or existing surveillance CSV format…"
                      }
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

          <footer className={clsx("flex flex-wrap items-center justify-between gap-3 border-t border-mist/80 bg-paper/75 px-6 py-4 sm:px-8", bn && "font-bangla")}>
            <p className="text-xs font-medium text-slate">
              {bn ? (
                <>
                  ধাপসমূহ: <span className="text-navy">লোকাল ডেমো</span> ·{" "}
                  <span className="text-navy">CSV ম্যাপিং</span> ·{" "}
                  <span className="text-navy">অফলাইন হস্তান্তর</span>
                </>
              ) : (
                <>
                  Onboarding: <span className="text-navy">Local demo</span> ·{" "}
                  <span className="text-navy">CSV mapping</span> ·{" "}
                  <span className="text-navy">Offline handoff</span>
                </>
              )}
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
