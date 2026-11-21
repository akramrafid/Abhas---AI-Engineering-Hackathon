import { expect, test, type Page } from "@playwright/test";
import { DEMO_CONFIG } from "../src/lib/demo-config";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

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
    await expect(page.getByTestId("peak-act-by")).toBeVisible();
    await expect(page.getByTestId("forecast-chart")).toBeVisible();

    await expect(page.getByTestId("horizon-row-2")).toBeVisible();
    await expect(page.getByTestId("horizon-row-3")).toBeVisible();
    await expect(page.getByTestId("horizon-row-4")).toBeVisible();

    await page.getByTestId("window-1-4w").click();
    await expect(page.getByTestId("horizon-row-1")).toBeVisible();

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

    await page.getByTestId("lag-btn-0").click();
    const sample = page.getByTestId("lag-shifted-sample");
    await expect(sample).toHaveAttribute("data-lag", "0");
    const caseWeek0 = await sample.getAttribute("data-case-week");
    const rainWeek0 = await sample.getAttribute("data-rain-source-week");
    expect(caseWeek0).toBeTruthy();
    expect(rainWeek0).toBe(caseWeek0);

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

    await page.getByTestId("scenario-rain-input").fill("600");
    await page.getByTestId("scenario-submit").click();
    await expect(page.getByTestId("scenario-validation-error")).toBeVisible();
    await expect(page.getByTestId("scenario-validation-error")).toContainText("0 and 500");
    await expect(page.getByTestId("scenario-comparison")).toHaveCount(0);

    await page.getByTestId("scenario-rain-input").fill("-15");
    await expect(page.getByTestId("scenario-validation-error")).toBeVisible();

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

    await page.getByTestId("window-1-4w").click();
    await expect(page.getByTestId("forecast-error-banner")).toBeVisible();
    await expect(page.getByTestId("forecast-error-banner")).toContainText("e2e-503-rid");
    await expect(page.getByTestId("forecast-retry")).toBeVisible();
    await expect(page.getByTestId("peak-tier-card")).toHaveCount(0);

    await page.unroute("**/api/v1/forecast");
    await page.getByTestId("forecast-retry").click();
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    await page.goto("/?ward=UNKNOWN_99");
    await expect(page.getByTestId("ward-not-found")).toBeVisible();
    await expect(page.getByTestId("ward-not-found")).toContainText("Ward not found");
    await expect(page.getByTestId("ward-not-found")).toContainText("UNKNOWN_99");
    await expect(page.getByTestId("peak-tier-card")).toHaveCount(0);
    await expect(page.getByTestId("forecast-chart")).toHaveCount(0);

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
    await expect(page.getByTestId("validation-split-timeline")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-chart")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-table")).toBeVisible();
    await expect(page.getByTestId("validation-metrics-table")).toContainText("Abhas LightGBM");
    await expect(page.getByTestId("validation-metrics-table")).toContainText("Climatology");
    await expect(page.getByTestId("validation-coverage")).toBeVisible();
    await expect(page.getByTestId("validation-confusion")).toBeVisible();
    await expect(page.getByTestId("validation-ops-card")).toBeVisible();
    await expect(page.getByTestId("validation-ops-model-loads")).toHaveText("1");
  });

  test("test_cr_9_stub_data_banner: shows sample-data banner for stub model_version and hides it for real models", async ({
    page,
  }) => {
    let forcedVersion = "stub-0";

    const overrideModelVersion = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      json.model_version = forcedVersion;
      await route.fulfill({ response, json });
    };

    await page.route("**/api/v1/forecast", overrideModelVersion);
    await page.route("**/api/v1/heatmap*", overrideModelVersion);
    await page.route("**/api/v1/validation", overrideModelVersion);

    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("stub-data-banner")).toContainText(
      "Sample data — model not loaded",
    );
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("stub-data-banner")).toContainText(
      "Sample data — model not loaded",
    );
    await assertZeroLimeInDataView(page);

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("stub-data-banner")).toContainText(
      "Sample data — model not loaded",
    );
    await assertZeroLimeInDataView(page);

    forcedVersion = "lgbm-v1.0.0";
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("stub-data-banner")).toHaveCount(0);

    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("stub-data-banner")).toHaveCount(0);

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("stub-data-banner")).toHaveCount(0);

    await page.unroute("**/api/v1/forecast", overrideModelVersion);
    await page.unroute("**/api/v1/heatmap*", overrideModelVersion);
    await page.unroute("**/api/v1/validation", overrideModelVersion);
  });

  test("ac_16: /brand renders tokens, risk scale & logo, and zero Lime appears inside [data-view='data']", async ({
    page,
  }) => {
    await page.goto("/brand");
    await expect(page.getByRole("heading", { name: /Colour Palette/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /4-Tier Risk Scale/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Logo Lockups/i })).toBeVisible();

    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await assertZeroLimeInDataView(page);

    for (const [tabId, panelId] of [
      ["tab-lags", "lags-panel"],
      ["tab-heatmap", "heatmap-panel"],
      ["tab-priority", "priority-panel"],
      ["tab-validation", "validation-panel"],
      ["tab-about", "about-panel"],
    ] as const) {
      await page.getByTestId(tabId).click();
      await expect(page.getByTestId(panelId)).toBeVisible();
      await assertZeroLimeInDataView(page);
    }

    await page.getByTestId("tab-scenario").click();
    await page.getByTestId("scenario-preset-120").click();
    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
    await assertZeroLimeInDataView(page);
  });

  test("nfr_6 / test_cr_18_wcag_aa: WCAG 2.2 A/AA axe scan has zero violations of any impact across all views", async ({
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

    await page.getByTestId("tab-priority").click();
    await expect(page.getByTestId("priority-panel")).toBeVisible();
    await assertWcagAA(page, "Priority List");

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("validation-panel")).toBeVisible();
    await assertWcagAA(page, "Validation Tab");

    await page.getByTestId("tab-about").click();
    await expect(page.getByTestId("about-panel")).toBeVisible();
    await assertWcagAA(page, "About & Cost Tab");

    await page.goto("/brand");
    await expect(page.getByRole("heading", { name: /Colour Palette/i })).toBeVisible();
    await assertWcagAA(page, "Brand System (/brand)");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await assertWcagAA(page, "Ward Forecast (375px mobile)");
  });

  test("test_design_hook_ward_list_no_side_tab_border: selected ward row uses subtle brand highlight without thick one-side accent border", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    const list = page.getByTestId("ward-priority-list");
    await expect(list).toBeVisible();

    const selectedRow = list.locator('button[aria-current="true"]');
    await expect(selectedRow).toHaveCount(1);

    const styles = await selectedRow.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        borderLeftWidth: parseFloat(cs.borderLeftWidth),
        borderRightWidth: parseFloat(cs.borderRightWidth),
        borderTopWidth: parseFloat(cs.borderTopWidth),
        borderBottomWidth: parseFloat(cs.borderBottomWidth),
        backgroundColor: cs.backgroundColor,
      };
    });

    expect(styles.borderLeftWidth).toBeLessThanOrEqual(1);
    expect(styles.borderRightWidth).toBeLessThanOrEqual(1);
    expect(styles.borderTopWidth).toBeLessThanOrEqual(1);
    expect(styles.borderBottomWidth).toBeLessThanOrEqual(1);

    const unselectedRow = list.locator("button:not([aria-current])").first();
    if ((await unselectedRow.count()) > 0) {
      const unselectedBg = await unselectedRow.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      expect(styles.backgroundColor).not.toBe(unselectedBg);
    }
  });
});
