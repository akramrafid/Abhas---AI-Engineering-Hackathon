import { expect, test } from "@playwright/test";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("Landing page", () => {
  test("hero states the promise and links to the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know which wards will rise");
    await expect(page.getByText("Act now.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("landing-forecast-card")).toContainText(/expected cases · range \d+–\d+/);
    const cta = page.getByTestId("hero-cta");
    await expect(cta).toHaveAttribute("href", "/dashboard?demo=1");
    await expect(page.getByTestId("hero-ward-map")).toBeVisible();
  });

  test("live ward ticker lists forecast wards with tiers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ward-marquee")).toContainText(/Ward \d+/);
  });

  test("rain clock places all 60 wards and recolours them by forecast tier", async ({ page }) => {
    await page.goto("/");
    const map = page.getByTestId("ward-risk-map");
    await expect(map).toHaveAttribute("data-map-mode", "rain");
    await page.locator("#step-h3").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById("step-h3")?.scrollIntoView({ block: "center" }));
    await expect(map).toHaveAttribute("data-map-mode", "risk");
    // The spotlight panel quotes the model's expected cases and the observed count for Ward 4.
    await expect(page.locator("#step-h3")).toContainText(/\d+\.\d expected cases/);
    await expect(page.locator("#step-h3")).toContainText(/\d+ were recorded/);
  });

  test("evidence section shows live hold-out validation from the API", async ({ page }) => {
    await page.goto("/#proof");
    await expect(page.getByRole("heading", { name: "Locked hold-out: 2024 and 2025" })).toBeVisible();
    await expect(page.locator("#proof table tbody tr")).toHaveCount(4);
    await expect(page.locator("#proof")).toContainText(/misses by \d\.\d\d cases/);
  });

  test("old dashboard links redirect to /dashboard", async ({ page }) => {
    await page.goto("/?demo=1&tab=priority");
    await expect(page).toHaveURL(/\/dashboard\?demo=1&tab=priority/);
    await expect(page.getByTestId("priority-panel")).toBeVisible();
  });

  test("landing page has zero WCAG 2.2 A/AA violations", async ({ page }) => {
    // Scan the settled page: entrance tweens fade text in, and axe would flag mid-fade contrast.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByTestId("hero-cta")).toBeVisible();
    await assertWcagAA(page, "Landing page");
  });
});

test.describe("Dashboard risk map", () => {
  test("map tab shows every ward and the ledger selects a ward", async ({ page }) => {
    await page.goto("/dashboard?demo=1&tab=map");
    await expect(page.getByTestId("risk-map-view")).toBeVisible();
    await expect(page.getByTestId("ward-risk-map")).toBeVisible();
    const ledger = page.getByTestId("risk-map-ledger").locator("button");
    await expect(ledger.first()).toBeVisible();
    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Risk Map tab");

    await page.getByTestId("risk-map-view-chattogram").click();
    await expect(page.getByTestId("risk-map-ledger")).toContainText("Chattogram");

    await ledger.first().click();
    await expect(page.getByTestId("tab-ward-risk")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/ward=CCC_Ward_\d+/);
  });
});

test.describe("Dashboard shell", () => {
  test("search jumps to a ward, alerts list wards, theme toggles, CSV exports", async ({ page }) => {
    await page.goto("/dashboard?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("stat-tiles")).toContainText("Wards Critical");

    await page.keyboard.press("Control+k");
    const search = page.getByTestId("search-dialog");
    await expect(search).toBeVisible();
    await page.keyboard.type("ward 4 chattogram");
    await page.keyboard.press("Enter");
    await expect(search).toBeHidden();
    await expect(page).toHaveURL(/ward=CCC_Ward_04/);

    await page.getByTestId("open-alerts").click();
    const alerts = page.getByTestId("alerts-dialog");
    await expect(alerts).toContainText(/wards reach High or Critical/);
    await page.keyboard.press("Escape");
    await expect(alerts).toBeHidden();

    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("[data-theme=dark]")).toHaveCount(1);
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("[data-theme=light]")).toHaveCount(1);

    const download = page.waitForEvent("download");
    await page.getByTestId("export-csv").click();
    expect((await download).suggestedFilename()).toMatch(/^abhas-forecasts-2024-08-05-2-4w\.csv$/);
  });
});
