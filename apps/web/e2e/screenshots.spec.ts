import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT_DIR = path.resolve(__dirname, "../../../docs/ux/screenshots");

test.describe("UX Screenshots Capture (1280x720 & 375x812)", () => {
  test.skip(
    process.env.CAPTURE_SCREENSHOTS !== "1",
    "Set CAPTURE_SCREENSHOTS=1 to capture screenshots into docs/ux/screenshots/",
  );

  test("capture_all_console_screenshots", async ({ page }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("advisory-panel")).toBeVisible();
    await expect(page.getByTestId("advisory-headline")).not.toBeEmpty();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(OUT_DIR, "dashboard.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-lags").click();
    await expect(page.getByTestId("lags-series-chart")).toBeVisible();
    await expect(page.getByTestId("lags-corr-chart")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "lags.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-scenario").click();
    await page.getByTestId("scenario-preset-120").click();
    await expect(page.getByTestId("scenario-comparison")).toBeVisible();
    await expect(page.getByTestId("scenario-chart")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "scenario.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-heatmap").click();
    await expect(page.getByTestId("heatmap-matrix")).toBeVisible();
    await expect(page.getByTestId("heatmap-tile-map")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "heatmap.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-priority").click();
    await expect(page.getByTestId("priority-table")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "priority.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("validation-metrics-chart")).toBeVisible();
    await expect(page.getByTestId("validation-ops-card")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "validation.png"),
      fullPage: true,
    });

    await page.getByTestId("tab-about").click();
    await expect(page.getByTestId("about-ops-card")).toBeVisible();
    await expect(page.getByTestId("about-model-card")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, "about.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("advisory-headline")).not.toBeEmpty();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(OUT_DIR, "mobile-dashboard.png"),
      fullPage: true,
    });
  });
});
