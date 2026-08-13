import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { GALLERY_GROUPS } from "../../src/components/gallery/groups";

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
  // The matrix renders every specimen across 2 themes × 4 font steps. Once the
  // gallery passed ~16 components that became more DOM than axe-core can
  // analyse in one pass: it timed out at 30s, then crashed the browser process
  // and took the next test with it. Chunking by group keeps each run small and
  // coverage total. GALLERY_GROUPS is imported rather than hardcoded so a new
  // group cannot be added without being tested.
  for (const group of GALLERY_GROUPS) {
    test(`design-system matrix — ${group} (both themes x 4 font sizes)`, async ({ page }) => {
      await page.goto(`/design-system?matrix=all&group=${group}`);
      await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();

      // axe evaluates colour-contrast against real computed styles, so the dark
      // panes are genuinely checked rather than just the ambient theme.
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(format(violations)).toEqual([]);
    });
  }

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
