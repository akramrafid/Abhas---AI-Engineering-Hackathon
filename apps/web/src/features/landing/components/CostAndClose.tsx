"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CloudRain, Lock, MapPin, Sparkles, Timer } from "@/components/icons";
import { clsx } from "clsx";
import { RibbonCanvas } from "@/components/brand/RibbonCanvas";
import { trackEvent } from "@/lib/analytics";
import { useLandingLang } from "../lang-context";

const COSTS = [
  {
    icon: CloudRain,
    termEn: "Weather",
    termBn: "আবহাওয়া",
    tagEn: "Cached 6h · CC BY 4.0",
    tagBn: "৬ ঘণ্টা ক্যাশ · CC BY 4.0",
    valueEn: "4 calls a day",
    valueBn: "দিনে ৪টি কল",
    noteEn: "Five city centroids batched into one Open-Meteo request, cached for 6 hours.",
    noteBn: "পাঁচ শহরের কেন্দ্রবিন্দু একটি Open-Meteo অনুরোধে আনা হয় এবং ৬ ঘণ্টা ক্যাশ থাকে।",
  },
  {
    icon: Timer,
    termEn: "Forecast",
    termBn: "পূর্বাভাস",
    tagEn: "CPU-only · 954 KiB",
    tagBn: "শুধু CPU · ৯৫৪ কি.বা.",
    valueEn: "0.59 ms per ward",
    valueBn: "প্রতি ওয়ার্ডে ০.৫৯ মি.সে.",
    noteEn: "A 954 KiB LightGBM model loaded once on the CPU. No GPU or cloud server needed.",
    noteBn: "৯৫৪ কি.বা. LightGBM মডেল একবারেই CPU-তে লোড হয়। কোনো GPU বা ক্লাউড সার্ভার লাগে না।",
  },
  {
    icon: Sparkles,
    termEn: "Advice text",
    termBn: "পরামর্শ বার্তা",
    tagEn: "Hard cap · Free fallback",
    tagBn: "বাজেট সীমা · ফ্রি ফলব্যাক",
    valueEn: "$1 a day, at most",
    valueBn: "সর্বোচ্চ $১ প্রতিদিন",
    noteEn: "Optional bilingual AI advisory with a strict daily cap; a free offline template works without a key.",
    noteBn: "ঐচ্ছিক এআই পরামর্শ কঠোর দৈনিক সীমাবদ্ধ; এপিআই কী ছাড়া বিনামূল্যের অফলাইন টেমপ্লেট কাজ করে।",
  },
] as const;

const HARDWARE_SPECS = [
  { value: "954 KiB", labelEn: "Model size", labelBn: "মডেলের আকার" },
  { value: "CPU", labelEn: "No GPU needed", labelBn: "GPU লাগে না" },
  { valueEn: "Offline", valueBn: "অফলাইন", labelEn: "Zero keys req.", labelBn: "কোনো কী ছাড়াই" },
] as const;

