import { expect, test } from "@playwright/test";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("Landing page", () => {
  test("hero states the promise and links to the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rain today.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Act now.");
    const cta = page.getByTestId("hero-cta");
    await expect(cta).toHaveAttribute("href", "/dashboard?demo=1");
    await expect(page.getByTestId("ward-risk-map")).toBeVisible();
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
