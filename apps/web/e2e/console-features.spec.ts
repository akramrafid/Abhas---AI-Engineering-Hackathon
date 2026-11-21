import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { sanitizeCsvCell } from "../src/lib/actions";
import { DEMO_CONFIG } from "../src/lib/demo-config";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("Abhas §11 Operations Console Features", () => {
  test("en_bn_switch: header EN/BN toggle switches headings, promise, tabs, and officer brief", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("header-promise")).toContainText(
      "Rain today. Risk in three weeks. Act now.",
    );

    const bnAdvisoryPromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/advisory") && res.request().method() === "POST",
    );
    await page.getByTestId("lang-btn-bn").click();
    const bnRes = await bnAdvisoryPromise;
    expect(bnRes.ok()).toBe(true);

    await expect(page.getByTestId("lang-btn-bn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("header-promise")).toContainText(
      "আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।",
    );
    await expect(page.getByTestId("tab-priority")).toContainText("অগ্রাধিকার তালিকা");
    await expect(page.getByTestId("tab-about")).toContainText("তথ্য ও খরচ");
    await expect(page.getByTestId("advisory-panel")).toBeVisible();
    expect(page.url()).toContain("lang=bn");

    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Ward Forecast (Bangla mode)");

    await page.getByTestId("lang-btn-en").click();
    await expect(page.getByTestId("header-promise")).toContainText(
      "Rain today. Risk in three weeks. Act now.",
    );
    expect(page.url()).toContain("lang=en");
  });

  test("origin_iso_format_act_by_waterfall_and_advisory: shows ISO week range, Act by date, waterfall + other, and real advisory", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    // Origin selector displays ISO week + Mon–Sun date range alongside ISO Monday value
    const selectedOriginLabel = await page
      .getByTestId("origin-week-select")
      .locator(`option[value="${DEMO_CONFIG.originWeek}"]`)
      .textContent();
    expect(selectedOriginLabel).toContain("W32 2024");
    expect(selectedOriginLabel).toContain("5–11 Aug");

    // Act-by deadline computed from peak target week minus 14 days
    await expect(page.getByTestId("peak-act-by")).toContainText(/\d{1,2}\s[A-Z][a-z]{2}\s\d{4}/);

    // Horizontal waterfall includes top 4 drivers plus residual "Other factors" row
    await expect(page.getByTestId("drivers-panel")).toBeVisible();
    await expect(page.getByTestId("driver-row-other")).toBeVisible();

    // Officer Brief calls POST /api/v1/advisory and shows template or LLM badge
    await expect(page.getByTestId("advisory-panel")).toBeVisible();
    await expect(page.getByTestId("advisory-headline")).not.toBeEmpty();
    await expect(page.getByTestId("advisory-source-badge")).toContainText(
      /Deterministic template|Claude LLM/i,
    );
  });

  test("ac_7_real_api_monotonicity: 120 mm and 250 mm rain presets increase h=3 forecast monotonically against real tuned API", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-scenario").click();
    await expect(page.getByTestId("scenario-panel")).toBeVisible();

    const waitScenario = () =>
      page.waitForResponse(
        (res) => res.url().includes("/api/v1/scenario") && res.request().method() === "POST",
      );

    const p120 = waitScenario();
    await page.getByTestId("scenario-preset-120").click();
    const res120 = (await (await p120).json()) as {
      baseline: Array<{ horizon: number; expected_cases: number }>;
      scenario: Array<{ horizon: number; expected_cases: number }>;
    };
    const baseH3 = res120.baseline.find((h) => h.horizon === 3)!.expected_cases;
    const scen120H3 = res120.scenario.find((h) => h.horizon === 3)!.expected_cases;
    expect(scen120H3).toBeGreaterThan(baseH3);

    const p250 = waitScenario();
    await page.getByTestId("scenario-preset-250").click();
    const res250 = (await (await p250).json()) as {
      scenario: Array<{ horizon: number; expected_cases: number }>;
    };
    const scen250H3 = res250.scenario.find((h) => h.horizon === 3)!.expected_cases;
    expect(scen250H3).toBeGreaterThanOrEqual(scen120H3);
    await expect(page.getByTestId("scenario-tier-change")).toBeVisible();
  });

  test("priority_list_and_csv_formula_injection_protection: ranks wards, shows actions, and neutralizes formula cells in CSV export", async ({
    page,
  }) => {
    // Unit-level assertion on all 6 OWASP formula-injection trigger prefixes
    expect(sanitizeCsvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(sanitizeCsvCell("+1+1")).toBe("'+1+1");
    expect(sanitizeCsvCell("-2+3")).toBe("'-2+3");
    expect(sanitizeCsvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(sanitizeCsvCell("\t1+1")).toBe("'\t1+1");
    expect(sanitizeCsvCell("\r1+1")).toBe(`"'\r1+1"`);
    expect(sanitizeCsvCell("DSCC_Ward_04")).toBe("DSCC_Ward_04");

    await page.goto("/?demo=1");
    await page.getByTestId("tab-priority").click();
    await expect(page.getByTestId("priority-panel")).toBeVisible();
    await expect(page.getByTestId("priority-table")).toBeVisible();
    await expect(page.getByTestId("priority-print-brief")).toBeVisible();
    await expect(page.getByTestId("priority-table")).toContainText(
      /Larviciding|Hospital stock alert|Community clean-up|Inspect|surveillance/i,
    );

    // Inject a formula-bearing ward_id into /api/v1/forecast response to test CSV export end-to-end
    await page.route("**/api/v1/forecast", async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as {
        forecasts: Array<{ ward_id: string }>;
      };
      if (json.forecasts.length > 0) {
        json.forecasts[0].ward_id = "=HYPERLINK(\"http://evil\",\"DSCC_01\")";
      }
      await route.fulfill({ response, json });
    });

    await page.goto("/?demo=1&tab=priority");
    await expect(page.getByTestId("priority-table")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("priority-export-csv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^abhas-priority-.*\.csv$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const csvContent = fs.readFileSync(filePath!, "utf8");
    expect(csvContent).toContain("rank,ward_id,city");
    // Formula cell must be prefixed with single quote inside CSV quotes
    expect(csvContent).toContain(`"'=HYPERLINK(""http://evil"",""DSCC_01"")"`);
    expect(csvContent).not.toMatch(/(?:^|,|\n)=HYPERLINK/);

    await page.unroute("**/api/v1/forecast");
  });

  test("url_state_persistence: URL syncs ward, origin, window, tab, lang and restores state on reload without hydration errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    await page.getByTestId("window-1-4w").click();
    await page.getByTestId("lang-btn-bn").click();
    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("heatmap-panel")).toBeVisible();

    await expect
      .poll(() => new URL(page.url()).searchParams.toString())
      .toContain("tab=heatmap");
    const syncedUrl = new URL(page.url());
    expect(syncedUrl.searchParams.get("ward")).toBe(DEMO_CONFIG.wardId);
    expect(syncedUrl.searchParams.get("origin")).toBe(DEMO_CONFIG.originWeek);
    expect(syncedUrl.searchParams.get("window")).toBe("1-4w");
    expect(syncedUrl.searchParams.get("tab")).toBe("heatmap");
    expect(syncedUrl.searchParams.get("lang")).toBe("bn");

    // Reload and verify state restores cleanly with zero hydration errors
    await page.reload();
    await expect(page.getByTestId("heatmap-panel")).toBeVisible();
    await expect(page.getByTestId("lang-btn-bn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("window-1-4w")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("origin-week-select")).toHaveValue(DEMO_CONFIG.originWeek);

    const hydrationErrors = consoleErrors.filter((e) =>
      /hydrat|did not match|server html/i.test(e),
    );
    expect(hydrationErrors).toEqual([]);
  });

  test("about_and_cost_tab: renders live /api/v1/ops telemetry, honest model card, and Open-Meteo CC BY 4.0 attribution", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-about").click();

    await expect(page.getByTestId("about-panel")).toBeVisible();
    await expect(page.getByTestId("about-ops-card")).toBeVisible();
    await expect(page.getByTestId("about-ops-model-loads")).toHaveText("1");
    await expect(page.getByTestId("about-ops-cache-rate")).toContainText("%");
    await expect(page.getByTestId("about-ops-monthly-cost")).toContainText("$");

    const modelCard = page.getByTestId("about-model-card");
    await expect(modelCard).toBeVisible();
    await expect(modelCard).toContainText(/simulated/i);
    await expect(modelCard).toContainText(/DGHS/i);
    await expect(modelCard).toContainText(/recalibration/i);

    const attribution = page.getByTestId("about-attribution");
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText("Open-Meteo.com");
    await expect(attribution).toContainText("CC BY 4.0");

    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "About & Cost Tab");
  });
});
