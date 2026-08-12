import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Readable failure output — axe's raw objects are unusable in CI logs. */
function format(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}

test.describe("accessibility", () => {
  test("design-system full matrix (both themes x 4 font sizes)", async ({ page }) => {
    await page.goto("/design-system?matrix=all");
    await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();

    // One goto covers all 8 combinations because ?matrix=all renders them all,
    // and axe evaluates colour-contrast against real computed styles — so the
    // dark panes are genuinely checked, not just the ambient theme.
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(format(violations)).toEqual([]);
  });

  test("design-system default view", async ({ page }) => {
    await page.goto("/design-system");
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(format(violations)).toEqual([]);
  });

  for (const path of ["/", "/login", "/book", "/settings/appearance"]) {
    test(`public route ${path}`, async ({ page }) => {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(format(violations)).toEqual([]);
    });
  }

  test("dark theme is honoured server-side", async ({ page, context }) => {
    await context.addCookies([
      { name: "dc_theme", value: "dark", url: "http://127.0.0.1:3100" },
    ]);
    await page.goto("/settings/appearance");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(format(violations)).toEqual([]);
  });

  test("largest font step does not break contrast or structure", async ({ page, context }) => {
    await context.addCookies([
      { name: "dc_font", value: "xlarge", url: "http://127.0.0.1:3100" },
    ]);
    await page.goto("/settings/appearance");
    await expect(page.locator("html")).toHaveAttribute("data-font-size", "xlarge");

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(format(violations)).toEqual([]);
  });
});
