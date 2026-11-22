"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, MessageSquareText, Plus } from "@/components/icons";
import { clsx } from "clsx";
import { useLandingLang } from "../lang-context";

type FaqTopic = "all" | "model" | "ops" | "trust";

const FAQ = [
  {
    topic: "model",
    qEn: "Is this real outbreak data?",
    qBn: "এটি কি বাস্তব ডেঙ্গু প্রাদুর্ভাবের ডেটা?",
    aEn: "It is the organisers' dataset: 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur and Narayanganj, weekly from January 2016 to December 2025. It looks simulated, so treat the accuracy figures as a demonstration, not a real-world claim.",
    aBn: "এটি হ্যাকাথন আয়োজকদের প্রদত্ত ডেটাসেট: ঢাকা উত্তর, ঢাকা দক্ষিণ, চট্টগ্রাম, গাজীপুর ও নারায়ণগঞ্জের ৬০টি ওয়ার্ডের জানুয়ারি ২০১৬ থেকে ডিসেম্বর ২০২৫ পর্যন্ত সাপ্তাহিক তথ্য। এটি সিমুলেটেড ধরনের, তাই নির্ভুলতার সংখ্যাগুলো প্রদর্শনী হিসেবে বিবেচনা করুন।",
  },
  {
    topic: "model",
    qEn: "How far ahead does it see?",
    qBn: "কতদিন আগে পূর্বাভাস দেওয়া যায়?",
    aEn: "One to four weeks for every ward. The rain signal is strongest three weeks out: cases correlate 0.47 with rain three weeks earlier once the season is removed, against 0.03 for the same week.",
    aBn: "প্রতিটি ওয়ার্ডের জন্য ১ থেকে ৪ সপ্তাহ আগে। বৃষ্টির সংকেত ৩ সপ্তাহ আগে সবচেয়ে শক্তিশালী: মৌসুমি প্রভাব বাদ দিলে ৩ সপ্তাহ আগের বৃষ্টির সাথে রোগীর সহসম্পর্ক ০.৪৭, যেখানে একই সপ্তাহের ক্ষেত্রে মাত্র ০.০৩।",
  },
  {
    topic: "model",
    qEn: "How accurate is it?",
    qBn: "পূর্বাভাস কতটা নির্ভুল?",
    aEn: "On 2024 and 2025, years locked away before training and scored once, the three-week forecast misses by about one case per ward-week on average, 20% less than each ward's seasonal average. Every forecast carries an 80% range so officers see the uncertainty.",
    aBn: "প্রশিক্ষণের আগেই আলাদা করে রাখা ২০২৪–২০২৫ সালের ডেটায় তিন সপ্তাহের পূর্বাভাসের গড় ত্রুটি প্রতি ওয়ার্ড-সপ্তাহে মাত্র ১ জন রোগী, যা মৌসুমি গড়ের চেয়ে ২০% কম। প্রতিটি পূর্বাভাসে ৮০% অনিশ্চয়তা পরিসর দেওয়া থাকে।",
  },
  {
    topic: "ops",
    qEn: "What does it cost a health office to run?",
    qBn: "একটি স্বাস্থ্য দপ্তরের এটি চালাতে কত খরচ হয়?",
    aEn: "Nothing beyond a laptop. The model is a 954 KiB file that answers in under a millisecond per ward on the CPU. Live weather is one Open-Meteo request for all five cities every six hours. The optional AI advisory has a hard cap of one dollar a day; without a key a free template writes the same advice.",
    aBn: "অফিসের একটি ল্যাপটপ ছাড়া কোনো খরচ নেই। মডেলটি মাত্র ৯৫৪ কি.বা. যা CPU-তে এক মিলিসেকেন্ডের কম সময়ে ফলাফল দেয়। লাইভ আবহাওয়ার জন্য ৬ ঘণ্টায় একবার Open-Meteo কল হয়। এআই পরামর্শ ঐচ্ছিক (সর্বোচ্চ $১/দিন), আর কী ছাড়া ফ্রি টেমপ্লেটেই কাজ চলে।",
  },
  {
    topic: "ops",
    qEn: "Does it need the internet?",
    qBn: "এটি চালাতে কি সবসময় ইন্টারনেট লাগে?",
    aEn: "No. The dashboard runs offline from the dataset. Live weather, the advisory text, the map tiles and sign-in are optional extras.",
    aBn: "না। পুরো ড্যাশবোর্ড ডেটাসেট থেকে সম্পূর্ণ অফলাইনে চলে। লাইভ আবহাওয়া, এআই পরামর্শ, মানচিত্র টাইলস ও লগইন ঐচ্ছিক।",
  },
  {
    topic: "ops",
    qEn: "How long does setup take for a city health office?",
    qBn: "একটি সিটি স্বাস্থ্য অফিসে সেটআপ করতে কত সময় লাগে?",
    aEn: "Under three minutes on a standard Windows, macOS, or Linux laptop. One command installs dependencies, seeds the local SQLite database, verifies the committed model artifact, and launches both the API and dashboard — zero API keys required.",
    aBn: "সাধারণ Windows, macOS বা Linux ল্যাপটপে তিন মিনিটেরও কম। একটি কমান্ডেই সব ডিপেন্ডেন্সি, লোকাল ডেটাবেস, মডেল যাচাই ও ড্যাশবোর্ড চালু হয় — কোনো এপিআই কী লাগে না।",
  },
  {
    topic: "trust",
    qEn: "How is health and citizen data protected?",
    qBn: "স্বাস্থ্য ও নাগরিক তথ্য কীভাবে সুরক্ষিত থাকে?",
    aEn: "Abhas stores ward-level aggregate case counts and weather variables only — zero patient names, IDs, phone numbers, or clinical records ever enter the system. It can run completely air-gapped on office hardware, and passes 30/30 automated API & AI security tests.",
    aBn: "আভাসে শুধু ওয়ার্ডভিত্তিক মোট রোগীর সংখ্যা ও আবহাওয়া সংরক্ষিত থাকে — কোনো রোগীর নাম, আইডি, ফোন নম্বর বা ক্লিনিকাল তথ্য নেওয়া হয় না। এটি সম্পূর্ণ অফলাইনে চলে এবং ৩০/৩০ নিরাপত্তা পরীক্ষায় পাস করেছে।",
  },
  {
    topic: "trust",
    qEn: "How do pilot onboarding and support work?",
    qBn: "পাইলট চালু ও প্রশিক্ষণ সহায়তা কীভাবে কাজ করে?",
    aEn: "City corporations and public health teams can request a zero-fee pilot directly from this page or via WhatsApp. We help map your weekly ward surveillance spreadsheet to Abhas's schema and train zonal health officers in Bangla and English.",
    aBn: "সিটি কর্পোরেশন ও জনস্বাস্থ্য দল এই পেজ বা হোয়াটসঅ্যাপের মাধ্যমে বিনা খরচে পাইলটের অনুরোধ করতে পারেন। আমরা সাপ্তাহিক স্প্রেডশিট ম্যাপিং এবং বাংলা-ইংরেজিতে কর্মকর্তাদের প্রশিক্ষণে সহায়তা করি।",
  },
  {
    topic: "model",
    qEn: "Why are ward positions on the map approximate?",
    qBn: "মানচিত্রে ওয়ার্ডগুলোর অবস্থান আনুমানিক কেন?",
    aEn: "The dataset has ward numbers but no boundaries, so each ward is placed near its city corporation's real centre. Abhas never draws ward outlines it does not have.",
    aBn: "ডেটাসেটে ওয়ার্ড নম্বর আছে কিন্তু ভৌগোলিক সীমানা (GIS পলিগন) নেই, তাই প্রতিটি ওয়ার্ডকে সংশ্লিষ্ট সিটি কর্পোরেশনের প্রকৃত কেন্দ্রের কাছে বসানো হয়েছে।",
  },
] as const;

