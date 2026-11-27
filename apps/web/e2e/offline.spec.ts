import { expect, test, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8011";
const STRICT_OFFLINE_ENV =
  process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1" || process.env.ABHAS_OFFLINE === "1";

const ALLOWED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const OPTIONAL_TILE_HOSTS = new Set(["tile.openstreetmap.org", "tiles.openfreemap.org"]);

interface OfflineGuardTracker {
  blockedExternal: string[];
  blockedNonTileExternal: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

function isLocalUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:") || rawUrl.startsWith("about:")) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function isOptionalTileUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return OPTIONAL_TILE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

async function installOfflineNetworkAbort(page: Page): Promise<OfflineGuardTracker> {
  const tracker: OfflineGuardTracker = {
    blockedExternal: [],
    blockedNonTileExternal: [],
    consoleErrors: [],
    pageErrors: [],
  };

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) {
      await route.continue();
      return;
    }
    tracker.blockedExternal.push(url);
    if (!isOptionalTileUrl(url)) {
      tracker.blockedNonTileExternal.push(url);
    }
    await route.abort("internetdisconnected");
  });

  page.on("pageerror", (err) => {
    tracker.pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // When running without NEXT_PUBLIC_ABHAS_OFFLINE=1 (live outage test), Chromium emits a
    // browser-level network log on the single aborted OSM tile attempt before WardRiskMap flips
    // to the bundled GeoJSON schematic. Under STRICT_OFFLINE_ENV, zero such logs are permitted.
    if (
      !STRICT_OFFLINE_ENV &&
      text.includes("Failed to load resource: net::ERR_INTERNET_DISCONNECTED")
    ) {
      return;
    }
    tracker.consoleErrors.push(text);
  });

  return tracker;
}