export function CostSection() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  return (
    <section
      aria-labelledby="cost-heading"
      lang={lang}
      className="relative overflow-hidden border-t border-mist bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(50%_50%_at_80%_0%,rgba(47,91,255,0.045),transparent_72%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div>
          <h2
            id="cost-heading"
            className={clsx(
              "text-balance text-[clamp(1.85rem,3.4vw,2.75rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn ? "স্বাস্থ্য দপ্তরের সাধারণ ল্যাপটপেই চলে।" : "Runs on a health office laptop."}
          </h2>
          <p className={clsx("mt-4 max-w-md text-base leading-7 text-slate", bn && "font-bangla")}>
            {bn
              ? "কোনো সার্ভার ভাড়া বা প্রতি-পূর্বাভাস ফি নেই। লাইভ আবহাওয়া ও এআই পরামর্শ ঐচ্ছিক; মূল পূর্বাভাস ডেটাসেট থেকেই অফলাইনে চলে।"
              : "No servers to rent and no per-forecast fees. The weather source and the language model are optional; the forecast works offline from the dataset."}
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-2.5 rounded-2xl bg-paper/85 p-3 ring-1 ring-mist/90">
            {HARDWARE_SPECS.map((spec) => (
              <div key={spec.labelEn} className="rounded-xl bg-white px-3 py-3 text-center ring-1 ring-mist/75">
                <dt className={clsx("text-base font-extrabold tracking-tight text-navy tnum", bn && "font-bangla")}>
                  {"valueBn" in spec ? (bn ? spec.valueBn : spec.valueEn) : spec.value}
                </dt>
                <dd className={clsx("mt-0.5 text-[11px] font-medium text-slate", bn && "font-bangla")}>
                  {bn ? spec.labelBn : spec.labelEn}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <dl className="space-y-2.5 rounded-[22px] bg-paper/70 p-2.5 ring-1 ring-mist/90">
          {COSTS.map((cost) => {
            const Icon = cost.icon;
            return (
              <div
                key={cost.termEn}
                className="group rounded-[16px] bg-white p-5 shadow-[0_1px_2px_rgba(11,26,92,0.03)] ring-1 ring-mist/85 transition-all duration-200 hover:ring-royal/30 hover:shadow-[0_10px_24px_-14px_rgba(47,91,255,0.16)]"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/[0.08] text-royal ring-1 ring-royal/15 transition-colors duration-200 group-hover:bg-royal group-hover:text-white group-hover:ring-royal">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className={clsx("text-xs font-bold uppercase tracking-[0.08em] text-slate", bn && "font-bangla tracking-normal")}>
                        {bn ? cost.termBn : cost.termEn}
                      </dt>
                      <span className={clsx("rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-mist tnum", bn && "font-bangla")}>
                        {bn ? cost.tagBn : cost.tagEn}
                      </span>
                    </div>
                    <dd>
                      <p className={clsx("mt-1.5 text-xl font-extrabold tracking-tight text-navy tnum", bn && "font-bangla")}>
                        {bn ? cost.valueBn : cost.valueEn}
                      </p>
                      <p className={clsx("mt-1 text-sm leading-6 text-slate", bn && "font-bangla")}>
                        {bn ? cost.noteBn : cost.noteEn}
                      </p>
                    </dd>
                  </div>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

const QUICK_WARDS = [
  { id: "DSCC_Ward_04", cityEn: "Dhaka South", cityBn: "ঢাকা দক্ষিণ", wardEn: "Ward 04", wardBn: "ওয়ার্ড ০৪" },
  { id: "DNCC_Ward_01", cityEn: "Dhaka North", cityBn: "ঢাকা উত্তর", wardEn: "Ward 01", wardBn: "ওয়ার্ড ০১" },
  { id: "CCC_Ward_01", cityEn: "Chattogram", cityBn: "চট্টগ্রাম", wardEn: "Ward 01", wardBn: "ওয়ার্ড ০১" },
] as const;

export function ClosingCta() {
  const { lang } = useLandingLang();
  const bn = lang === "bn";

  return (
    <section
      aria-labelledby="close-heading"
      lang={lang}
      className="relative isolate overflow-hidden border-t border-white/10 bg-[radial-gradient(80%_95%_at_12%_15%,#153199_0%,#0B1A5C_48%,#060E30_100%)] px-4 py-28 text-white sm:px-8 lg:px-14 lg:py-36"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,transparent_8%,black_60%)]">
        <RibbonCanvas className="h-full w-full" from={0.95} to={0.15} period={22} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-royal/25 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-14">
        <div>
          <h2
            id="close-heading"
            className={clsx(
              "max-w-2xl text-balance text-[clamp(2.35rem,5vw,4.15rem)] font-extrabold leading-[1.01] tracking-[-0.035em] text-white",
              bn && "font-bangla leading-tight tracking-normal",
            )}
          >
            {bn
              ? "একটি ওয়ার্ড বাছাই করুন। দেখুন আগামী চার সপ্তাহের ঝুঁকি।"
              : "Pick a ward. See its next four weeks."}
          </h2>
          <p className={clsx("mt-5 max-w-lg text-lg leading-8 text-mist/90", bn && "font-bangla")}>
            {bn
              ? "এক ক্লিকেই লাইভ অপারেশনস কনসোল খুলুন — কোনো এপিআই কী লাগবে না, অফলাইনে চলে, বাংলা ও ইংরেজিতে প্রস্তুত।"
              : "Open the live operations console in one click — zero keys required, works offline, ready in Bangla and English."}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3.5">
            <Link
              href={`/dashboard?demo=1&lang=${lang}`}
              data-testid="closing-cta"
              onClick={() => trackEvent({ event: "cta_open_dashboard", location: "closing_cta", lang })}
              className={clsx(
                "group inline-flex min-h-13 items-center gap-2 rounded-full bg-lime px-7 text-base font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_16px_36px_-12px_rgba(212,245,60,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_20px_42px_-10px_rgba(212,245,60,0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                bn && "font-bangla",
              )}
            >
              {bn ? "ড্যাশবোর্ড খুলুন" : "Open the dashboard"}
              <ArrowRight
                aria-hidden="true"
                className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/contact"
              className={clsx(
                "inline-flex min-h-13 items-center gap-2 rounded-full bg-white/[0.08] px-6 text-sm font-semibold text-white ring-1 ring-white/18 backdrop-blur-md transition-all hover:bg-white/[0.15] hover:ring-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                bn && "font-bangla",
              )}
            >
              {bn ? "সিটি পাইলটের অনুরোধ করুন" : "Request a municipal pilot"}
            </Link>
          </div>

          <ul className={clsx("mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs font-medium text-mist/85", bn && "font-bangla")}>
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-lime" />
              {bn ? "৬০টি ওয়ার্ড · ৫টি শহর" : "60 wards · 5 cities"}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Lock aria-hidden="true" className="h-4 w-4 text-lime" />
              {bn ? "কোনো রোগীর ব্যক্তিগত তথ্য নয়" : "Zero patient PII"}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Timer aria-hidden="true" className="h-4 w-4 text-lime" />
              {bn ? "০.৫৯ মি.সে. CPU পূর্বাভাস" : "0.59 ms CPU inference"}
            </li>
          </ul>
        </div>

        {/* Liquid-glass direct ward launcher */}
        <div className="rounded-[22px] bg-white/[0.07] p-5 shadow-[0_28px_64px_-22px_rgba(0,0,0,0.55)] ring-1 ring-white/15 backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/12 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/12 text-white ring-1 ring-white/15">
                <MapPin aria-hidden="true" className="h-4 w-4" />
              </span>
              <p className={clsx("text-sm font-bold text-white", bn && "font-bangla")}>
                {bn ? "সরাসরি একটি ওয়ার্ডে যান" : "Jump directly to a ward"}
              </p>
            </div>
            <span className={clsx("rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-mist ring-1 ring-white/15", bn && "font-bangla")}>
              {bn ? "লাইভ কনসোল" : "Live console"}
            </span>
          </div>

          <ul className="mt-3 space-y-2">
            {QUICK_WARDS.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard?demo=1&ward=${item.id}&lang=${lang}`}
                  onClick={() =>
                    trackEvent({ event: "cta_open_dashboard", location: "closing_cta_quick_ward", label: item.id, lang })
                  }
                  className="group flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 transition-all hover:bg-white/[0.13] hover:ring-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <div>
                    <p className={clsx("text-sm font-bold text-white", bn && "font-bangla")}>
                      {bn ? `${item.cityBn} · ${item.wardBn}` : `${item.cityEn} · ${item.wardEn}`}
                    </p>
                    <p className={clsx("mt-0.5 text-xs text-mist/80", bn && "font-bangla")}>
                      {bn ? "+১ থেকে +৪ সপ্তাহের গ্রাফ ও ৮০% পরিসর" : "+1w to +4w curve + 80% range"}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-all group-hover:bg-lime group-hover:text-ink">
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-white/12 pt-3.5 text-right">
            <Link
              href={`/dashboard?demo=1&tab=map&lang=${lang}`}
              className={clsx("group inline-flex items-center gap-1.5 text-xs font-semibold text-mist transition-colors hover:text-white", bn && "font-bangla")}
            >
              {bn ? "মানচিত্রে সব ৬০টি ওয়ার্ড দেখুন" : "Browse all 60 wards on the interactive map"}
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    titleEn: "Product",
    titleBn: "পণ্য",
    links: [
      { labelEn: "Operations Dashboard", labelBn: "অপারেশনস ড্যাশবোর্ড", href: "/dashboard?demo=1" },
      { labelEn: "Risk Map (60 wards)", labelBn: "ঝুঁকি মানচিত্র (৬০ ওয়ার্ড)", href: "/dashboard?demo=1&tab=map" },
      { labelEn: "Hold-out Validation", labelBn: "হোল্ড-আউট যাচাই", href: "/dashboard?demo=1&tab=validation" },
      { labelEn: "Brand & Tier Scale", labelBn: "ব্র্যান্ড ও ঝুঁকির স্তর", href: "/brand" },
      { labelEn: "Changelog", labelBn: "পরিবর্তন তালিকা", href: "/docs#changelog" },
    ],
  },
  {
    titleEn: "Resources",
    titleBn: "রিসোর্স",
    links: [
      { labelEn: "Documentation", labelBn: "ডকুমেন্টেশন", href: "/docs" },
      { labelEn: "Security & Trust", labelBn: "নিরাপত্তা ও আস্থা", href: "/security" },
      { labelEn: "System Status", labelBn: "সিস্টেম স্ট্যাটাস", href: "/status" },
      { labelEn: "About & Team", labelBn: "আমাদের সম্পর্কে", href: "/about" },
    ],
  },
  {
    titleEn: "Connect & Legal",
    titleBn: "যোগাযোগ ও আইনি",
    links: [
      { labelEn: "Request a Pilot", labelBn: "পাইলটের অনুরোধ", href: "/contact" },
      { labelEn: "Privacy Policy", labelBn: "গোপনীয়তা নীতি", href: "/privacy" },
      { labelEn: "Terms of Service", labelBn: "ব্যবহারের শর্তাবলি", href: "/terms" },
      {
        labelEn: "GitHub Source",
        labelBn: "গিটহাব সোর্স কোড",
        href: "https://github.com/akramrafid/Abhas---AI-Engineering-Hackathon",
        external: true,
      },
    ],
  },
] as const;

export function LandingFooter() {
  const { lang, setLang } = useLandingLang();
  const bn = lang === "bn";

  return (
    <footer lang={lang} className="relative overflow-hidden border-t border-white/10 bg-ink text-mist">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pt-16 pb-10 sm:px-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="text-lg font-extrabold tracking-tight text-white">
            {bn ? (
              <span className="font-bangla">আভাস</span>
            ) : (
              "ABHAS"
            )}
          </p>
          <p className={clsx("mt-3 max-w-sm text-sm leading-6 text-mist", bn && "font-bangla")}>
            {bn
              ? "বাংলাদেশের সিটি কর্পোরেশনগুলোর জন্য ওয়ার্ডভিত্তিক ডেঙ্গু আগাম সতর্কতা। আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি।"
              : "Ward-level dengue early warning for Bangladesh city corporations. Rain today. Risk in three weeks."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/status"
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/30",
                bn && "font-bangla",
              )}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
              {bn ? "সিস্টেম স্ট্যাটাস" : "System status"}
            </Link>

            <div
              role="group"
              aria-label="Footer language switch"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] p-0.5"
            >
              {(["en", "bn"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  lang={code}
                  onClick={() => setLang(code)}
                  className={clsx(
                    "cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    code === "bn" && "font-bangla",
                    lang === code ? "bg-royal text-white" : "text-mist hover:text-white",
                  )}
                >
                  {code === "en" ? "English" : "বাংলা"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.titleEn}>
              <p className={clsx("text-xs font-bold uppercase tracking-[0.12em] text-white/75", bn && "font-bangla tracking-normal")}>
                {bn ? col.titleBn : col.titleEn}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((item) => (
                  <li key={item.labelEn}>
                    {"external" in item && item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clsx("text-sm text-mist transition-colors hover:text-white", bn && "font-bangla")}
                      >
                        {bn ? item.labelBn : item.labelEn}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className={clsx("text-sm text-mist transition-colors hover:text-white", bn && "font-bangla")}
                      >
                        {bn ? item.labelBn : item.labelEn}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className={clsx("mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-white/10 px-4 py-6 text-xs text-mist/80 sm:flex-row sm:items-center sm:justify-between sm:px-8", bn && "font-bangla")}>
        <p>
          {bn
            ? "© ২০২৬ আভাস। আয়োজকদের ওয়ার্ড ডেটাসেট ২০১৬–২০২৫ · আবহাওয়া Open-Meteo (CC BY 4.0) · মানচিত্র © OSM © CARTO।"
            : "© 2026 Abhas. Organisers' ward dataset 2016–2025 · Weather by Open-Meteo (CC BY 4.0) · Maps © OSM © CARTO."}
        </p>
        <p className="shrink-0">
          {bn ? "কোনো ট্র্যাকিং কুকি নয় · কোনো রোগীর ব্যক্তিগত তথ্য নয়" : "Zero tracking cookies · Zero patient PII"}
        </p>
      </div>

      <p
        aria-hidden="true"
        className={clsx(
          "pointer-events-none -mb-[0.18em] select-none text-center text-[clamp(80px,22vw,300px)] font-extrabold leading-[0.88] tracking-[-0.04em] text-transparent [background-clip:text] [-webkit-background-clip:text] [background-image:linear-gradient(to_bottom,rgba(255,255,255,0.16),transparent_82%)]",
          bn && "font-bangla tracking-normal",
        )}
      >
        {bn ? "আভাস" : "ABHAS"}
      </p>
    </footer>
  );
}
