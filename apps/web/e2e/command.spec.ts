import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 2 Command Center (WP5-1..WP5-6)", () => {
  test("walks all 5 operational steps, re-solves allocation live, switches EN/BN dispatch, saves/compares plans, zero Lime & WCAG AA clean", async ({
    page,
  }) => {
    await page.goto("/dashboard?demo=1&tab=command");
    await expect(page.getByTestId("command-center-view")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("command-provenance-strip")).toBeVisible();
    await expect(page.getByTestId("provenance-model-version")).not.toHaveText("—");
    await expect(page.getByTestId("provenance-git-sha")).not.toHaveText("—");
    await expect(page.getByTestId("provenance-data-as-of")).toHaveText("2025-12-29");

    // Step 2: Allocation — switch stock preset from 100% to 60% and confirm live re-solve
    await page.getByTestId("command-step-2").click();
    await expect(page.getByTestId("command-panel-2")).toBeVisible();
    await expect(page.getByTestId("equity-floor-badge")).toContainText("20%");
    await page.getByTestId("stock-preset-60").click();
    await expect(page.getByTestId("allocation-live-status")).toContainText("stock 60%", {
      timeout: 15_000,
    });

    // Save Plan A (allocation 60%)
    await page.getByTestId("save-plan-label-input").fill("E2E Alloc 60pct");
    await page.getByTestId("save-plan-btn").click();
    await expect(page.getByTestId("save-plan-status")).toContainText("E2E Alloc 60pct", {
      timeout: 15_000,
    });

    // Step 3: Overflow Routing
    await page.getByTestId("command-step-3").click();
    await expect(page.getByTestId("route-city-summaries")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("overflow-ward-table")).toBeVisible();

    // Save Plan B (overflow)
    await page.getByTestId("save-plan-label-input").fill("E2E Overflow h3");
    await page.getByTestId("save-plan-btn").click();
    await expect(page.getByTestId("save-plan-status")).toContainText("E2E Overflow h3", {
      timeout: 15_000,
    });

    // Compare plans drawer
    await page.getByTestId("compare-plans-btn").click();
    await expect(page.getByTestId("plan-compare-drawer")).toBeVisible();
    await page.getByTestId("close-compare-drawer").click();
    await expect(page.getByTestId("plan-compare-drawer")).toBeHidden();

    // Step 4: Counterfactual Simulator
    await page.getByTestId("command-step-4").click();
    await expect(page.getByTestId("command-panel-4")).toBeVisible();
    await expect(page.getByTestId("sim-assumption-note")).toBeVisible();
    await expect(page.getByTestId("sim-totals")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("sim-sensitivity-band")).toBeVisible();
    await expect(page.getByTestId("sim-roi-table")).toBeVisible();
    await page.getByTestId("sim-mode-auto").click();
    await expect(page.getByTestId("sim-auto-crews-input")).toBeVisible();
    await expect(page.getByTestId("sim-roi-table")).toBeVisible({ timeout: 15_000 });

    // Step 5: Multi-channel Dispatch (EN -> BN switch)
    await page.getByTestId("command-step-5").click();
    await expect(page.getByTestId("command-panel-5")).toBeVisible();
    await expect(page.getByTestId("command-panel-5")).toContainText("GSM-7", { timeout: 15_000 });
    await page.getByTestId("dispatch-lang-bn").click();
    await expect(page.getByTestId("command-panel-5")).toContainText("UCS-2", { timeout: 15_000 });

    // Strict Zero-Lime check inside [data-view="data"]
    const limeHits = await page.evaluate(() => {
      const root = document.querySelector('[data-view="data"]');
      if (!root) return -1;
      let hits = 0;
      for (const el of root.querySelectorAll("*")) {
        const style = window.getComputedStyle(el);
        for (const prop of ["color", "backgroundColor", "borderColor"] as const) {
          if (style[prop] === "rgb(212, 245, 60)") hits++;
        }
      }
      return hits;
    });
    expect(limeHits).toBe(0);

    // WCAG 2.2 AA accessibility check on Command Center workspace
    const axe = await new AxeBuilder({ page })
      .include('[data-view="data"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
  });
});
