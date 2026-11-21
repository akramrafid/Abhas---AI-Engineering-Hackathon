import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const LIME_RGB = "rgb(212, 245, 60)";

export async function assertZeroLimeInDataView(page: Page) {
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

export async function assertWcagAA(page: Page, contextLabel: string) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target),
    })),
    `WCAG 2.2 A/AA violations on ${contextLabel}`,
  ).toEqual([]);
}