export function Faq() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const [topic, setTopic] = useState<FaqTopic>("all");

  const visible = topic === "all" ? FAQ : FAQ.filter((item) => item.topic === topic);

  const topics: ReadonlyArray<{ id: FaqTopic; label: string }> = [
    { id: "all", label: bn ? "সব প্রশ্ন (৯)" : "All (9)" },
    { id: "model", label: bn ? "মডেল ও ডেটা" : "Model & Data" },
    { id: "ops", label: bn ? "সেটআপ ও খরচ" : "Setup & Cost" },
    { id: "trust", label: bn ? "নিরাপত্তা ও পাইলট" : "Privacy & Pilots" },
  ];

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      lang={lang}
      className="scroll-mt-20 border-t border-mist bg-paper/75 px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <h2
            id="faq-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,3.8vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn ? "কর্মকর্তারা প্রথমে যে প্রশ্নগুলো করেন।" : "Questions officers ask first."}
          </h2>
          <p className={clsx("mt-4 max-w-sm text-base leading-7 text-slate", bn && "font-bangla")}>
            {bn ? "সংক্ষিপ্ত উত্তর, প্রমাণিত পরিসংখ্যানসহ।" : "Short answers, with the measured numbers behind them."}
          </p>

          <div
            role="group"
            aria-label={bn ? "বিষয় অনুযায়ী প্রশ্ন ফিল্টার" : "Filter questions by topic"}
            className="mt-7 flex flex-wrap gap-1.5"
          >
            {topics.map((item) => {
              const active = topic === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(item.id)}
                  className={clsx(
                    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                    bn && "font-bangla",
                    active
                      ? "bg-navy text-white shadow-xs"
                      : "bg-white text-slate ring-1 ring-mist hover:text-navy hover:ring-navy/25",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className={clsx("mt-8 rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.04),0_12px_28px_-16px_rgba(11,26,92,0.12)] ring-1 ring-mist/90", bn && "font-bangla")}>
            <p className="text-sm font-bold text-navy">
              {bn ? "সম্পূর্ণ মডেল কার্ড বা এপিআই ডকুমেন্টেশন দরকার?" : "Need the full model card or API spec?"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate">
              {bn
                ? "আমাদের কারিগরি ডকুমেন্টেশনে প্রতিটি যাচাই মেট্রিক, OpenAPI রুট ও নিরাপত্তা নিয়ন্ত্রণ দেখুন।"
                : "Inspect every validation metric, OpenAPI route, and security control in our technical docs."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                href="/docs"
                className="group inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-navy ring-1 ring-mist transition-colors hover:bg-royal hover:text-white hover:ring-royal"
              >
                <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                {bn ? "ডকস পড়ুন" : "Read docs"}
                <ArrowRight
                  aria-hidden="true"
                  className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-royal ring-1 ring-mist transition-colors hover:border-royal hover:text-navy"
              >
                <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
                {bn ? "টিমকে জিজ্ঞেস করুন" : "Ask the team"}
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {visible.map((item) => {
            const idx = FAQ.indexOf(item) + 1;
            const num = String(idx).padStart(2, "0");
            return (
              <details
                key={item.qEn}
                className="group overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/90 transition-all duration-200 hover:ring-royal/30 open:ring-royal/35 open:shadow-[0_14px_34px_-18px_rgba(47,91,255,0.18)] [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-royal">
                  <span className="flex items-center gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-bold text-slate ring-1 ring-mist transition-colors group-open:bg-navy group-open:text-white group-open:ring-navy tnum">
                      {num}
                    </span>
                    <span className={clsx("text-[15px] font-bold leading-snug text-navy transition-colors group-hover:text-royal group-open:text-royal sm:text-base", bn && "font-bangla")}>
                      {bn ? item.qBn : item.qEn}
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-royal ring-1 ring-mist transition-all duration-200 group-open:bg-royal group-open:text-white group-open:ring-royal">
                    <Plus
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 group-open:rotate-45"
                    />
                  </span>
                </summary>
                <div className="border-t border-mist/70 mx-4 pt-3.5 pb-4 sm:mx-5 sm:pt-4 sm:pb-5">
                  <p className={clsx("max-w-[64ch] text-sm leading-7 text-slate sm:pl-10", bn && "font-bangla")}>
                    {bn ? item.aBn : item.aEn}
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
