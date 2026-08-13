import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { GALLERY_GROUPS } from "../../src/components/gallery/groups";
// TAGS and format() moved to a shared helper when the authenticated suite
// arrived — two copies of the tag list is how one of them quietly stops
// checking WCAG 2.2.
import { TAGS, format } from "../helpers/axe";

test.describe("accessibility", () => {
  // The matrix renders every specimen across 2 themes × 4 font steps. Once the
  // gallery passed ~16 components that became more DOM than axe-core can
  // analyse in one pass: it timed out at 30s, then crashed the browser process
  // and took the next test with it. Chunking by group keeps each run small and
  // coverage total. GALLERY_GROUPS is imported rather than hardcoded so a new
  // group cannot be added without being tested.
  for (const group of GALLERY_GROUPS) {
    test(`design-system matrix — ${group} (both themes x 4 font sizes)`, async ({ page }) => {
      // Playwright's 30s default is not enough for the biggest group.
      //
      // This is PROGRESS decision 6 happening a second time, one level down.
      // That decision chunked the matrix by `?group=` because a single page of
      // every specimen exceeded what axe could analyse in one pass. `layouts`
      // has now grown to seven whole-page compositions, and at 2 themes x 4
      // font steps that is 56 rendered screens in one DOM: axe finished it in
      // ~25s on Desktop Chrome and ran out of time at 30s on Pixel 7.
      //
      // Nothing is wrong with the page — the work simply takes longer than the
      // default allows, and a gate that fails on a stopwatch gets ignored (the
      // same lesson as the memory-scaled worker cap in playwright.config.ts).
      //
      // THE NEXT ADDITION TO `layouts` SHOULD SPLIT THE GROUP, not raise this
      // number again. Chunking is what decision 6 chose and it is still the
      // right answer; this buys headroom, not a policy.
      test.setTimeout(90_000);

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
