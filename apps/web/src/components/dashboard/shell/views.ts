import {
  CloudRain,
  Grid3x3,
  Info,
  LineChart,
  ListOrdered,
  Map as MapIcon,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { DashboardTab, Lang } from "@/lib/i18n";

export interface ViewMeta {
  icon: LucideIcon;
  description: Record<Lang, string>;
  /** Views that show the stat tiles (forecast-centred views). */
  showStats: boolean;
}

export const VIEW_META: Record<DashboardTab, ViewMeta> = {
  "ward-risk": {
    icon: LineChart,
    showStats: true,
    description: {
      en: "One ward's next four weeks: tier, expected cases with their range, and what drives them.",
      bn: "একটি ওয়ার্ডের আগামী চার সপ্তাহ: ঝুঁকির স্তর, সম্ভাব্য রোগী ও তার কারণ।",
    },
  },
  map: {
    icon: MapIcon,
    showStats: true,
    description: {
      en: "All 60 wards on the map for the selected week. Select a ward to open its forecast.",
      bn: "নির্বাচিত সপ্তাহে মানচিত্রে ৬০টি ওয়ার্ড। পূর্বাভাস দেখতে ওয়ার্ড বেছে নিন।",
    },
  },
  lags: {
    icon: Timer,
    showStats: false,
    description: {
      en: "How rain two to four weeks ago lines up with this ward's cases.",
      bn: "দুই থেকে চার সপ্তাহ আগের বৃষ্টি এই ওয়ার্ডের রোগীর সঙ্গে কীভাবে মেলে।",
    },
  },
  scenario: {
    icon: CloudRain,
    showStats: false,
    description: {
      en: "What if more rain falls? Compare the baseline forecast with your scenario.",
      bn: "বেশি বৃষ্টি হলে কী হবে? মূল পূর্বাভাসের সঙ্গে আপনার দৃশ্যপট তুলনা করুন।",
    },
  },
  heatmap: {
    icon: Grid3x3,
    showStats: true,
    description: {
      en: "Every ward in the city across the next four weeks, tier by tier.",
      bn: "আগামী চার সপ্তাহে নগরের প্রতিটি ওয়ার্ডের ঝুঁকির স্তর।",
    },
  },
  priority: {
    icon: ListOrdered,
    showStats: true,
    description: {
      en: "Where to send teams first this week, ranked by expected cases.",
      bn: "এই সপ্তাহে কোথায় আগে দল পাঠাবেন, প্রত্যাশিত রোগী অনুযায়ী সাজানো।",
    },
  },
  validation: {
    icon: ShieldCheck,
    showStats: false,
    description: {
      en: "How the model did on 2024–2025, years it never saw while training.",
      bn: "প্রশিক্ষণে না দেখা ২০২৪–২০২৫ সালে মডেল কেমন করেছে।",
    },
  },
  about: {
    icon: Info,
    showStats: false,
    description: {
      en: "Data sources, running cost, and what the model can and cannot claim.",
      bn: "তথ্যের উৎস, পরিচালন খরচ, এবং মডেলের সীমাবদ্ধতা।",
    },
  },
};
