import type { Driver, RiskTier, WeatherSourceUsed } from "@/lib/api/client";

export type Lang = "en" | "bn";

export type DashboardTab =
  | "ward-risk"
  | "lags"
  | "scenario"
  | "heatmap"
  | "priority"
  | "validation"
  | "about";

export const VALID_TABS: readonly DashboardTab[] = [
  "ward-risk",
  "lags",
  "scenario",
  "heatmap",
  "priority",
  "validation",
  "about",
] as const;

export function isDashboardTab(value: string | null): value is DashboardTab {
  return value !== null && (VALID_TABS as readonly string[]).includes(value);
}

export function isLang(value: string | null): value is Lang {
  return value === "en" || value === "bn";
}

export const TIER_ACTIONS_BN: Record<RiskTier, string> = {
  Low: "নিয়মিত নজরদারি চালিয়ে যান।",
  Medium: "এই সপ্তাহে মশার প্রজননস্থল পরিদর্শন করুন।",
  High: "হটস্পটে লার্ভিসাইড প্রয়োগ করুন ও ক্লিনিকগুলোকে সতর্ক করুন।",
  Critical: "এখনই দল মোতায়েন করুন; শয্যা ও স্যালাইন প্রস্তুত রাখুন।",
};

export const DRIVER_LABELS_BN: Record<Driver["key"], string> = {
  rain_2_4w: "২–৪ সপ্তাহ আগের বৃষ্টি",
  recent_rain: "সাম্প্রতিক বৃষ্টি",
  heat: "তাপমাত্রা",
  humidity: "আর্দ্রতা",
  water_logging: "জলাবদ্ধতা",
  crowding: "জনঘনত্ব",
  sanitation: "স্যানিটেশন",
  season: "মৌসুমি প্রবণতা",
};

export function formatDriverLabel(driver: Driver, lang: Lang): string {
  if (lang === "bn") {
    return DRIVER_LABELS_BN[driver.key] ?? driver.label;
  }
  return driver.label;
}

export interface UiCopy {
  appHeading: string;
  productPromise: string;
  demoBadge: string;
  brandLink: string;
  tabs: Record<DashboardTab, string>;
  controls: {
    city: string;
    ward: string;
    wardFilterPlaceholder: string;
    originWeek: string;
    forecastWindow: string;
    window1w: string;
    window2to4w: string;
    window1to4w: string;
  };
  weatherSource: Record<WeatherSourceUsed, string>;
  wardRisk: {
    cityWardsSuffix: string;
    totalLabel: string;
    peakRiskScore: string;
    peakRiskHint: string;
    peakExpectedCases: string;
    bandLabel: string;
    casesUnit: string;
    actByLabel: string;
    actByHint: string;
    actImmediately: string;
    peakTargetWeek: string;
    printBrief: string;
    trajectoryTitle: string;
    trajectoryDesc: string;
    perHorizonTitle: string;
    perHorizonDesc: string;
    driversTitle: string;
    driversDescPrefix: string;
    driversWaterfallCaption: string;
    otherDriversLabel: string;
    advisoryTitle: string;
    advisoryDesc: string;
    advisoryLoading: string;
    advisoryTemplateBadge: string;
    advisoryLlmBadge: string;
    advisoryValidated: string;
    advisoryLoadBtn: string;
  };
  priority: {
    title: string;
    description: string;
    exportCsv: string;
    printBrief: string;
    allTiers: string;
    rankCol: string;
    wardCol: string;
    tierCol: string;
    expectedCol: string;
    scoreCol: string;
    actByCol: string;
    actionsCol: string;
    briefCol: string;
    printOneWard: string;
    emptyTitle: string;
    emptyDesc: string;
  };
  about: {
    title: string;
    subtitle: string;
    opsTitle: string;
    opsDesc: string;
    modelCardTitle: string;
    modelCardDesc: string;
    attributionTitle: string;
    attributionDesc: string;
  };
  common: {
    retry: string;
    wardNotFound: string;
    resetDefaultWard: string;
  };
}

