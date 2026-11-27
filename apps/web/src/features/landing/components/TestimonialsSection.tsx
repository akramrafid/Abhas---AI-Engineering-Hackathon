"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import { ShieldCheck } from "@/components/icons";
import {
  StaggerTestimonials,
  type StaggerTestimonialItem,
} from "@/components/ui/stagger-testimonials";
import { useLandingLang } from "../lang-context";

interface OfficerVoice {
  id: string;
  initials: string;
  avatar: string;
  name: string;
  nameBn: string;
  role: string;
  roleBn: string;
  org: string;
  orgBn: string;
  cityShort: string;
  wardRef: string;
  wardRefBn: string;
  quote: string;
  quoteBn: string;
  metric: string;
  metricLabel: string;
  metricLabelBn: string;
}

const VOICES: readonly OfficerVoice[] = [
  {
    id: "dscc",
    initials: "FR",
    avatar: "/images/officers/farhana-rahman.jpg",
    name: "Dr. Farhana Rahman",
    nameBn: "ডা. ফারহানা রহমান",
    role: "Zonal Health Officer",
    roleBn: "আঞ্চলিক স্বাস্থ্য কর্মকর্তা",
    org: "Dhaka South City Corporation",
    orgBn: "ঢাকা দক্ষিণ সিটি কর্পোরেশন",
    cityShort: "DSCC",
    wardRef: "Ward 04 · Old Dhaka",
    wardRefBn: "ওয়ার্ড ০৪ · পুরান ঢাকা",
    quote:
      "Seeing heavy August rain translated into a Ward 04 surge three weeks early lets us deploy larvicide teams to clogged drains before emergency beds fill up.",
    quoteBn:
      "আগস্টের ভারী বৃষ্টির তিন সপ্তাহ আগেই ওয়ার্ড ০৪-এ ঝুঁকি দেখতে পাওয়ায় জরুরি শয্যা ভরার আগেই ড্রেনে লার্ভিসাইড দল পাঠানো সম্ভব হয়।",
    metric: "14–21 days",
    metricLabel: "Earlier larvicide & bed staging window",
    metricLabelBn: "আগেভাগে লার্ভিসাইড ও শয্যা প্রস্তুতির সময়",
  },
  {
    id: "ccc",
    initials: "TI",
    avatar: "/images/officers/tariqul-islam.jpg",
    name: "Engr. Tariqul Islam",
    nameBn: "প্রকৌ. তারিকুল ইসলাম",
    role: "Vector Control Coordinator",
    roleBn: "মশক নিধন সমন্বয়কারী",
    org: "Chattogram City Corporation",
    orgBn: "চট্টগ্রাম সিটি কর্পোরেশন",
    cityShort: "CCC",
    wardRef: "Ward 03 · Coastal Zone",
    wardRefBn: "ওয়ার্ড ০৩ · উপকূলীয় অঞ্চল",
    quote:
      "Every monsoon hits Chattogram differently depending on drainage bottlenecks. The SHAP driver breakdown shows council leadership exactly why a ward turned Critical.",
    quoteBn:
      "জলাবদ্ধতার কারণে চট্টগ্রামের প্রতিটি ওয়ার্ডে বর্ষার প্রভাব আলাদা। কোন ওয়ার্ড কেন সংকটপূর্ণ হয়েছে তা SHAP ব্যাখ্যায় স্পষ্ট বোঝা যায়।",
    metric: "~20% lower",
    metricLabel: "3-week MAE vs seasonal baseline (1.01 vs 1.26)",
    metricLabelBn: "মৌসুমি গড়ের চেয়ে কম ৩-সপ্তাহের MAE (1.01 vs 1.26)",
  },
  {
    id: "dncc",
    initials: "MR",
    avatar: "/images/officers/mahbubur-rashid.jpg",
    name: "Dr. Mahbubur Rashid",
    nameBn: "ডা. মাহবুবুর রশিদ",
    role: "Municipal Epidemiologist",
    roleBn: "পৌর এপিডেমিওলজিস্ট",
    org: "Dhaka North City Corporation",
    orgBn: "ঢাকা উত্তর সিটি কর্পোরেশন",
    cityShort: "DNCC",
    wardRef: "Ward 12 · Mirpur Belt",
    wardRefBn: "ওয়ার্ড ১২ · মিরপুর অঞ্চল",
    quote:
      "Instead of trusting a single point estimate, the 80% conformal range gives hospital planners an honest upper bound (P90) to pre-position IV saline and NS1 kits.",
    quoteBn:
      "একটি মাত্র সংখ্যার বদলে ৮০% অনিশ্চয়তা সীমা (P90) হাসপাতালগুলোকে আগে থেকেই স্যালাইন ও এনএস১ কিট মজুদ করতে সাহায্য করে।",
    metric: "84.5%",
    metricLabel: "Empirical coverage on locked 2024–25 hold-out",
    metricLabelBn: "লকড ২০২৪–২৫ হোল্ড-আউটে ৮০% সীমার কভারেজ",
  },
  {
    id: "gcc",
    initials: "NJ",
    avatar: "/images/officers/nusrat-jahan.jpg",
    name: "Nusrat Jahan Chowdhury",
    nameBn: "নুসরাত জাহান চৌধুরী",
    role: "Surveillance Data Officer",
    roleBn: "সার্ভেইল্যান্স ডেটা কর্মকর্তা",
    org: "Gazipur City Corporation",
    orgBn: "গাজীপুর সিটি কর্পোরেশন",
    cityShort: "GCC",
    wardRef: "Ward 06 · Industrial Zone",
    wardRefBn: "ওয়ার্ড ০৬ · শিল্পাঞ্চল",
    quote:
      "Running the entire 954 KiB model offline on a standard office laptop with zero paid API keys means our health office never gets blocked by server budgets or internet outages.",
    quoteBn:
      "কোনো সার্ভার ভাড়া বা পেইড এপিআই ছাড়াই অফিসের সাধারণ ল্যাপটপে অফলাইনে চলার কারণে ইন্টারনেট না থাকলেও কাজ থামে না।",
    metric: "0.59 ms",
    metricLabel: "Per-ward CPU inference · $0 software fee",
    metricLabelBn: "প্রতি ওয়ার্ডে CPU পূর্বাভাস · $0 সফটওয়্যার ফি",
  },
  {
    id: "ncc",
    initials: "KH",
    avatar: "/images/officers/kamrul-hasan.jpg",
    name: "Dr. Kamrul Hasan",
    nameBn: "ডা. কামরুল হাসান",
    role: "Chief Sanitary Inspector",
    roleBn: "প্রধান স্যানিটারি ইন্সপেক্টর",
    org: "Narayanganj City Corporation",
    orgBn: "নারায়ণগঞ্জ সিটি কর্পোরেশন",
    cityShort: "NCC",
    wardRef: "Ward 02 · Riverfront",
    wardRefBn: "ওয়ার্ড ০২ · নদীতীরবর্তী এলাকা",
    quote:
      "Our field supervisors don't carry tablets into narrow lanes. One-click printable Bangla A4 notices and 160-character SMS alerts match how Bangladeshi ward teams actually operate.",
    quoteBn:
      "মাঠকর্মীরা সরু গলিতে ট্যাব নিয়ে ঘোরেন না। এক ক্লিকে বাংলা এ৪ নোটিশ প্রিন্ট ও ১৬০ অক্ষরের এসএমএস আমাদের কাজের ধরনে পুরোপুরি মানানসই।",
    metric: "≤ 160 chars",
    metricLabel: "Single-part GSM-7 SMS + printable A4 brief",
    metricLabelBn: "একক এসএমএস বার্তা + প্রিন্টযোগ্য এ৪ নোটিশ",
  },
  {
    id: "dghs",
    initials: "RA",
    avatar: "/images/officers/rafiqul-alam.jpg",
    name: "Rafiqul Alam Bhuiyan",
    nameBn: "রফিকুল আলম ভূঁইয়া",
    role: "Public Health MIS Analyst",
    roleBn: "জনস্বাস্থ্য এমআইএস বিশ্লেষক",
    org: "Dhaka Metro Surveillance Desk",
    orgBn: "ঢাকা মেট্রো সার্ভেইল্যান্স ডেস্ক",
    cityShort: "MIS",
    wardRef: "60 Wards · 5 Cities",
    wardRefBn: "৬০ ওয়ার্ড · ৫ শহর",
    quote:
      "Zero patient names or clinical records ever enter the system — only ward-level counts and rainfall. That privacy boundary makes municipal data sharing dramatically safer.",
    quoteBn:
      "কোনো রোগীর নাম বা ব্যক্তিগত তথ্য সিস্টেমে ঢোকে না—শুধু ওয়ার্ডভিত্তিক সংখ্যা ও বৃষ্টিপাত। এতে সরকারি ডেটা নিরাপত্তা নিশ্চিত থাকে।",
    metric: "0 PII",
    metricLabel: "Aggregate ward-only schema · 30/30 red-team pass",
    metricLabelBn: "শুধুমাত্র ওয়ার্ডভিত্তিক সমষ্টিগত ডেটা · ৩০/৩০ নিরাপত্তা পাস",
  },
] as const;

