"use client";

import { ArrowRight, CheckCircle2, Clock3 } from "@/components/icons";
import { clsx } from "clsx";
import { useLandingLang } from "../lang-context";

const PAIN_POINTS = {
  en: [
    "Hospital wards fill up before field crews know which drainage blocks drove the spike.",
    "City-wide monsoon warnings treat all 60 wards alike, spreading larviciding teams too thin.",
    "Spreadsheets and PDFs lack uncertainty ranges, leaving officers guessing how many beds and saline bags to stage.",
  ],
  bn: [
    "কোন এলাকার জমা পানি থেকে প্রাদুর্ভাব শুরু হলো তা জানার আগেই হাসপাতালে রোগী ভরে যায়।",
    "পুরো শহরের সাধারণ বর্ষা সতর্কতায় ৬০টি ওয়ার্ড আলাদা করা যায় না, ফলে মশা নিধন দল সঠিকভাবে বণ্টন হয় না।",
    "স্প্রেডশিট বা পিডিএফে অনিশ্চয়তার পরিসর থাকে না, তাই কতগুলো শয্যা ও স্যালাইন প্রস্তুত রাখতে হবে তা অনুমান করতে হয়।",
  ],
} as const;

const SOLUTIONS = {
  en: [
    "Per-ward 1–4 week forecasts convert this week's rain into ranked risk tiers before mosquitoes mature.",
    "SHAP driver breakdowns explain why a specific ward rose: lagged rain, humidity, water logging, or sanitation.",
    "Conformalized 80% prediction bands and bilingual A4 notices turn model output into one clear action per ward.",
  ],
  bn: [
    "ওয়ার্ডভিত্তিক ১–৪ সপ্তাহের পূর্বাভাস এ সপ্তাহের বৃষ্টি থেকেই মশা পূর্ণাঙ্গ হওয়ার আগে ঝুঁকির স্তর দেখায়।",
    "SHAP বিশ্লেষণ পরিষ্কারভাবে দেখায় নির্দিষ্ট ওয়ার্ডের ঝুঁকি কেন বাড়ল — বৃষ্টির ল্যাগ, আর্দ্রতা, জলাবদ্ধতা নাকি স্যানিটেশন।",
    "৮০% অনিশ্চয়তা পরিসর ও বাংলা-ইংরেজি প্রিন্টযোগ্য নোটিশ প্রতিটি ওয়ার্ডের জন্য একটি স্পষ্ট করণীয় তৈরি করে।",
  ],
} as const;

export function ProblemSolution() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="scroll-mt-20 border-y border-mist bg-paper px-4 py-20 text-ink sm:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <h2
            id="problem-heading"
            lang={lang}
            className={clsx(
              "text-balance text-[clamp(1.85rem,3.6vw,3rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight",
            )}
          >
            {bn
              ? "হাসপাতালে রোগী বাড়ার পর ব্যবস্থা নিলে তিন সপ্তাহ দেরি হয়ে যায়।"
              : "Acting when hospital wards fill up is three weeks too late."}
          </h2>
          <p
            lang={lang}
            className={clsx("mt-4 max-w-2xl text-base leading-7 text-slate sm:text-lg", bn && "font-bangla")}
          >
            {bn
              ? "বর্ষায় ডেঙ্গু প্রতিরোধের সবচেয়ে বড় বাধা তথ্যের অভাব নয় — সময়ের ব্যবধান। আভাস বৃষ্টির তিন সপ্তাহ আগেই প্রতিটি ওয়ার্ডের ঝুঁকি আলাদা করে দেয়।"
              : "Health offices do not lack effort during monsoon — they lack lead time. Abhas closes the three-week gap between rainfall and clinic surge, ward by ward."}
          </p>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-[16px] border border-mist bg-white lg:grid-cols-2">
          {/* Today's reactive reality */}
          <div className="border-b border-mist p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate">
              <Clock3 aria-hidden="true" className="h-4 w-4 text-slate" />
              <span lang={lang} className={bn ? "font-bangla" : undefined}>
                {bn ? "বর্তমান প্রতিক্রিয়াশীল পদ্ধতি" : "Today: reactive after cases rise"}
              </span>
            </div>
            <ul className="mt-6 space-y-4">
              {PAIN_POINTS[lang].map((point) => (
                <li
                  key={point}
                  lang={lang}
                  className={clsx("flex gap-3 text-[15px] leading-6 text-slate", bn && "font-bangla")}
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate/50"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* With Abhas */}
          <div className="bg-navy/[0.025] p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-sm font-bold text-navy">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-royal" />
              <span lang={lang} className={bn ? "font-bangla" : undefined}>
                {bn ? "আভাস: তিন সপ্তাহ আগে ওয়ার্ডভিত্তিক পদক্ষেপ" : "With Abhas: preemptive, ward by ward"}
              </span>
            </div>
            <ul className="mt-6 space-y-4">
              {SOLUTIONS[lang].map((item) => (
                <li
                  key={item}
                  lang={lang}
                  className={clsx("flex gap-3 text-[15px] leading-6 text-ink", bn && "font-bangla")}
                >
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-royal"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