export const UI_COPY: Record<Lang, UiCopy> = {
  en: {
    appHeading: "Ward-level dengue early warning",
    productPromise: "Rain today. Risk in three weeks. Act now.",
    demoBadge: "Demo mode · offline",
    brandLink: "Brand System",
    tabs: {
      "ward-risk": "Ward Forecast",
      lags: "Lags",
      scenario: "Scenario",
      heatmap: "City Heatmap",
      priority: "Priority List",
      validation: "Validation",
      about: "About & Cost",
    },
    controls: {
      city: "City",
      ward: "Ward",
      wardFilterPlaceholder: "Filter wards…",
      originWeek: "Origin week (ISO)",
      forecastWindow: "Forecast window",
      window1w: "Next wk",
      window2to4w: "2–4w",
      window1to4w: "1–4w",
    },
    weatherSource: {
      dataset: "Dataset mode (offline)",
      live: "Live · Open-Meteo (city centroid)",
      cache: "Cached weather",
      climatology: "Climatology fallback",
    },
    wardRisk: {
      cityWardsSuffix: "wards",
      totalLabel: "total",
      peakRiskScore: "Peak risk score",
      peakRiskHint: "Probability of reaching High cut-off",
      peakExpectedCases: "Peak expected cases",
      bandLabel: "80% band",
      casesUnit: "cases",
      actByLabel: "Act by",
      actByHint: "Larviciding window (14 days before peak week)",
      actImmediately: "Act immediately (peak within 2 weeks)",
      peakTargetWeek: "Peak target week",
      printBrief: "Print ward brief",
      trajectoryTitle: "Weekly forecast trajectory & 80% band",
      trajectoryDesc:
        "Expected weekly cases (Royal line) with conformal 80% uncertainty range (P10–P90).",
      perHorizonTitle: "Per-horizon outlook",
      perHorizonDesc: "Select any horizon row to inspect its top four drivers.",
      driversTitle: "Top drivers (horizontal waterfall)",
      driversDescPrefix: "Primary weather and ward vulnerability signals for",
      driversWaterfallCaption:
        "Signed multiplicative SHAP effects around baseline (top 4 + other)",
      otherDriversLabel: "Other factors",
      advisoryTitle: "Officer brief",
      advisoryDesc: "Grounded action summary generated from the ward forecast.",
      advisoryLoading: "Loading officer brief…",
      advisoryTemplateBadge: "Deterministic template",
      advisoryLlmBadge: "Claude LLM",
      advisoryValidated: "Numbers verified",
      advisoryLoadBtn: "Refresh brief",
    },
    priority: {
      title: "City ward priority list",
      description:
        "All wards ranked by window risk tier and expected cases, with act-by deadlines and deterministic field actions derived from SHAP drivers.",
      exportCsv: "Export CSV",
      printBrief: "Print ward brief",
      allTiers: "All",
      rankCol: "#",
      wardCol: "Ward",
      tierCol: "Peak tier",
      expectedCol: "Expected (80% band)",
      scoreCol: "Score",
      actByCol: "Act by",
      actionsCol: "Suggested field actions",
      briefCol: "Brief",
      printOneWard: "Print brief",
      emptyTitle: "No wards ranked for this selection",
      emptyDesc: "Select a city and valid Monday origin week above to rank ward priorities.",
    },
    about: {
      title: "Operations telemetry, cost & model card",
      subtitle:
        "Live serving efficiency from /api/v1/ops, honest dataset limitations, and open-data attribution.",
      opsTitle: "Live serving & cost telemetry (/api/v1/ops)",
      opsDesc:
        "Single joblib artifact loaded once at startup, cached forecasts, and bounded optional LLM budget.",
      modelCardTitle: "Honest model card & scope limitations",
      modelCardDesc:
        "Intended use, calibration design, and explicit warnings before real operational deployment.",
      attributionTitle: "Data, fonts & third-party attribution",
      attributionDesc: "Zero paid APIs or external map tiles required for offline operation.",
    },
    common: {
      retry: "Retry",
      wardNotFound: "Ward not found",
      resetDefaultWard: "Select Dhaka South default ward",
    },
  },
  bn: {
    appHeading: "ওয়ার্ড-ভিত্তিক ডেঙ্গু আগাম সতর্কতা",
    productPromise: "আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।",
    demoBadge: "ডেমো মোড · অফলাইন",
    brandLink: "ব্র্যান্ড সিস্টেম",
    tabs: {
      "ward-risk": "ওয়ার্ড পূর্বাভাস",
      lags: "বৃষ্টি-ব্যবধান",
      scenario: "দৃশ্যপট",
      heatmap: "নগর হিটম্যাপ",
      priority: "অগ্রাধিকার তালিকা",
      validation: "যাচাইকরণ",
      about: "তথ্য ও খরচ",
    },
    controls: {
      city: "নগর",
      ward: "ওয়ার্ড",
      wardFilterPlaceholder: "ওয়ার্ড খুঁজুন…",
      originWeek: "সূচনা সপ্তাহ (ISO)",
      forecastWindow: "পূর্বাভাস সময়কাল",
      window1w: "আগামী ১স",
      window2to4w: "২–৪স",
      window1to4w: "১–৪স",
    },
    weatherSource: {
      dataset: "ডেটাসেট মোড (অফলাইন)",
      live: "লাইভ · Open-Meteo (নগর কেন্দ্র)",
      cache: "ক্যাশড আবহাওয়া",
      climatology: "জলবায়ু গড় ফলব্যাক",
    },
    wardRisk: {
      cityWardsSuffix: "ওয়ার্ডসমূহ",
      totalLabel: "মোট",
      peakRiskScore: "সর্বোচ্চ ঝুঁকি স্কোর",
      peakRiskHint: "উচ্চ স্তরে পৌঁছানোর সম্ভাবনা",
      peakExpectedCases: "সর্বোচ্চ সম্ভাব্য রোগী",
      bandLabel: "৮০% পরিসর",
      casesUnit: "জন",
      actByLabel: "ব্যবস্থা নেওয়ার শেষ তারিখ",
      actByHint: "লার্ভিসাইড প্রয়োগের সময়সীমা (শীর্ষ সপ্তাহের ১৪ দিন আগে)",
      actImmediately: "অবিলম্বে ব্যবস্থা নিন (২ সপ্তাহের মধ্যে শীর্ষ ঝুঁকি)",
      peakTargetWeek: "শীর্ষ লক্ষ্য সপ্তাহ",
      printBrief: "ওয়ার্ড ব্রিফ প্রিন্ট",
      trajectoryTitle: "সাপ্তাহিক পূর্বাভাস ও ৮০% পরিসর",
      trajectoryDesc:
        "সম্ভাব্য সাপ্তাহিক রোগীর সংখ্যা (রয়্যাল রেখা) এবং ৮০% অনিশ্চয়তার পরিসর (P10–P90)।",
      perHorizonTitle: "সপ্তাহভিত্তিক পূর্বাভাস",
      perHorizonDesc: "শীর্ষ চারটি প্রভাবক দেখতে যেকোনো সপ্তাহে ক্লিক করুন।",
      driversTitle: "প্রধান প্রভাবকসমূহ (ওয়াটারফল)",
      driversDescPrefix: "প্রধান আবহাওয়া ও ওয়ার্ড ঝুঁকি সংকেত —",
      driversWaterfallCaption: "বেসলাইনের তুলনায় গুণিতক SHAP প্রভাব (শীর্ষ ৪ + অন্যান্য)",
      otherDriversLabel: "অন্যান্য প্রভাবক",
      advisoryTitle: "কর্মকর্তার সংক্ষিপ্ত নির্দেশনা",
      advisoryDesc: "পূর্বাভাসের সংখ্যার ওপর ভিত্তি করে তৈরি কর্মপরিকল্পনা।",
      advisoryLoading: "নির্দেশনা লোড হচ্ছে…",
      advisoryTemplateBadge: "নির্ধারিত টেমপ্লেট",
      advisoryLlmBadge: "Claude LLM",
      advisoryValidated: "সংখ্যা যাচাইকৃত",
      advisoryLoadBtn: "হালনাগাদ করুন",
    },
    priority: {
      title: "নগর ওয়ার্ড অগ্রাধিকার তালিকা",
      description:
        "ঝুঁকির স্তর ও সম্ভাব্য রোগীর সংখ্যানুসারে সকল ওয়ার্ডের ক্রম, ব্যবস্থা নেওয়ার সময়সীমা ও প্রস্তাবিত মাঠপর্যায়ের পদক্ষেপ।",
      exportCsv: "CSV ডাউনলোড",
      printBrief: "ওয়ার্ড ব্রিফ প্রিন্ট",
      allTiers: "সকল",
      rankCol: "ক্রম",
      wardCol: "ওয়ার্ড",
      tierCol: "সর্বোচ্চ স্তর",
      expectedCol: "সম্ভাব্য রোগী (৮০% পরিসর)",
      scoreCol: "স্কোর",
      actByCol: "শেষ তারিখ",
      actionsCol: "প্রস্তাবিত পদক্ষেপ",
      briefCol: "ব্রিফ",
      printOneWard: "প্রিন্ট",
      emptyTitle: "এই নির্বাচনের জন্য কোনো ওয়ার্ড নেই",
      emptyDesc: "অগ্রাধিকার তালিকা দেখতে উপরে নগর ও সূচনা সপ্তাহ নির্বাচন করুন।",
    },
    about: {
      title: "পরিচালনা টেলিমেট্রি, খরচ ও মডেল কার্ড",
      subtitle:
        "/api/v1/ops থেকে লাইভ দক্ষতা, ডেটাসেটের সীমাবদ্ধতা এবং উন্মুক্ত তথ্যের স্বীকৃতি।",
      opsTitle: "লাইভ সার্ভার ও খরচ টেলিমেট্রি (/api/v1/ops)",
      opsDesc: "স্টার্টআপে একবার মডেল লোড, পূর্বাভাস ক্যাশ এবং সীমিত ঐচ্ছিক LLM বাজেট।",
      modelCardTitle: "মডেল কার্ড ও সীমাবদ্ধতা",
      modelCardDesc: "ব্যবহারের উদ্দেশ্য এবং বাস্তব সিদ্ধান্তের আগে স্থানীয় পুনঃক্যালিব্রেশনের সতর্কতা।",
      attributionTitle: "তথ্যসূত্র, ফন্ট ও স্বীকৃতি",
      attributionDesc: "অফলাইন ব্যবহারে কোনো পেইড এপিআই বা বাহ্যিক ম্যাপ প্রয়োজন নেই।",
    },
    common: {
      retry: "আবার চেষ্টা করুন",
      wardNotFound: "ওয়ার্ড পাওয়া যায়নি",
      resetDefaultWard: "ঢাকা দক্ষিণ ডিফল্ট ওয়ার্ড নির্বাচন করুন",
    },
  },
};
