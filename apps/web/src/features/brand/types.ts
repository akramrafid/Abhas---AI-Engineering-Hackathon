export interface BrandTokenColorEntry {
  value: string;
  role?: string;
  on?: string;
  label?: { en: string; bn: string };
  meter?: number;
  action?: string;
}

export interface BrandTokensSpec {
  name: string;
  nameBangla: string;
  version: string;
  color: {
    brand: Record<"ink" | "navy" | "royal" | "lime" | "white", BrandTokenColorEntry>;
    neutral: Record<"slate" | "mist" | "paper" | "white", BrandTokenColorEntry>;
    risk: {
      low: BrandTokenColorEntry;
      medium: BrandTokenColorEntry;
      high: BrandTokenColorEntry;
      critical: BrandTokenColorEntry;
      lowCellBorder: { value: string };
      forecastBand: { value: string; role?: string };
    };
    gradient: {
      signal: string;
      role: string;
    };
  };
  font: Record<
    "sans" | "mono" | "bangla",
    { family: string; fallback: string; weights: number[]; npm: string }
  >;
  type: Record<
    "display" | "h1" | "h2" | "body" | "caption" | "data",
    { font: string; weight: number; size: number; line: number; features?: string }
  >;
  radius: Record<"sm" | "md" | "lg" | "pill", number>;
  space: number[];
  logo: {
    grid: number;
    construction: string;
    versions: Record<"primary" | "reverse" | "mono", string>;
    clearSpace: string;
    minSize: {
      lockupPx: number;
      lockupMm: number;
      symbolPx: number;
      symbolMm: number;
      faviconPx: number;
    };
    wordmark: string;
    lockup: string;
    banglaLockup: string;
    cityEdition: string;
  };
  graphics: {
    ribbons: string[];
    rule: string;
  };
}
