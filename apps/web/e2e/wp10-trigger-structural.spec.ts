import { expect, test } from "@playwright/test";
import { assertWcagAA, assertZeroLimeInDataView } from "./helpers";

test.describe("WP10 Early-Action Trigger & Structural-Fix Planner (ADR-0020 / ADR-0021)", () => {
  test("Validation tab shows Early-action trigger card (rule, hit/FAR bars, lead time, Abhas vs rule)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?demo=1&tab=validation&lang=en");

    const card = page.getByTestId("early-action-trigger-card");
    await expect(card).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("trigger-rule-sentence")).toContainText("80 mm");
    await expect(page.getByTestId("trigger-rule-sentence")).toContainText("0.30");
    await expect(page.getByTestId("trigger-hit-far-bars")).toContainText("Hit rate");
    await expect(page.getByTestId("trigger-hit-far-bars")).toContainText("False-alarm ratio");
    await expect(page.getByTestId("trigger-lead-time")).toContainText("Lead-time quartiles");

    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Validation Early-Action Trigger Card");
  });

  test("Command Center Step 4 shows Build vs send panel with mandatory honesty label & ranked wards", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard?demo=1&tab=command&step=4&lang=en");

    const panel = page.getByTestId("build-vs-send-panel");
    await expect(panel).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("structural-disclaimer")).toContainText(
      "associations in simulated data, not causal real-world estimates",
    );

    const table = page.getByTestId("build-vs-send-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr").first()).toContainText("CCC_Ward_03");
    await expect(table).toContainText("Crew ROI");

    await assertZeroLimeInDataView(page);
    await assertWcagAA(page, "Command Center Build vs Send Panel");
  });
});
