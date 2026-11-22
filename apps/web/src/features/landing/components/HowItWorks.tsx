"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import { EASE_OUT, FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { AnimatedBeam } from "@/components/ui/AnimatedBeam";
import { useLandingLang } from "../lang-context";

interface NodeProps {
  nodeRef: RefObject<HTMLDivElement | null>;
  title: string;
  detail: string;
  measure: ReactNode;
  emphasis?: boolean;
  bn?: boolean;
}

function FlowNode({ nodeRef, title, detail, measure, emphasis = false, bn = false }: NodeProps) {
  return (
    <div
      ref={nodeRef}
      data-flow-node
      className={clsx(
        "relative z-10 rounded-[14px] p-4 ring-1",
        emphasis ? "bg-royal text-white ring-royal" : "bg-ink text-white ring-white/10",
      )}
    >
      <p className="text-lg font-bold leading-none tnum">{measure}</p>
      <p className={clsx("mt-3 text-sm font-bold", bn && "font-bangla")}>{title}</p>
      <p className={clsx("mt-0.5 text-xs leading-5", emphasis ? "text-white" : "text-mist", bn && "font-bangla")}>
        {detail}
      </p>
    </div>
  );
}

export function HowItWorks() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";
  const scope = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const dataset = useRef<HTMLDivElement>(null);
  const meteo = useRef<HTMLDivElement>(null);
  const lags = useRef<HTMLDivElement>(null);
  const model = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLDivElement>(null);
  const sms = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.fromTo(
          "[data-flow-node]",
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.75,
            ease: EASE_OUT,
            stagger: 0.08,
            clearProps: "transform,opacity",
            scrollTrigger: { trigger: container.current, start: "top 82%", once: true },
          },
        );
      });
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      id="how"
      aria-labelledby="how-heading"
      lang={lang}
      className="bg-navy px-4 py-24 text-white sm:px-8 lg:py-32 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <h2
            id="how-heading"
            className={clsx(
              "text-balance text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em]",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "এই সপ্তাহের বৃষ্টি থেকে আগামী মাসের ওয়ার্ড তালিকা।"
              : "From this week's rain to next month's ward list."}
          </h2>
          <p className={clsx("max-w-lg text-lg leading-8 text-mist lg:justify-self-end", bn && "font-bangla")}>
            {bn
              ? "বৃষ্টিপাতের তথ্য থেকে অগ্রাধিকারভিত্তিক মাঠ-তালিকা পর্যন্ত তিনটি সহজ ধাপ — কোনো ক্লাউড সার্ভার ছাড়াই অফিসের ল্যাপটপে তিন মিনিটে চালু হয়।"
              : "Three quiet steps from raw rainfall to a ranked municipal dispatch sheet — zero cloud servers, runs in under three minutes on an office laptop."}
          </p>
        </div>

        {/* Three-step operational sequence: Connect -> Analyse -> Act */}
        <ol className={clsx("mt-12 grid gap-4 border-y border-white/10 py-8 md:grid-cols-3 md:gap-8", bn && "font-bangla")}>
          <li>
            <p className="text-base font-bold text-white">
              {bn ? "১. সাপ্তাহিক ওয়ার্ড ও আবহাওয়া ডেটা যুক্ত করুন" : "1. Connect weekly ward & weather data"}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-mist">
              {bn
                ? "ডিফল্টভাবে ৬০টি ওয়ার্ডের অফলাইন ডেটাসেটে চলে, অথবা এক কলেই Open-Meteo থেকে পাঁচ শহরের আবহাওয়া আনে।"
                : "Runs offline from the seeded 60-ward dataset by default, or pulls five city centroids from Open-Meteo in one call."}
            </p>
          </li>
          <li>
            <p className="text-base font-bold text-white">
              {bn ? "২. তিন সপ্তাহের প্রজনন চক্র বিশ্লেষণ করুন" : "2. Analyse the three-week breeding clock"}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-mist">
              {bn
                ? "LightGBM প্রতিটি ওয়ার্ডের ১–৪ সপ্তাহের ঝুঁকি, ৮০% অনিশ্চয়তা সীমা এবং সঠিক SHAP কারণ হিসাব করে।"
                : "LightGBM scores every ward 1–4 weeks ahead with conformalized 80% uncertainty bands and exact SHAP drivers."}
            </p>
          </li>
          <li>
            <p className="text-base font-bold text-white">
              {bn ? "৩. হাসপাতালে চাপ বাড়ার আগেই ব্যবস্থা নিন" : "3. Act before cases reach clinics"}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-mist">
              {bn
                ? "মাঠ কর্মকর্তাদের হাতে দিন র‍্যাংককৃত অগ্রাধিকার তালিকা, ১৬০ অক্ষরের এসএমএস এবং প্রিন্টযোগ্য বাংলা/ইংরেজি এ৪ নোটিশ।"
                : "Hand field supervisors one ranked priority list, a 160-character SMS alert, and a printable EN/বাংলা A4 brief."}
            </p>
          </li>
        </ol>

        <div ref={container} className="relative mt-16 grid gap-6 lg:grid-cols-4 lg:items-center lg:gap-x-16">
          <div className="space-y-4">
            <FlowNode
              nodeRef={dataset}
              bn={bn}
              measure="31,320"
              title={bn ? "ওয়ার্ড ইতিহাস" : "Ward history"}
              detail={
                bn
                  ? "৬০টি ওয়ার্ড · ৫২২ সপ্তাহের বৃষ্টি, তাপমাত্রা, আর্দ্রতা, রোগী, জলাবদ্ধতা, জনঘনত্ব ও স্যানিটেশন।"
                  : "60 wards · 522 weeks of rain, heat, humidity, cases, drainage, crowding, sanitation."
              }
            />
            <FlowNode
              nodeRef={meteo}
              bn={bn}
              measure={bn ? "৪ কল/দিন" : "4 calls/day"}
              title={bn ? "আবহাওয়া ফিড" : "Weather feed"}
              detail={
                bn
                  ? "ডিফল্ট ডেটাসেট; লাইভ সপ্তাহে এক কলেই Open-Meteo থেকে পাঁচ শহরের আবহাওয়া।"
                  : "Dataset by default; Open-Meteo for live weeks, all five cities in one call."
              }
            />
          </div>
          <FlowNode
            nodeRef={lags}
            bn={bn}
            measure={bn ? "r 0.47 (৩ সপ্তা.)" : "r 0.47 at 3 wk"}
            title={bn ? "প্রজনন সময়চক্র" : "Breeding clock"}
            detail={
              bn
                ? "ওয়ার্ডভিত্তিক ১ থেকে ৬ সপ্তাহের বৃষ্টির ল্যাগ, ভবিষ্যতের কোনো তথ্য ছাড়াই।"
                : "Rain lagged 1 to 6 weeks, grouped by ward_id, nothing after the forecast week."
            }
          />
          <FlowNode
            nodeRef={model}
            emphasis
            bn={bn}
            measure="MAE 1.01"
            title={bn ? "পূর্বাভাস মডেল" : "Forecast model"}
            detail={
              bn
                ? "LightGBM Poisson, প্রতিটি সময়সীমার আলাদা মডেল, ৮০% পরিসর ও ঝুঁকির স্তর।"
                : "LightGBM, Poisson, one model per horizon, 80% ranges, cost-based tiers."
            }
          />
          <div className="space-y-4">
            <FlowNode
              nodeRef={dashboard}
              bn={bn}
              measure={bn ? "৬০ ওয়ার্ড" : "60 wards"}
              title={bn ? "ড্যাশবোর্ড" : "Dashboard"}
              detail={
                bn
                  ? "প্রতিটি ওয়ার্ডের স্তর, পরিসর ও কারণ; মানচিত্র, অগ্রাধিকার তালিকা ও বৃষ্টি সিমুলেটর।"
                  : "Tier, range and drivers for each ward; map, priority list, what-if rain."
              }
            />
            <FlowNode
              nodeRef={sms}
              bn={bn}
              measure={bn ? "≤ ১৬০ অক্ষর" : "≤ 160 chars"}
              title={bn ? "এসএমএস সতর্কতা" : "SMS alert"}
              detail={
                bn
                  ? "প্রথমে ওয়ার্ড ও সময়সীমা, তারপর একটি স্পষ্ট করণীয়।"
                  : "Ward and window first, then one action."
              }
            />
            <FlowNode
              nodeRef={notice}
              bn={bn}
              measure="A4 · EN + বাংলা"
              title={bn ? "মাঠ নোটিশ" : "Field notice"}
              detail={
                bn
                  ? "বাংলা ও ইংরেজিতে প্রিন্টযোগ্য এ৪ ওয়ার্ড ব্রিফ।"
                  : "Printable A4 ward brief in Bangla and English."
              }
            />
          </div>

          <div className="hidden lg:contents">
            <AnimatedBeam containerRef={container} fromRef={dataset} toRef={lags} curvature={-20} />
            <AnimatedBeam containerRef={container} fromRef={meteo} toRef={lags} curvature={30} delay={0.4} />
            <AnimatedBeam containerRef={container} fromRef={lags} toRef={model} curvature={0} delay={0.8} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={dashboard} curvature={40} delay={1.2} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={sms} curvature={0} delay={1.4} />
            <AnimatedBeam containerRef={container} fromRef={model} toRef={notice} curvature={-40} delay={1.6} />
          </div>
        </div>
      </div>
    </section>
  );
}