export function TestimonialsSection() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  const staggerItems: StaggerTestimonialItem[] = useMemo(
    () =>
      VOICES.map((voice) => ({
        id: voice.id,
        testimonial: bn ? voice.quoteBn : voice.quote,
        by: bn ? voice.nameBn : voice.name,
        role: bn ? voice.roleBn : voice.role,
        org: bn ? voice.orgBn : voice.org,
        cityShort: voice.cityShort,
        wardRef: bn ? voice.wardRefBn : voice.wardRef,
        metric: voice.metric,
        metricLabel: bn ? voice.metricLabelBn : voice.metricLabel,
        imgSrc: voice.avatar,
      })),
    [bn],
  );

  return (
    <section
      id="voices"
      aria-labelledby="voices-heading"
      lang={lang}
      className="relative scroll-mt-20 overflow-hidden border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(47,91,255,0.055),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Editorial Header */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2
            id="voices-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,3.9vw,3.15rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "বাংলাদেশের মাঠপর্যায়ের স্বাস্থ্য কর্মকর্তাদের বাস্তব কাজের ধারায় নির্মিত।"
              : "Designed for frontline health teams across Bangladesh."}
          </h2>
          <div className="max-w-lg lg:justify-self-end">
            <p className={clsx("text-base leading-7 text-slate", bn && "font-bangla")}>
              {bn
                ? "ঢাকা উত্তর, ঢাকা দক্ষিণ, চট্টগ্রাম, গাজীপুর ও নারায়ণগঞ্জের ওয়ার্ড পর্যায়ে আভাস কীভাবে কাজ করে তার বাস্তবসম্মত ক্ষেত্রচিত্র।"
                : "How zonal health officers, vector-control coordinators, and MIS analysts across five Bangladesh city corporations put a 3-week rainfall forecast to work."}
            </p>
            <p
              className={clsx(
                "mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[11px] font-semibold text-navy ring-1 ring-mist",
                bn && "font-bangla",
              )}
            >
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-royal" />
              {bn
                ? "দৃষ্টান্তমূলক মাঠপর্যায়ের দৃশ্যপট · আভাসের যাচাইকৃত ফলাফল"
                : "Illustrative municipal field scenarios · measured Abhas outputs"}
            </p>
          </div>
        </div>

        {/* Staggered Chamfered Testimonials Deck */}
        <div className="mt-12">
          <StaggerTestimonials items={staggerItems} lang={lang} />
        </div>

        <p className={clsx("mt-5 text-center text-xs text-slate", bn && "font-bangla")}>
          {bn
            ? "আভাসের ২০২৪–২০২৫ যাচাইকৃত সক্ষমতার ভিত্তিতে তৈরি দৃষ্টান্তমূলক দৃশ্যপট। অংশীদার সিটি কর্পোরেশন যুক্ত হওয়ার পর বাস্তব পাইলট মতামত প্রকাশ করা হবে।"
            : "Illustrative Bangladeshi municipal scenarios modeled on Abhas's verified 2024–2025 forecast capabilities. Real partner city testimonials will be published as pilots onboard."}
        </p>
      </div>
    </section>
  );
}
