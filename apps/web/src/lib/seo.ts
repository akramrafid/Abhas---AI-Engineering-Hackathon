import type { Metadata } from "next";

export const SITE_NAME = "Abhas (আভাস)";
export const SITE_SHORT_NAME = "Abhas";
export const SITE_TAGLINE = "Rain today. Risk in three weeks. Act now.";
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://abhas.vercel.app"
).replace(/\/+$/, "");

export const DEFAULT_DESCRIPTION =
  "Ward-level dengue early-warning console for 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur, and Narayanganj. 1–4 week forecasts with 80% uncertainty bands, SHAP drivers, and offline-first operation.";

export interface FaqSchemaItem {
  readonly topic: "model" | "ops" | "trust";
  readonly qEn: string;
  readonly qBn: string;
  readonly aEn: string;
  readonly aBn: string;
}

/** Single source of truth shared by the visible FAQ section and FAQPage JSON-LD (AEO/GEO). */
export const ABHAS_FAQ_ITEMS: readonly FaqSchemaItem[] = [
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

export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const canonicalPath = path === "/" ? "/" : path.replace(/\/+$/, "");
  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      alternateLocale: ["bn_BD"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-snippet": -1,
            "max-image-preview": "large",
            "max-video-preview": -1,
          },
        },
  };
}

/** Grounded JSON-LD @graph for SEO, GEO (AI search engines), and AEO (Answer Engines). */
export function buildHomeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Abhas",
        alternateName: ["আভাস", "Abhas Dengue Early Warning"],
        url: SITE_URL,
        logo: `${SITE_URL}/brand/logo/abhas-app-icon.svg`,
        description:
          "Open, offline-first ward-level dengue early-warning platform built for Bangladesh city corporation health offices.",
        email: "pilot@abhas.dev",
        areaServed: [
          { "@type": "City", name: "Dhaka North" },
          { "@type": "City", name: "Dhaka South" },
          { "@type": "City", name: "Chattogram" },
          { "@type": "City", name: "Gazipur" },
          { "@type": "City", name: "Narayanganj" },
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "municipal pilot desk",
          email: "pilot@abhas.dev",
          telephone: "+880-1641-414949",
          availableLanguage: ["English", "Bengali"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: "আভাস — ওয়ার্ড-ভিত্তিক ডেঙ্গু আগাম সতর্কতা",
        description: DEFAULT_DESCRIPTION,
        inLanguage: ["en", "bn"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "Abhas (আভাস) Dengue Early-Warning Console",
        applicationCategory: "HealthApplication",
        applicationSubCategory: "Public Health Epidemiology & Early Warning",
        operatingSystem: "Web, Windows, macOS, Linux",
        softwareVersion: "1.1.2",
        inLanguage: ["en", "bn"],
        url: `${SITE_URL}/dashboard`,
        description:
          "CPU-only LightGBM ward-level dengue early-warning system (954.6 KiB model, 0.59 ms/ward) producing 1–4 week forecasts, conformal 80% uncertainty intervals (P10–P90), SHAP drivers, and bilingual Bangla/English officer briefs across 60 Bangladesh wards.",
        featureList: [
          "1–4 week ward-level dengue forecasting across 60 wards in 5 Bangladesh city corporations",
          "Conformal 80% prediction intervals (P10–P90) and Low/Medium/High/Critical risk tiers",
          "Exact TreeSHAP driver attribution for rainfall lags (2–4 weeks), temperature, humidity, water logging, crowding, and sanitation",
          "What-if weather scenario simulator and city-wide ward priority ranking with formula-safe CSV export",
          "Optional live Open-Meteo (CC BY 4.0) weather feed with 6-hour SQLite cache and ERA5 bias correction",
          "Full English and Bangla (বাংলা) interface with zero patient PII and air-gap offline operation",
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Zero software license fees for municipal health offices and public-health researchers.",
        },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/#dataset`,
        name: "Abhas 60-Ward Bangladesh Weekly Dengue & Weather Benchmark (2016–2025)",
        description:
          "Hackathon organisers' weekly ward-level dengue and weather dataset spanning 60 wards across Dhaka North (20), Dhaka South (20), Chattogram (10), Gazipur (5), and Narayanganj (5) from January 2016 to December 2025 (31,320 ward-weeks). Strictly chronologically split: 2016–2022 train, 2023 calibration, 2024–2025 locked hold-out (1.01 MAE vs 1.26 seasonal baseline at +3w, 0.611 Recall@15, 0.888 MRR). Presented transparently as a simulated demonstration benchmark.",
        temporalCoverage: "2016-01-04/2025-12-29",
        spatialCoverage: {
          "@type": "Place",
          name: "Dhaka North, Dhaka South, Chattogram, Gazipur, Narayanganj, Bangladesh",
        },
        license: "https://creativecommons.org/licenses/by/4.0/",
        isAccessibleForFree: true,
        creator: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: ABHAS_FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.qEn,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.aEn,
          },
        })),
      },
    ],
  };
}
