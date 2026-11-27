import { expect, test } from "@playwright/test";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("Phase 2 Command Center (WP5-1..WP5-6)", () => {
  test("walks all 5 operational steps, re-solves allocation live, switches EN/BN dispatch, saves/compares plans, zero Lime & WCAG AA clean", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?demo=1&tab=command&lang=en");
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

    // Compare plans drawer (L9: role="dialog", aria-modal="true", scope in selector, axe 0)
    await page.getByTestId("compare-plans-btn").click();
    const drawer = page.getByTestId("plan-compare-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("compare-select-a")).toContainText(/all|Dhaka/i, {
      timeout: 15_000,
    });
    await assertWcagAA(page, "Plan Compare Drawer");
    await page.getByTestId("close-compare-drawer").click();
    await expect(drawer).toBeHidden();

    // Step 4: Counterfactual Simulator
    await page.getByTestId("command-step-4").click();
    await expect(page.getByTestId("command-panel-4")).toBeVisible();
    await expect(page.getByTestId("sim-assumption-note")).toBeVisible();
    await expect(page.getByTestId("sim-totals")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("sim-sensitivity-band")).toBeVisible();
    await expect(page.getByTestId("sim-roi-table")).toBeVisible();
    await page.getByTestId("sim-mode-auto").click();
    await expect(page.getByTestId("sim-auto-crews-input")).toBeVisible();
    await expect(page.getByTestId("sim-auto-crews-slider")).toHaveAttribute("max", "300");
    await expect(page.getByTestId("sim-roi-table")).toBeVisible({ timeout: 15_000 });

    // Step 5: Multi-channel Dispatch (EN -> BN switch)
    await page.getByTestId("command-step-5").click();
    await expect(page.getByTestId("command-panel-5")).toBeVisible();
    await expect(page.getByTestId("command-panel-5")).toContainText("GSM-7", { timeout: 15_000 });
    await page.getByTestId("dispatch-lang-bn").click();
    await expect(page.getByTestId("command-panel-5")).toContainText("UCS-2", { timeout: 15_000 });

    // Strict Zero-Lime check via shared helper (L11) & WCAG 2.2 AA check
    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Command Center Step 5");
  });

  test("AC-WP5-2b & AC-WP5-2c: route empty state is truthful on peak week and shoulder week shows live transfers", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?demo=1&tab=command&origin=2024-08-05&step=3&lang=en");
    await expect(page.getByTestId("route-city-summaries")).toBeVisible({ timeout: 20_000 });

    // Truthful shortage copy (H2) — never claim capacity is fine when unroutable > 0
    const sankey = page.getByTestId("overflow-sankey");
    await expect(sankey).toContainText("No free beds anywhere in Dhaka North");
    await expect(sankey).toContainText("21");
    await expect(sankey).not.toContainText("within bed capacity");

    // City card honesty (Q5): Beds filled after, Demand / capacity, patients without a bed
    const dnccCard = page.getByTestId("route-city-card-Dhaka North");
    await expect(dnccCard).toContainText("Beds filled after");
    await expect(dnccCard).toContainText("Demand / capacity");
    await expect(dnccCard).toContainText("21 patients without a bed");
    await assertWcagAA(page, "Command Step 3 (peak shortage)");

    // AC-WP5-2c: Shoulder week preset (2024-08-12, h=3) shows transfers AND remaining shortage
    await page.getByTestId("route-shoulder-week-btn").click();
    await expect(page.getByTestId("overflow-transfer-table")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="overflow-transfer-table"] tbody tr').first()).toBeVisible();
    await expect(page.getByTestId("route-city-summaries")).toContainText(/patients without a bed/);
    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Command Step 3 (shoulder week transfers)");
  });

  test("AC-WP5-bn: every Command Center step renders complete Bangla copy and passes WCAG AA", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?demo=1&tab=command&lang=bn");
    await expect(page.getByTestId("command-center-view")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("provenance-model-version")).not.toHaveText("—", {
      timeout: 20_000,
    });

    const englishDenyList = [
      "Routing horizon",
      "Planned bed quantile",
      "Placement mode",
      "Efficacy preset",
      "Available Regional Stock",
      "Active solution",
      "Utilisation after",
      "Beds filled after",
      "Compare saved plans",
    ];
    const stepChecks: ReadonlyArray<[number, string]> = [
      [1, "step1-forecast-table"],
      [2, "allocation-ward-table"],
      [3, "route-city-summaries"],
      [4, "sim-roi-table"],
      [5, "dispatch-notices-list"],
    ];

    for (const [stepNum, readyTestId] of stepChecks) {
      await page.getByTestId(`command-step-${stepNum}`).click();
      await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 20_000 });

      const headingText = await page.locator("#command-step-panel h2, #command-step-panel h3").first().innerText();
      expect(headingText, `Step ${stepNum} heading must contain Bangla characters`).toMatch(
        /[\u0980-\u09FF]/,
      );

      const panelText = await page.locator("#command-step-panel").innerText();
      for (const forbidden of englishDenyList) {
        expect(panelText, `Step ${stepNum} leaked English label "${forbidden}" in BN mode`).not.toContain(
          forbidden,
        );
      }

      await assertZeroLimeInDataView(page);
      await assertWcagAA(page, `Command Step ${stepNum} (BN)`);
    }
  });

  test("L6 & L10: URL persists stock and step across reload, and Dhaka South scope defaults dispatch to DSCC wards", async ({
    page,
  }) => {
    await page.goto("/dashboard?demo=1&tab=command&lang=en");
    await expect(page.getByTestId("command-center-view")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("provenance-model-version")).not.toHaveText("—", {
      timeout: 20_000,
    });

    // L6: Set stock 30% in Step 2, move to Step 3, reload -> Step 3 active and stock slider stays 30
    await page.getByTestId("command-step-2").click();
    await expect(page.getByTestId("stock-preset-30")).toBeVisible();
    await page.getByTestId("stock-preset-30").click();
    await expect(page.getByTestId("allocation-live-status")).toContainText("stock 30%", {
      timeout: 15_000,
    });
    await page.getByTestId("command-step-3").click();
    await expect(page.getByTestId("command-panel-3")).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("stock"))
      .toBe("30");

    await page.reload();
    await expect(page.getByTestId("command-panel-3")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("provenance-model-version")).not.toHaveText("—", {
      timeout: 20_000,
    });
    await page.getByTestId("command-step-2").click();
    await expect(page.getByTestId("stock-slider")).toHaveValue("30");

    // L10: Scope Dhaka South in Step 1 -> Step 5 default dispatch wards all start with DSCC_
    await page.getByTestId("command-step-1").click();
    await page.getByTestId("command-scope-select").selectOption("Dhaka South");
    await page.getByTestId("command-step-5").click();
    await expect(page.getByTestId("dispatch-notices-list")).toBeVisible({ timeout: 20_000 });
    const noticeCards = page.locator('[data-testid^="dispatch-notice-"]');
    await expect(noticeCards.first()).toBeVisible();
    const ids = await noticeCards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid") ?? ""),
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^dispatch-notice-DSCC_/);
    }
  });
});