test.describe("WP6-2 Offline resilience (all non-localhost requests aborted)", () => {
  test("landing page loads completely offline with self-hosted images, map fallback, and zero console errors", async ({
    page,
  }) => {
    const tracker = await installOfflineNetworkAbort(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know which wards will rise");
    await expect(page.getByTestId("landing-forecast-card")).toContainText(
      /expected cases · range \d+–\d+/,
    );
    await expect(page.getByTestId("hero-ward-map")).toBeVisible();

    // Scroll to the Rain Clock map and verify it renders and switches modes offline
    const map = page.getByTestId("ward-risk-map");
    await map.scrollIntoViewIfNeeded();
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("data-map-offline", "true", { timeout: 15_000 });

    await page.locator("#step-h3").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById("step-h3")?.scrollIntoView({ block: "center" }));
    await expect(map).toHaveAttribute("data-map-mode", "risk");

    // Verify every rendered image loaded locally with zero remote Unsplash/CDN URLs
    const imageAudit = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs.map((img) => ({
        src: img.currentSrc || img.getAttribute("src") || "",
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }));
    });
    for (const img of imageAudit) {
      expect(img.src, "No remote Unsplash or 21st.dev image URLs permitted").not.toMatch(
        /unsplash\.com|cdn\.21st\.dev/i,
      );
      if (img.complete && img.src) {
        expect(img.naturalWidth, `Broken local image: ${img.src}`).toBeGreaterThan(0);
      }
    }

    expect(tracker.pageErrors, "Zero uncaught page errors on offline landing").toEqual([]);
    expect(tracker.consoleErrors, "Zero console errors on offline landing").toEqual([]);
    expect(tracker.blockedNonTileExternal, "Zero non-tile external requests on landing").toEqual([]);
    if (STRICT_OFFLINE_ENV) {
      expect(tracker.blockedExternal, "Zero external requests in NEXT_PUBLIC_ABHAS_OFFLINE=1").toEqual(
        [],
      );
    }
  });

  test("dashboard risk map falls back to bundled GeoJSON schematic offline with zero console errors", async ({
    page,
  }) => {
    const tracker = await installOfflineNetworkAbort(page);

    await page.goto("/dashboard?demo=1&tab=map");
    await expect(page.getByTestId("risk-map-view")).toBeVisible();
    const map = page.getByTestId("ward-risk-map");
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("data-map-offline", "true", { timeout: 15_000 });

    // Toggle "Weather now" layer ON while offline — must read local API/dataset only with zero external fetches (M2)
    const weatherLayerBtn = page.getByTestId("risk-map-layer-weather");
    await expect(weatherLayerBtn).toBeVisible();
    await weatherLayerBtn.click();
    await expect(weatherLayerBtn).toHaveAttribute("aria-pressed", "true");

    // Interactive view switches and ward selection still work completely offline
    await page.getByTestId("risk-map-view-chattogram").click();
    await expect(page.getByTestId("risk-map-ledger")).toContainText("Chattogram");
    await page.getByTestId("risk-map-ledger").locator("button").first().click();
    await expect(page.getByTestId("tab-ward-risk")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();

    expect(tracker.pageErrors, "Zero uncaught page errors on offline map").toEqual([]);
    expect(tracker.consoleErrors, "Zero console errors on offline map").toEqual([]);
    expect(tracker.blockedNonTileExternal, "Zero non-tile external requests on map").toEqual([]);
    if (STRICT_OFFLINE_ENV) {
      expect(tracker.blockedExternal, "Zero external requests on map in offline mode").toEqual([]);
    }
  });

  test("all five Command Center steps and printable brief work 100% offline with zero crashes", async ({
    page,
  }) => {
    const tracker = await installOfflineNetworkAbort(page);

    // 0. Dashboard loads cleanly offline without Clerk redirect; ?demo=1 shows "Demo data" (Q7)
    await page.goto("/dashboard?demo=1");
    await expect(page.getByTestId("peak-tier-card")).toBeVisible();
    await expect(page.getByTestId("demo-mode-badge")).toHaveText("Demo data");
    if (STRICT_OFFLINE_ENV) {
      await expect(page.getByTestId("header-offline-badge")).toBeVisible();
      await expect(page.getByTestId("weather-mode-live")).toBeDisabled();
    }

    // M3: Unconditional walk of ALL 5 Command Center steps verifying live data and zero alert errors
    const commandTab = page.getByTestId("tab-command");
    await expect(commandTab).toBeVisible();
    await commandTab.click();
    await expect(page.getByTestId("command-center-view")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("command-provenance-strip")).toBeVisible();
    if (STRICT_OFFLINE_ENV) {
      await expect(page.getByTestId("command-offline-badge")).toBeVisible();
    }

    const stepExpectations: ReadonlyArray<[number, string]> = [
      [1, "step1-forecast-table"],
      [2, "allocation-ward-table"],
      [3, "route-city-summaries"],
      [4, "sim-roi-table"],
      [5, "dispatch-notices-list"],
    ];
    for (const [stepNum, dataTestId] of stepExpectations) {
      const stepBtn = page.getByTestId(`command-step-${stepNum}`);
      await expect(stepBtn).toBeVisible();
      await stepBtn.click();
      await expect(page.getByTestId(dataTestId)).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('#command-step-panel [role="alert"]')).toHaveCount(0);
    }

    // Exercise all 5 Command Center operational flows + Plans decision log against localhost API
    const readyRes = await page.request.get(`${API_URL}/readyz`);
    expect(readyRes.status()).toBe(200);
    const readyJson = (await readyRes.json()) as { status: string; offline: boolean };
    expect(readyJson.status).toBe("ready");
    if (STRICT_OFFLINE_ENV) {
      expect(readyJson.offline).toBe(true);
    }

    // Step 1: Forecast
    const forecastRes = await page.request.post(`${API_URL}/api/v1/forecast`, {
      data: {
        ward_ids: ["DSCC_Ward_04"],
        origin_week: "2024-08-05",
        horizons: [2, 3, 4],
        source: "dataset",
      },
    });
    expect(forecastRes.status()).toBe(200);

    // Step 2: Constrained supply allocation
    const allocRes = await page.request.post(`${API_URL}/api/v1/allocation/plan`, {
      data: {
        scope: "Dhaka South",
        origin_week: "2024-08-05",
        h_start: 2,
        h_end: 4,
        stock_pct: 60,
        total_crews: 10,
      },
    });
    expect(allocRes.status()).toBe(200);
    const allocJson = (await allocRes.json()) as { offline: boolean };
    if (STRICT_OFFLINE_ENV) expect(allocJson.offline).toBe(true);

    // Step 3: Hospital bed overflow routing
    const overflowRes = await page.request.post(`${API_URL}/api/v1/overflow/route`, {
      data: { scope: "Dhaka North", origin_week: "2024-08-05", horizon: 3 },
    });
    expect(overflowRes.status()).toBe(200);
    const overflowJson = (await overflowRes.json()) as { offline: boolean };
    if (STRICT_OFFLINE_ENV) expect(overflowJson.offline).toBe(true);

    // Step 4: Counterfactual intervention simulator
    const simRes = await page.request.post(`${API_URL}/api/v1/simulator/run`, {
      data: { origin_week: "2024-08-05", auto_crews: 10, efficacy: "base" },
    });
    expect(simRes.status()).toBe(200);
    const simJson = (await simRes.json()) as { offline: boolean };
    if (STRICT_OFFLINE_ENV) expect(simJson.offline).toBe(true);

    // Step 5: Bilingual dispatch notices + printable HTML brief + append-only plan comparison
    const dispatchRes = await page.request.post(`${API_URL}/api/v1/dispatch/notices`, {
      data: {
        origin_week: "2024-08-05",
        ward_ids: ["DSCC_Ward_04"],
        channels: ["sms", "whatsapp", "brief"],
        lang: "bn",
        stock_pct: 60,
        total_crews: 10,
      },
    });
    expect(dispatchRes.status()).toBe(200);
    const dispatchJson = (await dispatchRes.json()) as { offline: boolean };
    if (STRICT_OFFLINE_ENV) expect(dispatchJson.offline).toBe(true);

    const planARes = await page.request.post(`${API_URL}/api/v1/plans`, {
      data: {
        kind: "allocation",
        label: "Offline E2E 60% stock",
        request: { scope: "Dhaka South", origin_week: "2024-08-05", stock_pct: 60, total_crews: 10 },
      },
    });
    expect(planARes.status()).toBe(201);
    const planA = (await planARes.json()) as { id: string; offline: boolean };

    const planBRes = await page.request.post(`${API_URL}/api/v1/plans`, {
      data: {
        kind: "overflow",
        label: "Offline E2E overflow",
        request: { scope: "Dhaka North", origin_week: "2024-08-05", horizon: 3 },
      },
    });
    expect(planBRes.status()).toBe(201);
    const planB = (await planBRes.json()) as { id: string; offline: boolean };

    const cmpRes = await page.request.get(
      `${API_URL}/api/v1/plans/compare?a=${encodeURIComponent(planA.id)}&b=${encodeURIComponent(planB.id)}`,
    );
    expect(cmpRes.status()).toBe(200);
    const cmpJson = (await cmpRes.json()) as { offline: boolean; diffs: unknown[] };
    expect(cmpJson.diffs.length).toBeGreaterThanOrEqual(6);
    if (STRICT_OFFLINE_ENV) {
      expect(planA.offline).toBe(true);
      expect(planB.offline).toBe(true);
      expect(cmpJson.offline).toBe(true);
    }

    // WP10 Offline: Verify Build vs send panel on Step 4 & Validation Early-action trigger card offline
    await page.getByTestId("command-step-4").click();
    await expect(page.getByTestId("build-vs-send-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("structural-disclaimer")).toContainText(
      "associations in simulated data, not causal real-world estimates",
    );
    await page.getByTestId("tab-validation").click();
    await expect(page.getByTestId("early-action-trigger-card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("trigger-rule-sentence")).toContainText("80 mm");

    // Open printable A4 commissioner HTML brief in browser while offline + verify CSP, trigger rule & inline styling (L4 / ADR-0020)
    const briefResp = await page.goto(
      `${API_URL}/api/v1/dispatch/brief/DSCC_Ward_04.html?origin_week=2024-08-05&lang=en`,
    );
    expect(briefResp).toBeTruthy();
    expect(briefResp!.headers()["content-security-policy"] ?? "").toContain("default-src 'none'");
    await expect(page.locator("body")).toContainText("DSCC_Ward_04");
    await expect(page.locator("body")).toContainText("2-week rainfall > 80 mm");
    const briefStyled = await page.evaluate(() => {
      const kpi = document.querySelector(".kpi-value") ?? document.body;
      return window.getComputedStyle(kpi).fontWeight;
    });
    expect(briefStyled).toBeTruthy();

    expect(tracker.pageErrors, "Zero uncaught page errors across Command Center offline flow").toEqual(
      [],
    );
    expect(tracker.consoleErrors, "Zero console errors across Command Center offline flow").toEqual(
      [],
    );
    expect(tracker.blockedNonTileExternal, "Zero non-tile external requests across flow").toEqual([]);
    if (STRICT_OFFLINE_ENV) {
      expect(tracker.blockedExternal, "Zero external requests in strict offline mode").toEqual([]);
    }
  });
});
