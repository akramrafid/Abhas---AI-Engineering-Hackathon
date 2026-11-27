import { expect, test } from "@playwright/test";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("WP8 Nearest Bed & Ambulance Control-Room View (ADR-0018)", () => {
  test("geolocation Dhaka ranks Dhaka hospital #1 without ever sending user GPS to the API", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 23.75, longitude: 90.39 },
      permissions: ["geolocation"],
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    const leakedGpsRequests: string[] = [];
    page.on("request", (req) => {
      const urlAndBody = `${req.url()} ${req.postData() ?? ""}`;
      if (urlAndBody.includes("23.75") || urlAndBody.includes("90.39")) {
        leakedGpsRequests.push(req.url());
      }
    });

    await page.goto("/dashboard?demo=1&tab=nearest-bed&lang=en");
    await expect(page.getByTestId("nearest-bed-view")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("facilities-demo-banner")).toContainText("Demo bed data");
    await expect(page.getByTestId("call-999-primary")).toHaveAttribute("href", "tel:999");
    await expect(page.getByTestId("location-source-badge")).toContainText("Browser GPS active", {
      timeout: 15_000,
    });

    const firstCard = page.getByTestId("hospital-card-1");
    await expect(firstCard).toBeVisible();
    const firstCity = await firstCard.getAttribute("data-hospital-city");
    expect(firstCity).toMatch(/Dhaka/);
    await expect(firstCard).toContainText("estimate");

    expect(leakedGpsRequests, "User GPS coordinates must NEVER be sent to any API").toEqual([]);
    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Nearest Bed Dhaka Geolocation");
    await context.close();
  });

  test("geolocation Chattogram ranks Chattogram hospital #1", async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 22.3569, longitude: 91.7832 },
      permissions: ["geolocation"],
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/dashboard?demo=1&tab=nearest-bed&lang=en");
    await expect(page.getByTestId("nearest-bed-view")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("location-source-badge")).toContainText("Browser GPS active", {
      timeout: 15_000,
    });

    const firstCard = page.getByTestId("hospital-card-1");
    await expect(firstCard).toBeVisible();
    expect(await firstCard.getAttribute("data-hospital-city")).toBe("Chattogram");
    await context.close();
  });

  test("geolocation denied falls back to city picker, logs ambulance request, and updates manager bed board", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: [],
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/dashboard?demo=1&tab=nearest-bed&lang=en");
    await expect(page.getByTestId("nearest-bed-view")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("geolocate-btn").click();
    await expect(page.getByTestId("geo-fallback-notice")).toBeVisible({ timeout: 10_000 });

    // Switch fallback city to Chattogram -> top ranked card updates to Chattogram
    await page.getByTestId("location-city-select").selectOption("Chattogram");
    await expect(page.getByTestId("hospital-card-1")).toHaveAttribute(
      "data-hospital-city",
      "Chattogram",
    );

    // Log a control-room ambulance request (zero patient PII)
    await page.getByTestId("amb-note-input").fill("Unit 7 en route — dengue triage");
    await page.getByTestId("amb-submit-btn").click();
    await expect(page.getByTestId("amb-status-msg")).toContainText("Logged request", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("ambulance-request-log")).toContainText("Unit 7 en route");

    // Bed board without manager toggle fails cleanly with 403; enabling manager role succeeds
    await page.getByTestId("board-free-input").fill("6");
    await page.getByTestId("board-total-input").fill("22");
    await page.getByTestId("board-submit-btn").click();
    await expect(page.getByTestId("board-feedback-msg")).toContainText(/manager/i, {
      timeout: 10_000,
    });

    await page.getByTestId("manager-role-toggle").check();
    await page.getByTestId("board-submit-btn").click();
    await expect(page.getByTestId("board-feedback-msg")).toContainText("source: board", {
      timeout: 15_000,
    });

    await context.close();
  });

  test("mobile 375px layout in Bangla has zero horizontal overflow, zero Lime, and passes WCAG AA", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/dashboard?demo=1&tab=nearest-bed&lang=bn");
    await expect(page.getByTestId("nearest-bed-view")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("call-999-primary")).toContainText("৯৯৯");
    await expect(page.getByTestId("facilities-demo-banner")).toContainText("ডেমো");

    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowPx, "375px mobile viewport must not overflow horizontally").toBeLessThanOrEqual(2);

    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Nearest Bed Mobile 375px BN");
    await context.close();
  });
});
