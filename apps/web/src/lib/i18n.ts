import type { Driver, RiskTier, WeatherSourceUsed } from "@/lib/api/client";

export type Lang = "en" | "bn";

export type DashboardTab =
  | "ward-risk"
  | "command"
  | "map"
  | "lags"
  | "scenario"
  | "heatmap"
  | "priority"
  | "validation"
  | "about";

export const VALID_TABS: readonly DashboardTab[] = [
  "ward-risk",
  "command",
  "map",
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
  command: {
    steps: {
      forecast: string;
      allocate: string;
      route: string;
      simulate: string;
      dispatch: string;
    };
    stepSubtitles: {
      forecast: string;
      allocate: string;
      route: string;
      simulate: string;
      dispatch: string;
    };
    navAria: string;
    tablistAria: string;
    stepCounter: (step: number, scope: string, origin: string) => string;
    scopeLabel: string;
    scopeAll: string;
    originLabel: string;
    windowStartLabel: string;
    windowEndLabel: string;
    savePlanLabel: string;
    savePlanPlaceholder: string;
    savePlanButton: string;
    savingPlan: string;
    comparePlansButton: string;
    offlineBadge: string;
    onlineBadge: string;
    previousStep: string;
    nextStep: string;
    provenance: {
      regionAria: string;
      modelLabel: string;
      shaLabel: string;
      dataAsOfLabel: string;
      solveLabel: string;
      updating: string;
      savedPlanPrefix: string;
      saveErrorPrefix: string;
      saveFailedFallback: string;
    };
    compare: {
      title: string;
      subtitle: string;
      refreshAria: string;
      closeAria: string;
      kindFilterAria: string;
      kinds: {
        all: string;
        allocation: string;
        overflow: string;
        simulation: string;
        dispatch: string;
      };
      loadErrorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      planALabel: string;
      planBLabel: string;
      compareErrorTitle: string;
      comparingLabel: string;
      planAPrefix: string;
      planBPrefix: string;
      originLabel: string;
      scopeLabel: string;
      stockLabel: string;
      tableAria: string;
      colMetric: string;
      colPlanA: string;
      colPlanB: string;
      colDelta: string;
      metrics: Record<string, string>;
    };
    step1: {
      title: string;
      description: string;
      horizonOptions: Record<number, string>;
      errorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      kpiWards: string;
      kpiWindowNote: (hStart: number, hEnd: number) => string;
      kpiCritical: string;
      kpiCriticalNote: string;
      kpiExpected: string;
      kpiExpectedNote: string;
      kpiPlanned: string;
      kpiPlannedNote: string;
      tableTitle: (visible: number, total: number) => string;
      tableDescription: string;
      proceedBtn: string;
      filterAria: string;
      filterAll: (n: number) => string;
      tableAria: string;
      colWard: string;
      colCity: string;
      colTier: string;
      colExpected: string;
      colPlanned: string;
      colPriority: string;
      colSupplies: string;
    };
    step2: {
      title: string;
      description: string;
      equityFloorBadge: (pct: number) => string;
      crewsMethodBadge: (method: string) => string;
      stockSliderLabel: string;
      stockMinLabel: string;
      stockMaxLabel: string;
      stockAriaText: (pct: number) => string;
      stockPresetsAria: string;
      crewsSliderLabel: string;
      crewsValueLabel: (n: number) => string;
      crewsAriaText: (n: number) => string;
      crewsMinLabel: string;
      crewsMaxLabel: string;
      exactCrewsLabel: string;
      ratiosSummary: (saline: number, kits: number, beds: number, pSaline: number, pBeds: number) => string;
      activeStatus: (stock: number, crews: number, critical: number, deficit: number) => string;
      resolving: string;
      errorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      cityCrewsCount: (n: number) => string;
      cityDeficitSummary: (critical: number, deficit: number) => string;
      colResource: string;
      colReq: string;
      colAvail: string;
      colAlloc: string;
      colFloor: string;
      floorScaled: string;
      floorOk: (pct: number) => string;
      resources: {
        saline_bags: string;
        diagnostic_kits: string;
        hospital_beds: string;
      };
      wardTableTitle: string;
      wardTableDescription: string;
      wardTableAria: string;
      colWard: string;
      colRiskTier: string;
      colSaline: string;
      colKits: string;
      colBeds: string;
      colCrews: string;
      colDeficit: string;
      shortSuffix: (n: number) => string;
      weightPrefix: string;
      fulfilmentAria: (wardId: string, resource: string) => string;
    };
    step3: {
      title: string;
      description: string;
      capacityMethodBadge: string;
      shoulderWeekBtn: string;
      shoulderWeekTitle: string;
      resetOverrides: (n: number) => string;
      horizonLabel: string;
      horizonOptions: Record<number, string>;
      serviceLevelLabel: string;
      serviceLevelOptions: Record<string, string>;
      methodFormulaLabel: string;
      rerouting: string;
      errorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      reqCapTransfers: (req: number, cap: number, transfers: number) => string;
      patientsWithoutBed: (n: number) => string;
      noUnroutable: string;
      utilBefore: string;
      bedsFilledAfter: string;
      demandVsCapacity: string;
      headroomAfter: (beds: number) => string;
      flowsTitle: (n: number) => string;
      flowsDescription: string;
      sankeyAria: string;
      sankeyImgAria: (n: number) => string;
      sankeyTitle: string;
      sankeySenders: string;
      sankeyReceivers: string;
      sankeyOut: (n: number) => string;
      sankeyIn: (n: number) => string;
      selectedRoute: (from: string, to: string, patients: number, city: string) => string;
      cityNoFreeBeds: (city: string, unroutable: number) => string;
      cityWithinCapacity: (city: string) => string;
      transferTableAria: string;
      colCity: string;
      colFromWard: string;
      colToWard: string;
      colPatientsRouted: string;
      wardTableTitle: string;
      wardTableDescription: string;
      wardTableAria: string;
      colWard: string;
      colReqBeds: string;
      colCapacityEditable: string;
      colSource: string;
      colLocalDeficit: string;
      colOutIn: string;
      colNetDeficit: string;
      colUtilBeforeAfter: string;
      capacityInputAria: (wardId: string) => string;
      sourceOverride: string;
      sourceDerived: string;
    };
    step4: {
      title: string;
      description: string;
      placementModeLabel: string;
      placementModeAria: string;
      modeManual: string;
      modeAuto: string;
      efficacyPresetLabel: string;
      efficacyPresetAria: string;
      efficacyLabels: { low: string; base: string; high: string };
      treatedWardsTitle: (n: number) => string;
      treatedWardsHint: string;
      addWardLabel: string;
      addWardBtn: string;
      selectedWardFallback: string;
      decreaseCrewsAria: (wardId: string) => string;
      increaseCrewsAria: (wardId: string) => string;
      crewsForWardAria: (wardId: string) => string;
      removeWardAria: (wardId: string) => string;
      autoCrewsSliderLabel: string;
      autoCrewsValueLabel: (n: number) => string;
      autoCrewsAriaText: (n: number) => string;
      autoCrewsMinLabel: string;
      autoCrewsMaxLabel: string;
      autoCrewsInputLabel: string;
      assumptionPrefix: string;
      assumptionFallback: string;
      runningSim: string;
      errorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      kpiCrewsDeployed: string;
      kpiCrewsNote: (wards: number) => string;
      kpiCasesPrevented: string;
      kpiBandLabel: (low: string, high: string) => string;
      kpiBedsAvoided: string;
      kpiBedsNote: string;
      kpiSalineAvoided: string;
      kpiSalineNote: string;
      chartTitle: string;
      chartDescription: string;
      chartAria: string;
      legendBaseline: string;
      legendCounterfactual: string;
      barBaselineName: string;
      barCounterfactualName: string;
      horizonTick: (h: number) => string;
      roiTitle: string;
      roiDescription: string;
      roiTableAria: string;
      colRank: string;
      colWard: string;
      colCrews: string;
      colReduction: string;
      colCasesPrevented: string;
      colSensitivity: string;
      colBedsAvoided: string;
      colSalineAvoided: string;
      colRoiPerCrew: string;
    };
    step5: {
      title: string;
      description: string;
      targetWardsLabel: string;
      targetModeAria: string;
      targetSelectedWards: (n: number) => string;
      targetEntireScope: (scope: string) => string;
      channelsLabel: string;
      channelLabels: { sms: string; whatsapp: string; brief: string };
      noticeLangLabel: string;
      noticeLangAria: string;
      chooseWardsTitle: (n: number) => string;
      basisSummary: (origin: string, stock: number, crews: number, planId: string | null) => string;
      useSavedPlanLabel: string;
      renderingNotices: string;
      errorTitle: string;
      loadingLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      noticeFactsLine: (
        city: string,
        wStart: string,
        wEnd: string,
        cases: string,
        saline: string,
        kits: string,
        beds: string,
        crews: number,
      ) => string;
      openPrintableBrief: string;
      smsPreviewTitle: string;
      charsLabel: (n: number) => string;
      segmentsLabel: (n: number) => string;
      copySms: string;
      copiedSms: string;
      whatsappPreviewTitle: string;
      copyWhatsapp: string;
      copiedWhatsapp: string;
      showAllNotices: (n: number) => string;
    };
  };
}

