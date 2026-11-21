import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_CONFIG } from "../src/lib/demo-config";

const LIME_RGB = "rgb(212, 245, 60)";

async function assertZeroLimeInDataView(page: Page) {
  const offenders = await page.evaluate((limeRgb) => {
    const root = document.querySelector('[data-view="data"]');
    if (!root) return ["missing [data-view='data']"];
    const found: string[] = [];
    const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      const props = [
        style.color,
        style.backgroundColor,
        style.borderTopColor,
        style.borderRightColor,
        style.borderBottomColor,
        style.borderLeftColor,
        style.fill,
        style.stroke,
      ];
      if (props.some((val) => val === limeRgb)) {
        found.push(
          `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : ""}`,
        );
      }
    }
    return found;
  }, LIME_RGB);

  expect(offenders, "Lime (#D4F53C) must never appear inside [data-view='data']").toEqual([]);
}

async function assertWcagAA(page: Page, contextLabel: string) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = scan.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target),
    })),
    `WCAG 2.2 AA serious/critical violations on ${contextLabel}`,
  ).toEqual([]);
}

test.describe("Abhas Dashboard E2E & Accessibility", () => {
  test("ac_11: demo mode (/?demo=1) preselects Dhaka South, pinned week, and 2-4w window offline", async ({
    page,
  }) => {
    await page.goto("/?demo=1");

    await expect(page.getByTestId("demo-mode-badge")).toBeVisible();
    await expect(page.getByTestId("weather-source-badge")).toContainText(/dataset mode/i);
    await expect(page.getByTestId("city-select")).toHaveValue(DEMO_CONFIG.city);
    await expect(page.getByTestId("origin-week-select")).toHaveValue(DEMO_CONFIG.originWeek);
    await expect(page.getByTestId("window-2-4w")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("ward-priority-list")).toBeVisible();
  });

  test("ac_6: ward forecast displays EN/BN tier with 1-4 meter, 80% band chart, per-horizon rows, and drivers", async ({
    page,
  }) => {
    await page.goto("/?demo=1");

    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    const badge = page.getByTestId("peak-tier-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/Low|Medium|High|Critical/);
    await expect(badge).toContainText(/নিম্ন|মাঝারি|উচ্চ|সংকটপূর্ণ/);
    await expect(badge.locator('[role="img"]')).toHaveAttribute(
      "aria-label",
      /Risk level [1-4] of 4/,
    );

    await expect(page.getByTestId("peak-risk-score")).toContainText(/\d+\s*\/\s*100/);
    await expect(page.getByTestId("peak-expected-cases")).toContainText(/\d+\.\d/);
    await expect(page.getByTestId("forecast-chart")).toBeVisible();

    // 2-4w window renders horizons 2, 3, 4
    await expect(page.getByTestId("horizon-row-2")).toBeVisible();
    await expect(page.getByTestId("horizon-row-3")).toBeVisible();
    await expect(page.getByTestId("horizon-row-4")).toBeVisible();

    // Toggling to 1-4w adds horizon 1
    await page.getByTestId("window-1-4w").click();
    await expect(page.getByTestId("horizon-row-1")).toBeVisible();

    // Drivers panel shows sign and percentage
    const driversPanel = page.getByTestId("drivers-panel");
    await expect(driversPanel).toBeVisible();
    await expect(driversPanel).toContainText(/[+-]?\d+%/);
  });

  test("ac_1: lags panel shifts rendered rainfall series by k=3 weeks and highlights lag-3 peak", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-lags").click();

    await expect(page.getByTestId("lags-panel")).toBeVisible();
    await expect(page.getByTestId("lags-series-chart")).toBeVisible();
    await expect(page.getByTestId("lags-corr-chart")).toBeVisible();
    await expect(page.getByTestId("lags-peak-dataset")).toContainText("Lag 3w");

    // Select lag 0 and verify source rain week equals case week
    await page.getByTestId("lag-btn-0").click();
    const sample = page.getByTestId("lag-shifted-sample");
    await expect(sample).toHaveAttribute("data-lag", "0");
    const caseWeek0 = await sample.getAttribute("data-case-week");
    const rainWeek0 = await sample.getAttribute("data-rain-source-week");
    expect(caseWeek0).toBeTruthy();
    expect(rainWeek0).toBe(caseWeek0);

    // Shift to lag k=3 and confirm rainfall source week moves exactly 21 days (3 weeks) earlier
    await page.getByTestId("lag-btn-3").click();
    await expect(sample).toHaveAttribute("data-lag", "3");
    await expect(page.getByTestId("lags-series-chart")).toHaveAttribute("data-lag", "3");
    const caseWeek3 = await sample.getAttribute("data-case-week");
    const rainWeek3 = await sample.getAttribute("data-rain-source-week");
    expect(caseWeek3).toBeTruthy();
    expect(rainWeek3).toBeTruthy();
    const diffDays = Math.round(
      (Date.parse(caseWeek3!) - Date.parse(rainWeek3!)) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(21);
  });

  test("ac_7: scenario computes 120 mm rainfall increase, rejects 600 mm client-side, and renders API 422 problem+json", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-scenario").click();

    await expect(page.getByTestId("scenario-panel")).toBeVisible();
    await expect(page.getByTestId("scenario-empty-state")).toBeVisible();

    // Client validation rejects > 500 mm
    await page.getByTestId("scenario-rain-input").fill("600");
    await page.getByTestId("scenario-submit").click();
    await expect(page.getByTestId("scenario-validation-error")).toBeVisible();
    await expect(page.getByTestId("scenario-validation-error")).toContainText("0 and 500");
    await expect(page.getByTestId("scenario-comparison")).toHaveCount(0);

    // Client validation rejects negative rainfall
    await page.getByTestId("scenario-rain-input").fill("-15");
    await expect(page.getByTestId("scenario-validation-error")).toBeVisible();

    // Valid 120 mm preset runs POST /api/v1/scenario and updates side-by-side cards
    const ac7ScenarioResponse = page.waitForResponse(
      (res) => res.url().includes("/api/v1/scenario") && res.request().method() === "POST",
    );
    await page.getByTestId("scenario-preset-120").click();
    const ac7Res = await ac7ScenarioResponse;
    expect(ac7Res.ok()).toBe(true);
    const ac7Json = (await ac7Res.json()) as {
      ward_id: string;
      origin_week: string;
      baseline: Array<{ horizon: number; expected_cases: number }>;
      scenario: Array<{ horizon: number; expected_cases: number }>;
    };
    expect(ac7Json.ward_id).toBe(DEMO_CONFIG.scenarioBaseline.wardId);
    expect(ac7Json.origin_week).toBe(DEMO_CONFIG.scenarioBaseline.originWeek);
    const apiBaseH3 = ac7Json.baseline.find((h) => h.horizon === 3);
    const apiScenH3 = ac7Json.scenario.find((h) => h.horizon === 3);
    expect(apiBaseH3).toBeDefined();
    expect(apiScenH3).toBeDefined();
    expect(apiScenH3!.expected_cases).toBeGreaterThan(apiBaseH3!.expected_cases);

    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
    await expect(page.getByTestId("scenario-baseline-card")).toBeVisible();
    await expect(page.getByTestId("scenario-result-card")).toBeVisible();
    await expect(page.getByTestId("scenario-chart")).toBeVisible();

    const baseVal = Number(
      (await page.getByTestId("scenario-baseline-h3").textContent())?.trim() ?? "NaN",
    );
    const scenVal = Number(
      (await page.getByTestId("scenario-result-h3").textContent())?.trim() ?? "NaN",
    );
    expect(Number.isFinite(baseVal)).toBe(true);
    expect(Number.isFinite(scenVal)).toBe(true);
    expect(scenVal).toBeGreaterThan(baseVal);

    // Verify RFC 9457 422 problem+json errors render cleanly
    await page.route("**/api/v1/scenario", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "https://abhas.dev/problems/validation-error",
          title: "Validation failed",
          status: 422,
          detail: "Rainfall override rejected by server",
          request_id: "e2e-422-rid",
          errors: [
            {
              field: "body.weather.rainfall_mm",
              message: "Input should be less than or equal to 500",
            },
          ],
        }),
      }),
    );

    await page.getByTestId("scenario-preset-60").click();
    await expect(page.getByTestId("scenario-error-banner")).toBeVisible();
    await expect(page.getByTestId("scenario-error-banner")).toContainText(
      "body.weather.rainfall_mm",
    );
    await expect(page.getByTestId("scenario-error-banner")).toContainText("e2e-422-rid");
    await expect(page.getByTestId("scenario-comparison")).toHaveCount(0);
    await page.unroute("**/api/v1/scenario");
  });

  test("test_cr_2_demo_scenario_baseline: demo mode uses a dry (<20 mm) non-Critical baseline and 120 mm raises h=3 cases", async ({
    page,
    request,
  }) => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8011";

    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await page.getByTestId("tab-scenario").click();
    await expect(page.getByTestId("scenario-panel")).toBeVisible();
    await expect(page.getByTestId("scenario-demo-baseline-note")).toBeVisible();
    await expect(page.getByTestId("scenario-panel")).toContainText(
      DEMO_CONFIG.scenarioBaseline.wardId,
    );
    await expect(page.getByTestId("scenario-panel")).toContainText(
      DEMO_CONFIG.scenarioBaseline.originWeek,
    );

    const scenarioRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/scenario") && req.method() === "POST",
    );
    const scenarioResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/scenario") && res.request().method() === "POST",
    );

    await page.getByTestId("scenario-preset-120").click();

    const [scenarioReq, scenarioRes] = await Promise.all([
      scenarioRequestPromise,
      scenarioResponsePromise,
    ]);
    const sentBody = scenarioReq.postDataJSON() as {
      ward_id: string;
      origin_week: string;
      weather: { rainfall_mm?: number };
    };
    expect(sentBody.ward_id).toBe(DEMO_CONFIG.scenarioBaseline.wardId);
    expect(sentBody.origin_week).toBe(DEMO_CONFIG.scenarioBaseline.originWeek);
    expect(sentBody.weather.rainfall_mm).toBe(120);

    // Verify observed rainfall and non-Critical cases from the real API history
    const histRes = await request.get(
      `${apiBase}/api/v1/wards/${encodeURIComponent(sentBody.ward_id)}/history?start=${sentBody.origin_week}&end=${sentBody.origin_week}`,
    );
    expect(histRes.ok()).toBe(true);
    const histJson = (await histRes.json()) as {
      weeks: Array<{ week: string; rainfall_mm: number; dengue_cases: number }>;
    };
    expect(histJson.weeks).toHaveLength(1);
    const observed = histJson.weeks[0];
    expect(observed.rainfall_mm).toBeLessThan(20);
    expect(observed.dengue_cases).toBeLessThan(14);

    // Verify API response h=3 expected_cases strictly increases under 120 mm override
    const payload = (await scenarioRes.json()) as {
      baseline: Array<{ horizon: number; expected_cases: number }>;
      scenario: Array<{ horizon: number; expected_cases: number }>;
    };
    const baseH3 = payload.baseline.find((h) => h.horizon === 3);
    const scenH3 = payload.scenario.find((h) => h.horizon === 3);
    expect(baseH3).toBeDefined();
    expect(scenH3).toBeDefined();
    expect(scenH3!.expected_cases).toBeGreaterThan(baseH3!.expected_cases);

    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
  });

  test("ac_8: API 503 clears stale tier and recovers on Retry; unknown ward URL shows Ward not found", async ({
    page,
  }) => {
    // Load valid forecast first so we prove stale tier is cleared on subsequent 503
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    await page.route("**/api/v1/forecast", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "https://abhas.dev/problems/service-unavailable",
          title: "Forecast model unavailable",
          status: 503,
          detail: "Simulated 503 outage for AC-8 test",
          request_id: "e2e-503-rid",
        }),
      }),
    );

    // Change forecast window to trigger fresh request against failing API
    await page.getByTestId("window-1-4w").click();
    await expect(page.getByTestId("forecast-error-banner")).toBeVisible();
    await expect(page.getByTestId("forecast-error-banner")).toContainText("e2e-503-rid");
    await expect(page.getByTestId("forecast-retry")).toBeVisible();
    // Stale tier card must NOT remain visible
    await expect(page.getByTestId("peak-tier-card")).toHaveCount(0);

    // Unroute and click Retry to recover
    await page.unroute("**/api/v1/forecast");
    await page.getByTestId("forecast-retry").click();
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    // Unknown ward URL shows explicit "Ward not found" instead of blank chart
    await page.goto("/?ward=UNKNOWN_99");
    await expect(page.getByTestId("ward-not-found")).toBeVisible();
    await expect(page.getByTestId("ward-not-found")).toContainText("Ward not found");
    await expect(page.getByTestId("ward-not-found")).toContainText("UNKNOWN_99");
    await expect(page.getByTestId("peak-tier-card")).toHaveCount(0);
    await expect(page.getByTestId("forecast-chart")).toHaveCount(0);

    // Recovery action restores default Dhaka South ward
    await page.getByTestId("ward-not-found-reset").click();
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
  });

  test("ac_13: city heatmap renders ward x horizon matrix and schematic tile map disclaimer", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-heatmap").click();

    await expect(page.getByTestId("heatmap-panel")).toBeVisible();
    await expect(page.getByTestId("heatmap-matrix")).toBeVisible();
    await expect(page.getByTestId("heatmap-tile-map")).toBeVisible();
    await expect(page.getByTestId("heatmap-schematic-label")).toContainText(
      "schematic, ward geometry not in the dataset",
    );
    expect(await page.locator('[data-testid^="heatmap-cell-"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-testid^="heatmap-tile-"]').count()).toBeGreaterThan(0);
  });

  test("ac_14: validation tab renders baseline comparison, 80% coverage, confusion matrix, and /api/v1/ops metrics", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await page.getByTestId("tab-validation").click();

    await expect(page.getByTestId("validation-panel")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-chart")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-table")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-table")).toContainText("Abhas LightGBM");
    await expect(page.getByTestId("validation-metrics-table")).toContainText("Climatology");
    await expect(page.getByTestId("validation-coverage")).toBeVisible();
    await expect(page.getByTestId("validation-confusion")).toBeVisible();
    await expect(page.getByTestId("validation-ops-card")).toBeVisible();
    await expect(page.getByTestId("validation-ops-model-loads")).toHaveText("1");
  });

  test("ac_16: /brand renders tokens, risk scale & logo, and zero Lime appears inside [data-view='data']", async ({
    page,
  }) => {
    // Check /brand page
    await page.goto("/brand");
    await expect(page.getByRole("heading", { name: /Colour Palette/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /4-Tier Risk Scale/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Logo Lockups/i })).toBeVisible();

    // Check zero Lime inside [data-view="data"] across all 5 dashboard tabs
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-lags").click();
    await expect(page.getByTestId("lags-panel")).toBeVisible();
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-scenario").click();
    await page.getByTestId("scenario-preset-120").click();
    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("heatmap-panel")).toBeVisible();
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("validation-panel")).toBeVisible();
    await assertZeroLimeInDataView(page);
  });

  test("nfr_6: WCAG 2.2 AA axe scan has zero serious or critical violations across all views", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await assertWcagAA(page, "Ward Forecast (/?demo=1)");

    await page.getByTestId("tab-lags").click();
    await expect(page.getByTestId("lags-panel")).toBeVisible();
    await assertWcagAA(page, "Lags Panel");

    await page.getByTestId("tab-scenario").click();
    await page.getByTestId("scenario-preset-120").click();
    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
    await assertWcagAA(page, "What-If Scenario");

    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("heatmap-panel")).toBeVisible();
    await assertWcagAA(page, "City Heatmap");

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("validation-panel")).toBeVisible();
    await assertWcagAA(page, "Validation Tab");

    await page.goto("/brand");
    await expect(page.getByRole("heading", { name: /Colour Palette/i })).toBeVisible();
    await assertWcagAA(page, "Brand System (/brand)");
  });
});