export const UI_COPY: Record<Lang, UiCopy> = {
  en: {
    appHeading: "Ward-level dengue early warning",
    productPromise: "Rain today. Risk in three weeks. Act now.",
    demoBadge: "Demo data",
    brandLink: "Brand System",
    tabs: {
      "ward-risk": "Ward Forecast",
      command: "Command Center",
      map: "Risk Map",
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
    command: {
      steps: {
        forecast: "Forecast",
        allocate: "Allocate",
        route: "Route",
        simulate: "Simulate",
        dispatch: "Dispatch",
      },
      stepSubtitles: {
        forecast: "Demand",
        allocate: "Supplies",
        route: "Beds",
        simulate: "ROI",
        dispatch: "Notices",
      },
      navAria: "Command Center steps",
      tablistAria: "Command Center workflow steps",
      stepCounter: (step, scope, origin) => `Step ${step} / 5 · ${scope} · ${origin}`,
      scopeLabel: "Scope",
      scopeAll: "All cities (60 wards)",
      originLabel: "Origin week (ISO)",
      windowStartLabel: "From horizon",
      windowEndLabel: "To horizon",
      savePlanLabel: "Plan label",
      savePlanPlaceholder: "e.g. Dhaka South 60% stock",
      savePlanButton: "Save as plan",
      savingPlan: "Saving…",
      comparePlansButton: "Compare plans",
      offlineBadge: "Offline mode",
      onlineBadge: "Local API",
      previousStep: "Previous step",
      nextStep: "Next step",
      provenance: {
        regionAria: "Run provenance and plan actions",
        modelLabel: "Model",
        shaLabel: "SHA",
        dataAsOfLabel: "Data as of",
        solveLabel: "Solve",
        updating: "Updating…",
        savedPlanPrefix: "Saved plan:",
        saveErrorPrefix: "Could not save plan:",
        saveFailedFallback: "Failed to save plan.",
      },
      compare: {
        title: "Compare saved plans",
        subtitle: "Append-only decision log · delta = Plan B − Plan A",
        refreshAria: "Refresh saved plans",
        closeAria: "Close plan comparison",
        kindFilterAria: "Filter plans by kind",
        kinds: {
          all: "All",
          allocation: "Allocation",
          overflow: "Overflow",
          simulation: "Simulation",
          dispatch: "Dispatch",
        },
        loadErrorTitle: "Could not load saved plans",
        loadingLabel: "Loading saved operational plans…",
        emptyTitle: "No saved plans yet",
        emptyDescription:
          "Use “Save as plan” on any Command Center step to snapshot an allocation, overflow routing, simulation, or dispatch run into the append-only decision log.",
        planALabel: "Baseline plan A",
        planBLabel: "Candidate plan B",
        compareErrorTitle: "Could not compare selected plans",
        comparingLabel: "Comparing plan headlines…",
        planAPrefix: "Plan A",
        planBPrefix: "Plan B",
        originLabel: "origin",
        scopeLabel: "scope",
        stockLabel: "stock",
        tableAria: "Saved plan metric comparison table",
        colMetric: "Metric",
        colPlanA: "Plan A",
        colPlanB: "Plan B",
        colDelta: "Delta (B − A)",
        metrics: {
          stock_pct: "Available stock (%)",
          mean_fulfilment_pct: "Mean fulfilment (%)",
          critical_wards: "Critical deficit wards",
          deficit_wards: "Total deficit wards",
          crews: "Spraying crews",
          cases_prevented: "Cases prevented (h=2–4)",
          unroutable_patients: "Patients without a bed",
          notices: "Dispatch notices",
        },
      },
      step1: {
        title: "Step 1 · Forecast scope & demand window",
        description:
          "Choose city scope, Monday origin week, and planning horizons (h_start–h_end). Window quantiles size saline and kits; peak-week P90 sizes hospital beds.",
        horizonOptions: {
          1: "+1w (Next week)",
          2: "+2w (2 weeks ahead)",
          3: "+3w (3 weeks ahead)",
          4: "+4w (4 weeks ahead)",
        },
        errorTitle: "Could not load forecast demand window",
        loadingLabel: "Computing ward forecast demand across planning window…",
        emptyTitle: "No wards returned for this scope",
        emptyDescription: "Select another city or origin week to review ward forecasts.",
        kpiWards: "Wards in scope",
        kpiWindowNote: (hStart, hEnd) => `Window +${hStart}w to +${hEnd}w`,
        kpiCritical: "Critical tier wards",
        kpiCriticalNote: "Peak tier across window",
        kpiExpected: "Expected cases",
        kpiExpectedNote: "Sum of horizon means",
        kpiPlanned: "Planned cases",
        kpiPlannedNote: "Window quantile sizing basis",
        tableTitle: (visible, total) => `Ward demand forecast (${visible} of ${total})`,
        tableDescription:
          "Sorted by city and priority weight. Proceed to Step 2 to allocate limited supplies.",
        proceedBtn: "Proceed to Allocate →",
        filterAria: "Filter forecast wards by risk tier",
        filterAll: (n) => `All (${n})`,
        tableAria: "Command Center Step 1 ward forecast table",
        colWard: "Ward",
        colCity: "City",
        colTier: "Peak Risk Tier",
        colExpected: "Expected Cases",
        colPlanned: "Planned Cases",
        colPriority: "Priority Wt",
        colSupplies: "Saline / Kits / Peak Beds Req.",
      },
      step2: {
        title: "Step 2 · Constrained supply allocation & spraying crews",
        description:
          "Adjust Available Regional Stock (30–100%) and spraying crews. The HiGHS LP solver re-optimizes within each city pool live (150 ms debounce) with a guaranteed equity floor.",
        equityFloorBadge: (pct) => `Equity floor: ${pct}%`,
        crewsMethodBadge: (method) => `Crews: ${method}`,
        stockSliderLabel: "Available Regional Stock",
        stockMinLabel: "30% severe shortage",
        stockMaxLabel: "100% full stock",
        stockAriaText: (pct) => `${pct} percent available regional stock`,
        stockPresetsAria: "Stock percentage quick presets",
        crewsSliderLabel: "Total Spraying Crews",
        crewsValueLabel: (n) => `${n} crews`,
        crewsAriaText: (n) => `${n} spraying crews`,
        crewsMinLabel: "0 crews",
        crewsMaxLabel: "60 crews",
        exactCrewsLabel: "Exact crews",
        ratiosSummary: (saline, kits, beds, pSaline, pBeds) =>
          `Ratios/case: saline ${saline} · kits ${kits} · peak beds ${beds} · P${pSaline}/P${pBeds}`,
        activeStatus: (stock, crews, critical, deficit) =>
          `Active solution: stock ${stock}% · crews ${crews} · ${critical} critical deficit · ${deficit} deficit wards`,
        resolving: "Re-solving…",
        errorTitle: "Allocation optimization failed",
        loadingLabel: "Solving constrained intra-city supply allocation…",
        emptyTitle: "No wards in allocation scope",
        emptyDescription: "Select a valid scope and origin week in Step 1.",
        cityCrewsCount: (n) => `${n} crews`,
        cityDeficitSummary: (critical, deficit) => `${critical} critical · ${deficit} deficit wards`,
        colResource: "Resource",
        colReq: "Req.",
        colAvail: "Avail.",
        colAlloc: "Alloc.",
        colFloor: "Floor",
        floorScaled: "Scaled",
        floorOk: (pct) => `${pct}% OK`,
        resources: {
          saline_bags: "Saline bags",
          diagnostic_kits: "Diagnostic kits",
          hospital_beds: "Hospital beds",
        },
        wardTableTitle: "Per-ward supply allocations & deficit alerts",
        wardTableDescription:
          "Allocated / required progress bars per resource, greedy crew placement, and explicit deficit reasons.",
        wardTableAria: "Per-ward supply allocation table",
        colWard: "Ward",
        colRiskTier: "Risk Tier",
        colSaline: "Saline Bags",
        colKits: "Diagnostic Kits",
        colBeds: "Hospital Beds",
        colCrews: "Crews",
        colDeficit: "Deficit Status & Reasons",
        shortSuffix: (n) => `−${n} short`,
        weightPrefix: "wt",
        fulfilmentAria: (wardId, resource) => `${wardId} ${resource} fulfilment`,
      },
      step3: {
        title: "Step 3 · Intra-city hospital bed overflow routing",
        description:
          "Balances peak hospital bed demand strictly inside each city corporation. Edit any ward capacity below to re-route transfers live.",
        capacityMethodBadge: "Derived from history (2016–2022 P95 × 1.10)",
        shoulderWeekBtn: "Shoulder week (12 Aug)",
        shoulderWeekTitle: "Jump to 2024-08-12 (+3w) to see live intra-city transfers alongside shortage",
        resetOverrides: (n) => `Reset overrides (${n})`,
        horizonLabel: "Routing horizon",
        horizonOptions: {
          1: "+1w",
          2: "+2w",
          3: "+3w (Peak window)",
          4: "+4w",
        },
        serviceLevelLabel: "Planned bed quantile",
        serviceLevelOptions: {
          "0.8": "P80 (0.80)",
          "0.9": "P90 (0.90 · Default)",
          "0.95": "P95 (0.95 · Conservative)",
        },
        methodFormulaLabel: "Method formula",
        rerouting: "Re-routing bed transfers…",
        errorTitle: "Bed overflow routing failed",
        loadingLabel: "Solving intra-city hospital bed overflow routing…",
        emptyTitle: "No cities in routing scope",
        emptyDescription: "Choose a valid city or All cities scope to compute bed transfers.",
        reqCapTransfers: (req, cap, transfers) =>
          `${req} req / ${cap} beds · ${transfers} transfer${transfers === 1 ? "" : "s"}`,
        patientsWithoutBed: (n) => `${n} patients without a bed`,
        noUnroutable: "0 without a bed",
        utilBefore: "Utilisation before",
        bedsFilledAfter: "Beds filled after",
        demandVsCapacity: "Demand / capacity",
        headroomAfter: (beds) => `Headroom after routing: ${beds} beds`,
        flowsTitle: (n) => `Intra-city transfer flows (${n})`,
        flowsDescription:
          "Interactive flow diagram of patients routed from overflowing wards to same-city headroom wards.",
        sankeyAria: "Interactive intra-city bed overflow flow diagram",
        sankeyImgAria: (n) => `Intra-city bed overflow Sankey showing ${n} patient transfer routes`,
        sankeyTitle: "Intra-city bed overflow transfers",
        sankeySenders: "OVERFLOWING WARDS (SENDERS)",
        sankeyReceivers: "HEADROOM WARDS (RECEIVERS)",
        sankeyOut: (n) => `−${n} out`,
        sankeyIn: (n) => `+${n} in`,
        selectedRoute: (from, to, patients, city) =>
          `Selected route: ${from} → ${to} (${patients} patients · ${city})`,
        cityNoFreeBeds: (city, unroutable) =>
          `No free beds anywhere in ${city}: ${unroutable} patients cannot be placed in the city`,
        cityWithinCapacity: (city) => `All wards in ${city} are within bed capacity`,
        transferTableAria: "Intra-city patient transfer table",
        colCity: "City",
        colFromWard: "From Ward (Overflow)",
        colToWard: "To Ward (Headroom)",
        colPatientsRouted: "Patients Routed",
        wardTableTitle: "Ward bed capacity, overrides & net deficits",
        wardTableDescription:
          "Override any ward capacity (1–500 beds) to test surge wards or real local hospital counts.",
        wardTableAria: "Per-ward hospital bed status and capacity overrides table",
        colWard: "Ward",
        colReqBeds: "Req. Beds",
        colCapacityEditable: "Capacity (Editable)",
        colSource: "Source",
        colLocalDeficit: "Local Deficit",
        colOutIn: "Out / In",
        colNetDeficit: "Net Deficit",
        colUtilBeforeAfter: "Util. Before → After",
        capacityInputAria: (wardId) => `Bed capacity for ${wardId}`,
        sourceOverride: "override",
        sourceDerived: "derived",
      },
      step4: {
        title: "Step 4 · Vector-control counterfactual simulator & ROI ranking",
        description:
          "Compare manual ward crew deployments against greedy auto-placement. Counterfactual cases are re-predicted at feature level across horizons h = 2, 3, 4.",
        placementModeLabel: "Placement mode",
        placementModeAria: "Crew placement mode",
        modeManual: "Manual ward deployments",
        modeAuto: "Auto-place N crews",
        efficacyPresetLabel: "Efficacy preset",
        efficacyPresetAria: "Vector-control efficacy preset",
        efficacyLabels: { low: "Low", base: "Base", high: "High" },
        treatedWardsTitle: (n) => `Treated wards (${n})`,
        treatedWardsHint: "Adjust 1–5 crews per ward (up to 20 max) to inspect marginal ROI.",
        addWardLabel: "Add ward",
        addWardBtn: "Add ward",
        selectedWardFallback: "Selected ward",
        decreaseCrewsAria: (wardId) => `Decrease crews for ${wardId}`,
        increaseCrewsAria: (wardId) => `Increase crews for ${wardId}`,
        crewsForWardAria: (wardId) => `Crews for ${wardId}`,
        removeWardAria: (wardId) => `Remove ${wardId} from simulation`,
        autoCrewsSliderLabel: "Auto-place spraying crews (greedy marginal ROI)",
        autoCrewsValueLabel: (n) => `${n} crews`,
        autoCrewsAriaText: (n) => `${n} crews auto-placed`,
        autoCrewsMinLabel: "1 crew",
        autoCrewsMaxLabel: "300 crews",
        autoCrewsInputLabel: "Crews (1–300)",
        assumptionPrefix: "Model assumption: ",
        assumptionFallback:
          "Assumed, not fitted: no intervention labels in the data. See ADR-0013.",
        runningSim: "Running counterfactual simulation…",
        errorTitle: "Counterfactual simulation failed",
        loadingLabel: "Evaluating counterfactual case reductions across treated wards…",
        emptyTitle: "No treated wards simulated",
        emptyDescription:
          "Add at least one ward or enable Auto-place crews above to run the simulation.",
        kpiCrewsDeployed: "Crews deployed",
        kpiCrewsNote: (wards) => `Across ${wards} treated ward${wards === 1 ? "" : "s"}`,
        kpiCasesPrevented: "Cases prevented (h = 2–4)",
        kpiBandLabel: (low, high) => `Band: [${low} – ${high}]`,
        kpiBedsAvoided: "Hospital beds avoided",
        kpiBedsNote: "At 0.298 beds / case",
        kpiSalineAvoided: "Saline bags avoided",
        kpiSalineNote: "At 2.385 bags / case",
        chartTitle: "Baseline vs counterfactual cases (h = 2, 3, 4)",
        chartDescription:
          "Pooled expected cases across treated wards before and after vector-control deployment.",
        chartAria:
          "Baseline versus counterfactual dengue cases chart across horizons 2, 3, and 4",
        legendBaseline: "Baseline",
        legendCounterfactual: "Counterfactual",
        barBaselineName: "Baseline cases",
        barCounterfactualName: "Counterfactual cases",
        horizonTick: (h) => `Horizon +${h}w`,
        roiTitle: "Intervention ROI ranking",
        roiDescription:
          "Ranked by cases prevented per crew deployed, with low–high efficacy sensitivity bounds.",
        roiTableAria: "Counterfactual intervention ROI ranking table",
        colRank: "Rank",
        colWard: "Ward",
        colCrews: "Crews",
        colReduction: "Reduction",
        colCasesPrevented: "Cases Prevented",
        colSensitivity: "Sensitivity [Low – High]",
        colBedsAvoided: "Beds Avoided",
        colSalineAvoided: "Saline Avoided",
        colRoiPerCrew: "ROI / Crew",
      },
      step5: {
        title: "Step 5 · Multi-channel dispatch & printable commissioner brief",
        description:
          "Deterministic, zero-network notices grounded strictly in NoticeFacts: SMS with GSM-7 / UCS-2 segment metering, WhatsApp brief, and printable A4 HTML.",
        targetWardsLabel: "Target wards",
        targetModeAria: "Dispatch target selection mode",
        targetSelectedWards: (n) => `Selected wards (${n})`,
        targetEntireScope: (scope) => `Entire scope (${scope})`,
        channelsLabel: "Dispatch channels",
        channelLabels: { sms: "SMS", whatsapp: "WhatsApp", brief: "Printable brief" },
        noticeLangLabel: "Notice language (EN / BN)",
        noticeLangAria: "Dispatch notice language",
        chooseWardsTitle: (n) => `Choose wards to dispatch (${n} selected)`,
        basisSummary: (origin, stock, crews, planId) =>
          `Basis: origin ${origin} · stock ${stock}% · crews ${crews}${
            planId ? ` · saved plan ${planId.slice(0, 8)}` : " · live Step 2 inputs"
          }`,
        useSavedPlanLabel: "Use last saved allocation plan",
        renderingNotices: "Rendering notices…",
        errorTitle: "Could not render dispatch notices",
        loadingLabel: "Rendering bilingual SMS, WhatsApp, and printable commissioner briefs…",
        emptyTitle: "No dispatch notices generated",
        emptyDescription: "Select at least one ward and channel above.",
        noticeFactsLine: (city, wStart, wEnd, cases, saline, kits, beds, crews) =>
          `${city} · window ${wStart} to ${wEnd} · ${cases} cases · Saline ${saline} · Kits ${kits} · Beds ${beds} · Crews ${crews}`,
        openPrintableBrief: "Open printable brief",
        smsPreviewTitle: "SMS Preview",
        charsLabel: (n) => `${n} chars`,
        segmentsLabel: (n) => `${n} ${n === 1 ? "segment" : "segments"}`,
        copySms: "Copy SMS",
        copiedSms: "Copied SMS",
        whatsappPreviewTitle: "WhatsApp Preview",
        copyWhatsapp: "Copy WhatsApp",
        copiedWhatsapp: "Copied WhatsApp",
        showAllNotices: (n) => `Show all ${n} ward notices`,
      },
    },
  },
  bn: {
    appHeading: "ওয়ার্ড-ভিত্তিক ডেঙ্গু আগাম সতর্কতা",
    productPromise: "আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।",
    demoBadge: "ডেমো ডেটা",
    brandLink: "ব্র্যান্ড সিস্টেম",
    tabs: {
      "ward-risk": "ওয়ার্ড পূর্বাভাস",
      command: "কমান্ড সেন্টার",
      map: "ঝুঁকি মানচিত্র",
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
    command: {
      steps: {
        forecast: "পূর্বাভাস",
        allocate: "বণ্টন",
        route: "শয্যা রুট",
        simulate: "সিমুলেট",
        dispatch: "ডিসপ্যাচ",
      },
      stepSubtitles: {
        forecast: "চাহিদা",
        allocate: "সরবরাহ",
        route: "শয্যা",
        simulate: "কার্যকারিতা",
        dispatch: "নির্দেশনা",
      },
      navAria: "কমান্ড সেন্টারের ধাপসমূহ",
      tablistAria: "কমান্ড সেন্টার কর্মধারা ধাপসমূহ",
      stepCounter: (step, scope, origin) => `ধাপ ${step} / ৫ · ${scope === "all" ? "সকল নগর" : scope} · ${origin}`,
      scopeLabel: "অঞ্চল",
      scopeAll: "সকল নগর (৬০ ওয়ার্ড)",
      originLabel: "সূচনা সপ্তাহ (ISO)",
      windowStartLabel: "শুরুর সপ্তাহ",
      windowEndLabel: "শেষ সপ্তাহ",
      savePlanLabel: "পরিকল্পনার নাম",
      savePlanPlaceholder: "যেমন: ঢাকা দক্ষিণ ৬০% মজুত",
      savePlanButton: "পরিকল্পনা সংরক্ষণ",
      savingPlan: "সংরক্ষণ হচ্ছে…",
      comparePlansButton: "পরিকল্পনা তুলনা",
      offlineBadge: "অফলাইন মোড",
      onlineBadge: "লোকাল এপিআই",
      previousStep: "আগের ধাপ",
      nextStep: "পরবর্তী ধাপ",
      provenance: {
        regionAria: "রান প্রমাণাংশ ও পরিকল্পনা কার্যক্রম",
        modelLabel: "মডেল",
        shaLabel: "SHA",
        dataAsOfLabel: "তথ্য হালনাগাদ",
        solveLabel: "সমাধান",
        updating: "হালনাগাদ হচ্ছে…",
        savedPlanPrefix: "সংরক্ষিত পরিকল্পনা:",
        saveErrorPrefix: "পরিকল্পনা সংরক্ষণ করা যায়নি:",
        saveFailedFallback: "পরিকল্পনা সংরক্ষণ ব্যর্থ হয়েছে।",
      },
      compare: {
        title: "সংরক্ষিত পরিকল্পনা তুলনা",
        subtitle: "সংযোজন-ভিত্তিক সিদ্ধান্ত লগ · পার্থক্য = পরিকল্পনা খ − পরিকল্পনা ক",
        refreshAria: "সংরক্ষিত পরিকল্পনা হালনাগাদ করুন",
        closeAria: "পরিকল্পনা তুলনা বন্ধ করুন",
        kindFilterAria: "ধরন অনুযায়ী পরিকল্পনা বাছাই করুন",
        kinds: {
          all: "সকল",
          allocation: "বণ্টন",
          overflow: "শয্যা রুট",
          simulation: "সিমুলেশন",
          dispatch: "ডিসপ্যাচ",
        },
        loadErrorTitle: "সংরক্ষিত পরিকল্পনা লোড করা যায়নি",
        loadingLabel: "সংরক্ষিত পরিকল্পনাসমূহ লোড হচ্ছে…",
        emptyTitle: "এখনো কোনো পরিকল্পনা সংরক্ষিত নেই",
        emptyDescription:
          "যেকোনো ধাপে “পরিকল্পনা সংরক্ষণ” ব্যবহার করে বণ্টন, শয্যা রুট, সিমুলেশন বা ডিসপ্যাচ স্ন্যাপশট সংরক্ষণ করুন।",
        planALabel: "ভিত্তি পরিকল্পনা ক",
        planBLabel: "তুলনীয় পরিকল্পনা খ",
        compareErrorTitle: "নির্বাচিত পরিকল্পনা তুলনা করা যায়নি",
        comparingLabel: "পরিকল্পনার সূচক তুলনা হচ্ছে…",
        planAPrefix: "পরিকল্পনা ক",
        planBPrefix: "পরিকল্পনা খ",
        originLabel: "সূচনা",
        scopeLabel: "অঞ্চল",
        stockLabel: "মজুত",
        tableAria: "সংরক্ষিত পরিকল্পনা তুলনা সারণি",
        colMetric: "সূচক",
        colPlanA: "পরিকল্পনা ক",
        colPlanB: "পরিকল্পনা খ",
        colDelta: "পার্থক্য (খ − ক)",
        metrics: {
          stock_pct: "উপলব্ধ মজুত (%)",
          mean_fulfilment_pct: "গড় পূরণ (%)",
          critical_wards: "সংকটপূর্ণ ঘাটতি ওয়ার্ড",
          deficit_wards: "মোট ঘাটতি ওয়ার্ড",
          crews: "স্প্রে দল",
          cases_prevented: "প্রতিরোধকৃত রোগী (h=2–4)",
          unroutable_patients: "শয্যাহীন রোগী",
          notices: "প্রেরিত নির্দেশনা",
        },
      },
      step1: {
        title: "ধাপ ১ · পূর্বাভাস ও চাহিদা নির্ধারণ",
        description:
          "নগর বা সকল ৬০ ওয়ার্ডের জন্য সূচনা সপ্তাহ ও পূর্বাভাস সময়কাল নির্বাচন করুন। স্যালাইন ও কিট সময়সীমার P80 কোয়ান্টাইলে এবং শয্যা শীর্ষ সপ্তাহের P90-এ নির্ধারিত হয়।",
        horizonOptions: {
          1: "+১স (আগামী সপ্তাহ)",
          2: "+২স (২ সপ্তাহ পর)",
          3: "+৩স (৩ সপ্তাহ পর)",
          4: "+৪স (৪ সপ্তাহ পর)",
        },
        errorTitle: "পূর্বাভাস চাহিদা লোড করা যায়নি",
        loadingLabel: "পরিকল্পনা সময়সীমায় ওয়ার্ড চাহিদা হিসাব হচ্ছে…",
        emptyTitle: "এই অঞ্চলে কোনো ওয়ার্ড পাওয়া যায়নি",
        emptyDescription: "পূর্বাভাস দেখতে অন্য নগর বা সূচনা সপ্তাহ নির্বাচন করুন।",
        kpiWards: "আওতাভুক্ত ওয়ার্ড",
        kpiWindowNote: (hStart, hEnd) => `সময়সীমা +${hStart}স থেকে +${hEnd}স`,
        kpiCritical: "সংকটপূর্ণ ওয়ার্ড",
        kpiCriticalNote: "সময়সীমার সর্বোচ্চ স্তর",
        kpiExpected: "প্রত্যাশিত রোগী",
        kpiExpectedNote: "সাপ্তাহিক গড়ের যোগফল",
        kpiPlanned: "পরিকল্পিত রোগী",
        kpiPlannedNote: "কোয়ান্টাইল চাহিদার ভিত্তি",
        tableTitle: (visible, total) => `ওয়ার্ড চাহিদা পূর্বাভাস (${total}টির মধ্যে ${visible}টি)`,
        tableDescription:
          "নগর ও অগ্রাধিকার গুরুত্বানুসারে সাজানো। সীমিত সরবরাহ বণ্টনের জন্য ধাপ ২-এ যান।",
        proceedBtn: "বণ্টন ধাপে যান →",
        filterAria: "ঝুঁকির স্তর অনুযায়ী ওয়ার্ড বাছাই করুন",
        filterAll: (n) => `সকল (${n})`,
        tableAria: "কমান্ড সেন্টার ধাপ ১ ওয়ার্ড পূর্বাভাস সারণি",
        colWard: "ওয়ার্ড",
        colCity: "নগর",
        colTier: "শীর্ষ ঝুঁকির স্তর",
        colExpected: "প্রত্যাশিত রোগী",
        colPlanned: "পরিকল্পিত রোগী",
        colPriority: "অগ্রাধিকার মান",
        colSupplies: "স্যালাইন / কিট / শীর্ষ শয্যা",
      },
      step2: {
        title: "ধাপ ২ · সীমিত সরবরাহ ও স্প্রে দল বণ্টন",
        description:
          "আঞ্চলিক মজুত (৩০–১০০%) এবং স্প্রে দলের সংখ্যা পরিবর্তন করলে ১৫০ মিলিসেকেন্ডে লাইভ অপ্টিমাইজার প্রতিটি নগরে ন্যূনতম সমতা নিশ্চিত করে পুনরায় বণ্টন করে।",
        equityFloorBadge: (pct) => `সমতা ন্যূনতম: ${pct}%`,
        crewsMethodBadge: (method) => `দল পদ্ধতি: ${method}`,
        stockSliderLabel: "উপলব্ধ আঞ্চলিক মজুত",
        stockMinLabel: "৩০% তীব্র ঘাটতি",
        stockMaxLabel: "১০০% পূর্ণ মজুত",
        stockAriaText: (pct) => `উপলব্ধ আঞ্চলিক মজুত ${pct} শতাংশ`,
        stockPresetsAria: "মজুত শতাংশের দ্রুত বাটন",
        crewsSliderLabel: "মোট স্প্রে দল",
        crewsValueLabel: (n) => `${n} দল`,
        crewsAriaText: (n) => `${n}টি স্প্রে দল`,
        crewsMinLabel: "০ দল",
        crewsMaxLabel: "৬০ দল",
        exactCrewsLabel: "নির্দিষ্ট দল",
        ratiosSummary: (saline, kits, beds, pSaline, pBeds) =>
          `অনুপাত/রোগী: স্যালাইন ${saline} · কিট ${kits} · শীর্ষ শয্যা ${beds} · P${pSaline}/P${pBeds}`,
        activeStatus: (stock, crews, critical, deficit) =>
          `সক্রিয় সমাধান: মজুত ${stock}% · দল ${crews} · সংকটপূর্ণ ঘাটতি ${critical} · মোট ঘাটতি ${deficit} ওয়ার্ড`,
        resolving: "পুনরায় হিসাব হচ্ছে…",
        errorTitle: "বণ্টন অপ্টিমাইজেশন ব্যর্থ হয়েছে",
        loadingLabel: "নগরভিত্তিক সীমিত সরবরাহ বণ্টন হিসাব হচ্ছে…",
        emptyTitle: "বণ্টনের আওতায় কোনো ওয়ার্ড নেই",
        emptyDescription: "ধাপ ১-এ সঠিক অঞ্চল ও সূচনা সপ্তাহ নির্বাচন করুন।",
        cityCrewsCount: (n) => `${n} দল`,
        cityDeficitSummary: (critical, deficit) => `সংকটপূর্ণ ${critical} · ঘাটতি ${deficit} ওয়ার্ড`,
        colResource: "সরঞ্জাম",
        colReq: "চাহিদা",
        colAvail: "মজুত",
        colAlloc: "বরাদ্দ",
        colFloor: "ন্যূনতম",
        floorScaled: "সমন্বিত",
        floorOk: (pct) => `${pct}% ঠিক`,
        resources: {
          saline_bags: "স্যালাইন ব্যাগ",
          diagnostic_kits: "ডায়াগনস্টিক কিট",
          hospital_beds: "হাসপাতাল শয্যা",
        },
        wardTableTitle: "ওয়ার্ডভিত্তিক সরবরাহ বরাদ্দ ও ঘাটতি সতর্কতা",
        wardTableDescription:
          "প্রতিটি সরঞ্জামের বরাদ্দ/চাহিদা অগ্রগতি বার, স্প্রে দল নিয়োগ এবং স্পষ্ট ঘাটতির কারণ।",
        wardTableAria: "ওয়ার্ডভিত্তিক সরবরাহ বরাদ্দ সারণি",
        colWard: "ওয়ার্ড",
        colRiskTier: "ঝুঁকির স্তর",
        colSaline: "স্যালাইন ব্যাগ",
        colKits: "ডায়াগনস্টিক কিট",
        colBeds: "হাসপাতাল শয্যা",
        colCrews: "স্প্রে দল",
        colDeficit: "ঘাটতির অবস্থা ও কারণ",
        shortSuffix: (n) => `−${n} ঘাটতি`,
        weightPrefix: "গুরুত্ব",
        fulfilmentAria: (wardId, resource) => `${wardId} ${resource} পূরণ`,
      },
      step3: {
        title: "ধাপ ৩ · নগর-ভিত্তিক শয্যা ওভারফ্লো রাউটিং",
        description:
          "প্রতিটি নগরের ভেতরে অতিরিক্ত রোগী পাশের খালি শয্যাযুক্ত ওয়ার্ডে স্থানান্তর করুন এবং প্রয়োজনে ওয়ার্ডের শয্যা-ক্ষমতা সম্পাদনা করুন।",
        capacityMethodBadge: "ইতিহাস থেকে নির্ধারিত (২০১৬–২০২২ P95 × ১.১০)",
        shoulderWeekBtn: "মাঝারি সপ্তাহ (১২ আগস্ট)",
        shoulderWeekTitle: "১২ আগস্ট ২০২৪ (+৩স)-এ গিয়ে সরাসরি শয্যা স্থানান্তর ও ঘাটতি একসাথে দেখুন",
        resetOverrides: (n) => `পরিবর্তন বাতিল (${n})`,
        horizonLabel: "রাউটিং সময়কাল",
        horizonOptions: {
          1: "+১স",
          2: "+২স",
          3: "+৩স (শীর্ষ সপ্তাহ)",
          4: "+৪স",
        },
        serviceLevelLabel: "পরিকল্পিত শয্যা কোয়ান্টাইল",
        serviceLevelOptions: {
          "0.8": "P80 (0.80)",
          "0.9": "P90 (0.90 · ডিফল্ট)",
          "0.95": "P95 (0.95 · সতর্ক)",
        },
        methodFormulaLabel: "পদ্ধতির সূত্র",
        rerouting: "শয্যা স্থানান্তর পুনরায় হিসাব হচ্ছে…",
        errorTitle: "শয্যা ওভারফ্লো রাউটিং ব্যর্থ হয়েছে",
        loadingLabel: "নগর-ভিত্তিক শয্যা ওভারফ্লো রাউটিং হিসাব হচ্ছে…",
        emptyTitle: "রাউটিং আওতায় কোনো নগর নেই",
        emptyDescription: "শয্যা স্থানান্তর দেখতে একটি নগর বা সকল নগর নির্বাচন করুন।",
        reqCapTransfers: (req, cap, transfers) =>
          `${req} চাহিদা / ${cap} শয্যা · ${transfers} স্থানান্তর`,
        patientsWithoutBed: (n) => `${n} জন শয্যাহীন রোগী`,
        noUnroutable: "০ শয্যাহীন",
        utilBefore: "রাউটিংয়ের আগে ব্যবহার",
        bedsFilledAfter: "রাউটিংয়ের পরে শয্যা পূর্ণতা",
        demandVsCapacity: "চাহিদা / শয্যা-ক্ষমতা",
        headroomAfter: (beds) => `রাউটিংয়ের পরে খালি শয্যা: ${beds} টি`,
        flowsTitle: (n) => `নগরের ভেতরে রোগী স্থানান্তর (${n})`,
        flowsDescription:
          "অতিরিক্ত চাপযুক্ত ওয়ার্ড থেকে একই নগরের খালি শয্যাযুক্ত ওয়ার্ডে রোগী স্থানান্তরের চিত্র।",
        sankeyAria: "নগরের ভেতরে শয্যা ওভারফ্লো প্রবাহ চিত্র",
        sankeyImgAria: (n) => `${n}টি রোগী স্থানান্তর রুট দেখানো শয্যা ওভারফ্লো চিত্র`,
        sankeyTitle: "নগরের ভেতরে শয্যা স্থানান্তর",
        sankeySenders: "অতিরিক্ত চাপের ওয়ার্ড (প্রেরক)",
        sankeyReceivers: "খালি শয্যার ওয়ার্ড (গ্রাহক)",
        sankeyOut: (n) => `−${n} বহির্গমন`,
        sankeyIn: (n) => `+${n} আগমন`,
        selectedRoute: (from, to, patients, city) =>
          `নির্বাচিত রুট: ${from} → ${to} (${patients} জন রোগী · ${city})`,
        cityNoFreeBeds: (city, unroutable) =>
          `${city}-এ কোথাও খালি শয্যা নেই: ${unroutable} জন রোগীকে এই নগরে রাখা যাচ্ছে না`,
        cityWithinCapacity: (city) => `${city}-এর সকল ওয়ার্ড শয্যা-ক্ষমতার ভেতরে রয়েছে`,
        transferTableAria: "নগরের ভেতরে রোগী স্থানান্তর সারণি",
        colCity: "নগর",
        colFromWard: "উৎস ওয়ার্ড (অতিরিক্ত চাপ)",
        colToWard: "গন্তব্য ওয়ার্ড (খালি শয্যা)",
        colPatientsRouted: "স্থানান্তরিত রোগী",
        wardTableTitle: "ওয়ার্ড শয্যা-ক্ষমতা, পরিবর্তন ও নিট ঘাটতি",
        wardTableDescription:
          "বাস্তব হাসপাতালের শয্যা সংখ্যা বা অস্থায়ী ওয়ার্ড পরীক্ষা করতে যেকোনো ওয়ার্ডের শয্যা (১–৫০০) সম্পাদনা করুন।",
        wardTableAria: "ওয়ার্ডভিত্তিক শয্যা অবস্থা ও ক্ষমতা পরিবর্তনের সারণি",
        colWard: "ওয়ার্ড",
        colReqBeds: "প্রয়োজনীয় শয্যা",
        colCapacityEditable: "শয্যা-ক্ষমতা (সম্পাদনাযোগ্য)",
        colSource: "উৎস",
        colLocalDeficit: "স্থানীয় ঘাটতি",
        colOutIn: "বহির্গমন / আগমন",
        colNetDeficit: "নিট ঘাটতি",
        colUtilBeforeAfter: "ব্যবহার আগে → পরে",
        capacityInputAria: (wardId) => `${wardId}-এর শয্যা-ক্ষমতা`,
        sourceOverride: "সম্পাদিত",
        sourceDerived: "নির্ধারিত",
      },
      step4: {
        title: "ধাপ ৪ · ভেক্টর নিয়ন্ত্রণ কাউন্টারফ্যাকচুয়াল সিমুলেটর ও কার্যকারিতা",
        description:
          "ম্যানুয়ালি ওয়ার্ডে দল দিন অথবা স্বয়ংক্রিয়ভাবে দল বসিয়ে h = 2, 3, 4 সপ্তাহে প্রতিরোধযোগ্য রোগী ও সংবেদনশীলতা পরিসর দেখুন।",
        placementModeLabel: "দল নিয়োগ পদ্ধতি",
        placementModeAria: "স্প্রে দল নিয়োগ পদ্ধতি",
        modeManual: "ম্যানুয়াল ওয়ার্ড নির্বাচন",
        modeAuto: "স্বয়ংক্রিয়ভাবে দল নিয়োগ",
        efficacyPresetLabel: "কার্যকারিতা স্তর",
        efficacyPresetAria: "ভেক্টর নিয়ন্ত্রণ কার্যকারিতা স্তর",
        efficacyLabels: { low: "নিম্ন", base: "মাঝারি", high: "উচ্চ" },
        treatedWardsTitle: (n) => `নির্বাচিত ওয়ার্ড (${n})`,
        treatedWardsHint: "প্রান্তিক কার্যকারিতা দেখতে প্রতি ওয়ার্ডে ১–৫ দল (সর্বোচ্চ ২০) নির্ধারণ করুন।",
        addWardLabel: "ওয়ার্ড যোগ করুন",
        addWardBtn: "যোগ করুন",
        selectedWardFallback: "নির্বাচিত ওয়ার্ড",
        decreaseCrewsAria: (wardId) => `${wardId}-এর দল কমান`,
        increaseCrewsAria: (wardId) => `${wardId}-এর দল বাড়ান`,
        crewsForWardAria: (wardId) => `${wardId}-এর স্প্রে দল`,
        removeWardAria: (wardId) => `সিমুলেশন থেকে ${wardId} সরান`,
        autoCrewsSliderLabel: "স্বয়ংক্রিয় স্প্রে দল নিয়োগ (সর্বোচ্চ প্রান্তিক প্রভাব)",
        autoCrewsValueLabel: (n) => `${n} দল`,
        autoCrewsAriaText: (n) => `${n}টি স্বয়ংক্রিয় স্প্রে দল`,
        autoCrewsMinLabel: "১ দল",
        autoCrewsMaxLabel: "৩০০ দল",
        autoCrewsInputLabel: "দল (১–৩০০)",
        assumptionPrefix: "মডেল অনুমান: ",
        assumptionFallback:
          "অনুমিত মান, ডেটা থেকে ফিট নয়: ডেটাসেটে ইন্টারভেনশন লেবেল নেই (ADR-0013)।",
        runningSim: "কাউন্টারফ্যাকচুয়াল সিমুলেশন চলছে…",
        errorTitle: "কাউন্টারফ্যাকচুয়াল সিমুলেশন ব্যর্থ হয়েছে",
        loadingLabel: "নির্বাচিত ওয়ার্ডগুলোতে প্রতিরোধযোগ্য রোগী হিসাব হচ্ছে…",
        emptyTitle: "কোনো ওয়ার্ড সিমুলেট করা হয়নি",
        emptyDescription: "সিমুলেশন চালাতে অন্তত একটি ওয়ার্ড যোগ করুন বা স্বয়ংক্রিয় দল নিয়োগ চালু করুন।",
        kpiCrewsDeployed: "নিয়োজিত স্প্রে দল",
        kpiCrewsNote: (wards) => `${wards}টি ওয়ার্ডে নিয়োজিত`,
        kpiCasesPrevented: "প্রতিরোধকৃত রোগী (h = 2–4)",
        kpiBandLabel: (low, high) => `পরিসর: [${low} – ${high}]`,
        kpiBedsAvoided: "সাশ্রয়কৃত হাসপাতাল শয্যা",
        kpiBedsNote: "প্রতি রোগীতে ০.২৯৮ শয্যা হিসাবে",
        kpiSalineAvoided: "সাশ্রয়কৃত স্যালাইন ব্যাগ",
        kpiSalineNote: "প্রতি রোগীতে ২.৩৮৫ ব্যাগ হিসাবে",
        chartTitle: "বেসলাইন বনাম প্রতিরোধ-পরবর্তী রোগী (h = 2, 3, 4)",
        chartDescription:
          "ভেক্টর নিয়ন্ত্রণ দল নিয়োগের আগে ও পরে নির্বাচিত ওয়ার্ডগুলোর সম্মিলিত প্রত্যাশিত রোগী।",
        chartAria: "সপ্তাহ ২, ৩ ও ৪-এ বেসলাইন বনাম প্রতিরোধ-পরবর্তী ডেঙ্গু রোগীর চার্ট",
        legendBaseline: "বেসলাইন",
        legendCounterfactual: "প্রতিরোধ-পরবর্তী",
        barBaselineName: "বেসলাইন রোগী",
        barCounterfactualName: "প্রতিরোধ-পরবর্তী রোগী",
        horizonTick: (h) => `সপ্তাহ +${h}`,
        roiTitle: "কার্যকারিতা অনুযায়ী ওয়ার্ড ক্রম (ROI)",
        roiDescription:
          "প্রতি দলে প্রতিরোধকৃত রোগীর সংখ্যা অনুযায়ী সাজানো, নিম্ন–উচ্চ সংবেদনশীলতা পরিসরসহ।",
        roiTableAria: "ভেক্টর নিয়ন্ত্রণ কার্যকারিতা ক্রম সারণি",
        colRank: "ক্রম",
        colWard: "ওয়ার্ড",
        colCrews: "দল",
        colReduction: "হ্রাস",
        colCasesPrevented: "প্রতিরোধকৃত রোগী",
        colSensitivity: "সংবেদনশীলতা [নিম্ন – উচ্চ]",
        colBedsAvoided: "সাশ্রয়কৃত শয্যা",
        colSalineAvoided: "সাশ্রয়কৃত স্যালাইন",
        colRoiPerCrew: "প্রভাব / দল",
      },
      step5: {
        title: "ধাপ ৫ · বহু-চ্যানেল নির্দেশনা ও প্রিন্টযোগ্য ব্রিফ",
        description:
          "প্রতিটি সংখ্যা নির্ধারিত তথ্যের ওপর ভিত্তি করে তৈরি (কোনো বাহ্যিক নেটওয়ার্ক কল ছাড়া): SMS (GSM-7/UCS-2), WhatsApp এবং A4 প্রিন্টযোগ্য ব্রিফ।",
        targetWardsLabel: "লক্ষ্য ওয়ার্ড",
        targetModeAria: "ডিসপ্যাচ লক্ষ্য নির্বাচন পদ্ধতি",
        targetSelectedWards: (n) => `নির্বাচিত ওয়ার্ড (${n})`,
        targetEntireScope: (scope) => `সম্পূর্ণ অঞ্চল (${scope === "all" ? "সকল নগর" : scope})`,
        channelsLabel: "প্রেরণ চ্যানেল",
        channelLabels: { sms: "SMS", whatsapp: "WhatsApp", brief: "প্রিন্টযোগ্য ব্রিফ" },
        noticeLangLabel: "নির্দেশনার ভাষা (EN / বাংলা)",
        noticeLangAria: "ডিসপ্যাচ নির্দেশনার ভাষা",
        chooseWardsTitle: (n) => `ডিসপ্যাচের জন্য ওয়ার্ড বেছে নিন (${n}টি নির্বাচিত)`,
        basisSummary: (origin, stock, crews, planId) =>
          `ভিত্তি: সূচনা ${origin} · মজুত ${stock}% · দল ${crews}${
            planId ? ` · সংরক্ষিত পরিকল্পনা ${planId.slice(0, 8)}` : " · ধাপ ২-এর লাইভ ইনপুট"
          }`,
        useSavedPlanLabel: "সর্বশেষ সংরক্ষিত বণ্টন পরিকল্পনা ব্যবহার করুন",
        renderingNotices: "নির্দেশনা তৈরি হচ্ছে…",
        errorTitle: "ডিসপ্যাচ নির্দেশনা তৈরি করা যায়নি",
        loadingLabel: "দ্বিভাষিক SMS, WhatsApp এবং প্রিন্টযোগ্য ব্রিফ তৈরি হচ্ছে…",
        emptyTitle: "কোনো নির্দেশনা তৈরি হয়নি",
        emptyDescription: "উপরে অন্তত একটি ওয়ার্ড ও একটি চ্যানেল নির্বাচন করুন।",
        noticeFactsLine: (city, wStart, wEnd, cases, saline, kits, beds, crews) =>
          `${city} · সময়কাল ${wStart} থেকে ${wEnd} · ${cases} রোগী · স্যালাইন ${saline} · কিট ${kits} · শয্যা ${beds} · দল ${crews}`,
        openPrintableBrief: "প্রিন্টযোগ্য ব্রিফ খুলুন",
        smsPreviewTitle: "SMS প্রিভিউ",
        charsLabel: (n) => `${n} অক্ষর`,
        segmentsLabel: (n) => `${n} সেগমেন্ট`,
        copySms: "SMS কপি করুন",
        copiedSms: "SMS কপি হয়েছে",
        whatsappPreviewTitle: "WhatsApp প্রিভিউ",
        copyWhatsapp: "WhatsApp কপি করুন",
        copiedWhatsapp: "WhatsApp কপি হয়েছে",
        showAllNotices: (n) => `সকল ${n}টি ওয়ার্ডের নির্দেশনা দেখুন`,
      },
    },
  },
};
